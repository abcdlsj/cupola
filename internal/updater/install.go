package updater

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/abcdlsj/cupola/internal/version"
)

const (
	maxTarballSize = 256 << 20
	maxExtractSize = 512 << 20
)

// InstallOptions is everything the privileged upgrader needs. The zero value
// of each field falls back to the layout in docs/DEPLOY.md.
type InstallOptions struct {
	RequestPath  string
	ResultPath   string
	HoldPath     string
	BinPath      string
	WebDir       string
	Service      string
	HealthURL    string
	HTTP         *http.Client
	Restart      func(ctx context.Context) error
	Probe        func(ctx context.Context) error
	Verify       func(ctx context.Context, binary, want string) error
	Now          func() time.Time
	ProbeTimeout time.Duration
	Log          *slog.Logger
}

func (o InstallOptions) withDefaults() InstallOptions {
	if o.RequestPath == "" {
		o.RequestPath = "/var/lib/cupola/update.request"
	}
	if o.ResultPath == "" {
		o.ResultPath = "/var/lib/cupola/update.result"
	}
	if o.HoldPath == "" {
		o.HoldPath = "/var/lib/cupola/update.hold"
	}
	if o.BinPath == "" {
		o.BinPath = "/opt/cupola/cupola"
	}
	if o.WebDir == "" {
		o.WebDir = "/opt/cupola/web"
	}
	if o.Service == "" {
		o.Service = "cupola-hub"
	}
	if o.HealthURL == "" {
		o.HealthURL = "http://127.0.0.1:8080/healthz"
	}
	if o.HTTP == nil {
		o.HTTP = &http.Client{Timeout: 60 * time.Second}
	}
	if o.Restart == nil {
		o.Restart = func(ctx context.Context) error {
			return run(ctx, "systemctl", "restart", o.Service)
		}
	}
	if o.Probe == nil {
		o.Probe = func(ctx context.Context) error {
			return waitHealthy(ctx, o.HTTP, o.HealthURL, o.ProbeTimeout)
		}
	}
	if o.Verify == nil {
		o.Verify = func(ctx context.Context, binary, want string) error {
			return runVersion(ctx, binary, want)
		}
	}
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.ProbeTimeout == 0 {
		o.ProbeTimeout = 60 * time.Second
	}
	if o.Log == nil {
		o.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return o
}

// Install consumes the request file, installs the requested release and
// restarts the service. A restart or health-check failure restores the
// previous binary, the previous web build and records a hold so the same
// version is not retried in a loop.
func Install(ctx context.Context, opt InstallOptions) (Result, error) {
	opt = opt.withDefaults()
	request, err := ReadRequest(opt.RequestPath)
	if err != nil {
		return Result{}, err
	}
	result := Result{From: version.Version, To: request.Version, At: opt.Now().UnixMilli()}

	finish := func(status string, cause error) (Result, error) {
		result.Status = status
		if cause != nil {
			result.Detail = cause.Error()
		}
		if err := WriteResult(opt.ResultPath, result); err != nil {
			opt.Log.Warn("write update result", "error", err.Error())
		}
		if err := RemoveRequest(opt.RequestPath); err != nil {
			opt.Log.Warn("remove update request", "error", err.Error())
		}
		if cause != nil {
			opt.Log.Error("upgrade failed", "version", request.Version, "status", status, "error", cause.Error())
			return result, cause
		}
		opt.Log.Info("upgrade installed", "from", result.From, "to", result.To, "web", result.Web)
		return result, nil
	}

	if hold, err := ReadHold(opt.HoldPath); err == nil && hold.Version == request.Version && !request.Force {
		return finish("failed", fmt.Errorf("version %s is held after a failed install (%s); request it with force to retry", hold.Version, hold.Reason))
	}

	// Stage beside the target binary: rename is only atomic within one
	// filesystem, and PrivateTmp would put /tmp on another one.
	staging, err := os.MkdirTemp(filepath.Dir(opt.BinPath), ".cupola-stage-")
	if err != nil {
		return finish("failed", err)
	}
	defer os.RemoveAll(staging)

	binary, web, err := stage(ctx, opt.HTTP, request, staging)
	if err != nil {
		return finish("failed", err)
	}
	result.Web = web != ""
	if err := opt.Verify(ctx, binary, request.Version); err != nil {
		return finish("failed", fmt.Errorf("staged binary: %w", err))
	}

	binBackup, err := replaceBinary(opt.BinPath, binary)
	if err != nil {
		return finish("failed", fmt.Errorf("install %s: %w", opt.BinPath, err))
	}
	webBackup := ""
	if web != "" {
		webBackup, err = replaceDir(opt.WebDir, web)
		if err != nil {
			restoreBinary(opt.BinPath, binBackup)
			return finish("failed", fmt.Errorf("install %s: %w", opt.WebDir, err))
		}
	}

	rollback := func(cause error) (Result, error) {
		restoreBinary(opt.BinPath, binBackup)
		if web != "" {
			restoreDir(opt.WebDir, webBackup)
		}
		if err := opt.Restart(ctx); err != nil {
			opt.Log.Error("restart after rollback", "error", err.Error())
		}
		if holdErr := WriteHold(opt.HoldPath, Hold{Version: request.Version, Reason: cause.Error(), At: opt.Now().UnixMilli()}); holdErr != nil {
			opt.Log.Warn("write update hold", "error", holdErr.Error())
		}
		return finish("rolled_back", cause)
	}

	if err := opt.Restart(ctx); err != nil {
		return rollback(fmt.Errorf("restart %s: %w", opt.Service, err))
	}
	if err := opt.Verify(ctx, opt.BinPath, request.Version); err != nil {
		return rollback(fmt.Errorf("installed binary: %w", err))
	}
	if err := opt.Probe(ctx); err != nil {
		return rollback(fmt.Errorf("health check: %w", err))
	}
	if err := ClearHold(opt.HoldPath); err != nil {
		opt.Log.Warn("clear update hold", "error", err.Error())
	}
	return finish("ok", nil)
}

// stage downloads the tarball, verifies it against checksums.txt from the same
// source and unpacks it.
func stage(ctx context.Context, client *http.Client, request Request, dir string) (string, string, error) {
	asset := filepath.Base(request.Asset)
	tarball := filepath.Join(dir, asset)
	if err := fetch(ctx, client, request.BaseURL, asset, tarball); err != nil {
		return "", "", err
	}
	checksums, err := fetchText(ctx, client, request.BaseURL, ChecksumFile)
	if err != nil {
		return "", "", fmt.Errorf("%s: %w", ChecksumFile, err)
	}
	want, err := Digest(checksums, asset)
	if err != nil {
		return "", "", err
	}
	got, err := fileDigest(tarball)
	if err != nil {
		return "", "", err
	}
	if !strings.EqualFold(got, want) {
		return "", "", fmt.Errorf("checksum mismatch for %s: got %s, want %s", asset, got, want)
	}
	return extract(tarball, dir)
}

// Digest picks one entry out of a sha256sum-style checksums file.
func Digest(checksums, asset string) (string, error) {
	for _, line := range strings.Split(checksums, "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) != 2 {
			continue
		}
		name := strings.TrimPrefix(fields[1], "*")
		if name == asset {
			if len(fields[0]) != sha256.Size*2 {
				return "", fmt.Errorf("%s: malformed checksum", asset)
			}
			return fields[0], nil
		}
	}
	return "", fmt.Errorf("%s is not listed in %s", asset, ChecksumFile)
}

func localPath(base string) (string, bool) {
	if dir, ok := strings.CutPrefix(base, "file://"); ok {
		return dir, true
	}
	if filepath.IsAbs(base) {
		return strings.TrimSuffix(base, "/"), true
	}
	return "", false
}

func fetch(ctx context.Context, client *http.Client, base, name, dest string) error {
	if dir, ok := localPath(base); ok {
		return copyFile(filepath.Join(dir, name), dest, 0o600)
	}
	response, err := get(ctx, client, strings.TrimRight(base, "/")+"/"+name)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	file, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	written, err := io.Copy(file, io.LimitReader(response.Body, maxTarballSize))
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if written == maxTarballSize {
		return fmt.Errorf("%s is larger than %d bytes", name, maxTarballSize)
	}
	return nil
}

func fetchText(ctx context.Context, client *http.Client, base, name string) (string, error) {
	if dir, ok := localPath(base); ok {
		body, err := os.ReadFile(filepath.Join(dir, name))
		return string(body), err
	}
	response, err := get(ctx, client, strings.TrimRight(base, "/")+"/"+name)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	return string(body), err
}

func get(ctx context.Context, client *http.Client, url string) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", "cupola-upgrade")
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, fmt.Errorf("%s: %s", url, response.Status)
	}
	return response, nil
}

// extract unpacks cupola and, when present, web/ from the tarball.
func extract(tarball, dir string) (string, string, error) {
	file, err := os.Open(tarball)
	if err != nil {
		return "", "", err
	}
	defer file.Close()
	gz, err := gzip.NewReader(file)
	if err != nil {
		return "", "", fmt.Errorf("%s: %w", filepath.Base(tarball), err)
	}
	defer gz.Close()

	binary, web := "", ""
	var total int64
	reader := tar.NewReader(gz)
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return "", "", fmt.Errorf("%s: %w", filepath.Base(tarball), err)
		}
		name := path.Clean(strings.TrimPrefix(header.Name, "./"))
		if name == "." || path.IsAbs(name) || name == ".." || strings.HasPrefix(name, "../") {
			continue
		}
		if header.Typeflag == tar.TypeDir {
			continue
		}
		total += header.Size
		if total > maxExtractSize {
			return "", "", fmt.Errorf("%s expands beyond %d bytes", filepath.Base(tarball), maxExtractSize)
		}
		switch {
		case name == "cupola":
			binary = filepath.Join(dir, "cupola")
			if err := writeFile(binary, reader, 0o755); err != nil {
				return "", "", err
			}
		case name == "web" || strings.HasPrefix(name, "web/"):
			target := filepath.Join(dir, name)
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return "", "", err
			}
			if err := writeFile(target, reader, 0o644); err != nil {
				return "", "", err
			}
			web = filepath.Join(dir, "web")
		}
	}
	if binary == "" {
		return "", "", fmt.Errorf("%s does not contain a cupola binary", filepath.Base(tarball))
	}
	return binary, web, nil
}

// replaceBinary copies src next to dest, then swaps them with two renames so a
// crash leaves either the old or the new binary, never a truncated one.
func replaceBinary(dest, src string) (string, error) {
	dir := filepath.Dir(dest)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	tmp := filepath.Join(dir, ".cupola.new")
	if err := copyFile(src, tmp, 0o755); err != nil {
		return "", err
	}
	backup := dest + ".prev"
	_ = os.Remove(backup)
	if _, err := os.Stat(dest); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			_ = os.Remove(tmp)
			return "", err
		}
		if err := os.Rename(tmp, dest); err != nil {
			return "", err
		}
		return "", nil
	}
	if err := os.Rename(dest, backup); err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Rename(backup, dest)
		return "", err
	}
	return backup, nil
}

func restoreBinary(dest, backup string) {
	if backup == "" {
		return
	}
	if err := os.Rename(backup, dest); err != nil {
		_ = copyFile(backup, dest, 0o755)
	}
}

// replaceDir swaps a directory of built assets. Same two renames as the binary.
func replaceDir(dest, src string) (string, error) {
	backup := dest + ".prev"
	if err := os.RemoveAll(backup); err != nil {
		return "", err
	}
	_, statErr := os.Stat(dest)
	hadOld := statErr == nil
	if hadOld {
		if err := os.Rename(dest, backup); err != nil {
			return "", err
		}
	}
	if err := os.Rename(src, dest); err != nil {
		if hadOld {
			_ = os.Rename(backup, dest)
		}
		return "", err
	}
	if !hadOld {
		backup = ""
	}
	return backup, nil
}

// restoreDir puts the previous assets back. An empty backup means there was no
// web build before, so the rollback removes the new one instead of leaving a
// newer UI in front of the old binary.
func restoreDir(dest, backup string) {
	_ = os.RemoveAll(dest)
	if backup == "" {
		return
	}
	_ = os.Rename(backup, dest)
}

func copyFile(src, dst string, perm os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		_ = os.Remove(dst)
		return err
	}
	if err := out.Sync(); err != nil {
		_ = out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	return os.Chmod(dst, perm)
}

func writeFile(dst string, reader io.Reader, perm os.FileMode) error {
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, reader); err != nil {
		_ = out.Close()
		return err
	}
	if err := out.Sync(); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

func fileDigest(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func run(ctx context.Context, name string, args ...string) error {
	output, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	if err != nil {
		detail := strings.TrimSpace(string(output))
		if detail == "" {
			return fmt.Errorf("%s: %w", name, err)
		}
		return fmt.Errorf("%s: %w: %s", name, err, detail)
	}
	return nil
}

// runVersion executes the staged binary so a corrupt or foreign-arch download
// is caught before anything is replaced.
func runVersion(ctx context.Context, binary, want string) error {
	output, err := exec.CommandContext(ctx, binary, "version").CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s version: %w", filepath.Base(binary), err)
	}
	line := firstLine(string(output), "")
	if !strings.Contains(line, "cupola "+want) {
		return fmt.Errorf("%s reports %q, want %s", filepath.Base(binary), line, want)
	}
	return nil
}

func waitHealthy(ctx context.Context, client *http.Client, url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var last error
	for {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		response, err := client.Do(request)
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return nil
			}
			err = fmt.Errorf("%s", response.Status)
		}
		last = err
		if time.Now().After(deadline) {
			return fmt.Errorf("%s is not healthy after %s: %v", url, timeout, last)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
}
