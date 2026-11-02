package updater

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTarball(t *testing.T, path string, files map[string]string) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(file)
	writer := tar.NewWriter(gz)
	for name, body := range files {
		header := &tar.Header{Name: name, Mode: 0o755, Size: int64(len(body)), Typeflag: tar.TypeReg}
		if err := writer.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func writeChecksumsFor(t *testing.T, dir, asset string) {
	t.Helper()
	body, err := os.ReadFile(filepath.Join(dir, asset))
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(body)
	line := hex.EncodeToString(sum[:]) + "  " + asset + "\n"
	if err := os.WriteFile(filepath.Join(dir, ChecksumFile), []byte(line), 0o644); err != nil {
		t.Fatal(err)
	}
}

type fixture struct {
	dir       string
	sourceDir string
	binPath   string
	webDir    string
	request   string
	result    string
	hold      string
	asset     string
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	root := t.TempDir()
	f := fixture{
		dir:       root,
		sourceDir: filepath.Join(root, "updates"),
		binPath:   filepath.Join(root, "opt", "cupola"),
		webDir:    filepath.Join(root, "opt", "web"),
		request:   filepath.Join(root, "update.request"),
		result:    filepath.Join(root, "update.result"),
		hold:      filepath.Join(root, "update.hold"),
		asset:     "cupola_1.0.2_linux_amd64.tar.gz",
	}
	for _, dir := range []string{f.sourceDir, filepath.Dir(f.binPath), f.webDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(f.binPath, []byte("old-binary"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(f.webDir, "index.html"), []byte("old-web"), 0o644); err != nil {
		t.Fatal(err)
	}
	writeTarball(t, filepath.Join(f.sourceDir, f.asset), map[string]string{
		"cupola":            "new-binary",
		"web/index.html":    "new-web",
		"web/assets/app.js": "// new",
	})
	writeChecksumsFor(t, f.sourceDir, f.asset)
	if err := WriteRequest(f.request, Request{
		Version: "1.0.2", Asset: f.asset, BaseURL: "file://" + f.sourceDir, Source: "staged",
	}); err != nil {
		t.Fatal(err)
	}
	return f
}

func (f fixture) options(t *testing.T, restart, probe, verify func(ctx context.Context) error) InstallOptions {
	t.Helper()
	return InstallOptions{
		RequestPath: f.request,
		ResultPath:  f.result,
		HoldPath:    f.hold,
		BinPath:     f.binPath,
		WebDir:      f.webDir,
		Service:     "cupola-hub",
		Restart:     func(context.Context) error { return restart(context.Background()) },
		Probe:       func(context.Context) error { return probe(context.Background()) },
		Verify:      func(context.Context, string, string) error { return verify(context.Background()) },
	}
}

func ok(context.Context) error { return nil }

func readFile(t *testing.T, path string) string {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

func TestInstallReplacesBinaryAndWeb(t *testing.T) {
	f := newFixture(t)
	restarts := 0
	result, err := Install(context.Background(), f.options(t,
		func(context.Context) error { restarts++; return nil }, ok, ok))
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if result.Status != "ok" {
		t.Fatalf("Status = %q, want ok (%s)", result.Status, result.Detail)
	}
	if !result.Web {
		t.Fatal("Web = false, want true")
	}
	if result.To != "1.0.2" {
		t.Fatalf("To = %q", result.To)
	}
	if got := readFile(t, f.binPath); got != "new-binary" {
		t.Fatalf("binary = %q, want new-binary", got)
	}
	if info, err := os.Stat(f.binPath); err != nil || info.Mode().Perm() != 0o755 {
		t.Fatalf("binary mode = %v, err %v", info.Mode(), err)
	}
	if got := readFile(t, filepath.Join(f.webDir, "index.html")); got != "new-web" {
		t.Fatalf("web = %q, want new-web", got)
	}
	if got := readFile(t, filepath.Join(f.webDir, "assets", "app.js")); got != "// new" {
		t.Fatalf("nested asset = %q", got)
	}
	if restarts != 1 {
		t.Fatalf("restart called %d times, want 1", restarts)
	}
	if _, err := os.Stat(f.request); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("the request file survived a successful install")
	}
	if _, err := os.Stat(f.hold); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a hold file was written for a successful install")
	}
	stored, err := ReadResult(f.result)
	if err != nil || stored.Status != "ok" {
		t.Fatalf("result file = %+v, %v", stored, err)
	}
}

func TestInstallRollsBackWhenTheHealthCheckFails(t *testing.T) {
	f := newFixture(t)
	restarts := 0
	result, err := Install(context.Background(), f.options(t,
		func(context.Context) error { restarts++; return nil },
		func(context.Context) error { return errors.New("healthz 502") },
		ok))
	if err == nil {
		t.Fatal("Install succeeded with a failing health check")
	}
	if result.Status != "rolled_back" {
		t.Fatalf("Status = %q, want rolled_back", result.Status)
	}
	if got := readFile(t, f.binPath); got != "old-binary" {
		t.Fatalf("binary after rollback = %q, want old-binary", got)
	}
	if got := readFile(t, filepath.Join(f.webDir, "index.html")); got != "old-web" {
		t.Fatalf("web after rollback = %q, want old-web", got)
	}
	if restarts != 2 {
		t.Fatalf("restart called %d times, want 2 (install + rollback)", restarts)
	}
	hold, holdErr := ReadHold(f.hold)
	if holdErr != nil || hold.Version != "1.0.2" {
		t.Fatalf("hold = %+v, %v", hold, holdErr)
	}
	if _, err := os.Stat(f.request); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("the request file survived a rollback")
	}
}

func TestInstallRefusesAHeldVersion(t *testing.T) {
	f := newFixture(t)
	if err := WriteHold(f.hold, Hold{Version: "1.0.2", Reason: "healthz 502"}); err != nil {
		t.Fatal(err)
	}
	if err := WriteRequest(f.request, Request{Version: "1.0.2", Asset: f.asset, BaseURL: "file://" + f.sourceDir}); err != nil {
		t.Fatal(err)
	}
	restarts := 0
	if _, err := Install(context.Background(), f.options(t,
		func(context.Context) error { restarts++; return nil }, ok, ok)); err == nil {
		t.Fatal("Install retried a held version")
	}
	if restarts != 0 {
		t.Fatalf("restart called %d times, want 0", restarts)
	}
	if got := readFile(t, f.binPath); got != "old-binary" {
		t.Fatalf("binary = %q, want untouched", got)
	}
}

func TestInstallAcceptsAHeldVersionWhenForced(t *testing.T) {
	f := newFixture(t)
	if err := WriteHold(f.hold, Hold{Version: "1.0.2", Reason: "healthz 502"}); err != nil {
		t.Fatal(err)
	}
	if err := WriteRequest(f.request, Request{Version: "1.0.2", Asset: f.asset, BaseURL: "file://" + f.sourceDir, Force: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := Install(context.Background(), f.options(t, ok, ok, ok)); err != nil {
		t.Fatalf("Install: %v", err)
	}
	if got := readFile(t, f.binPath); got != "new-binary" {
		t.Fatalf("binary = %q, want new-binary", got)
	}
}

func TestInstallRejectsABadChecksum(t *testing.T) {
	f := newFixture(t)
	if err := os.WriteFile(filepath.Join(f.sourceDir, ChecksumFile),
		[]byte(strings.Repeat("0", 64)+"  "+f.asset+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Install(context.Background(), f.options(t, ok, ok, ok)); err == nil {
		t.Fatal("Install accepted a tarball that did not match checksums.txt")
	}
	if got := readFile(t, f.binPath); got != "old-binary" {
		t.Fatalf("binary = %q, want untouched", got)
	}
}

func TestInstallRejectsATarballWithoutABinary(t *testing.T) {
	f := newFixture(t)
	asset := "cupola_1.0.2_linux_amd64.tar.gz"
	writeTarball(t, filepath.Join(f.sourceDir, asset), map[string]string{"web/index.html": "only web"})
	writeChecksumsFor(t, f.sourceDir, asset)
	if _, err := Install(context.Background(), f.options(t, ok, ok, ok)); err == nil {
		t.Fatal("Install accepted a tarball without cupola in it")
	}
}

func TestInstallSkipsTheWebBuildWhenTheTarballHasNone(t *testing.T) {
	f := newFixture(t)
	asset := "cupola_1.0.2_linux_amd64.tar.gz"
	writeTarball(t, filepath.Join(f.sourceDir, asset), map[string]string{"cupola": "new-binary"})
	writeChecksumsFor(t, f.sourceDir, asset)
	result, err := Install(context.Background(), f.options(t, ok, ok, ok))
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if result.Web {
		t.Fatal("Web = true for a binary-only tarball")
	}
	if got := readFile(t, filepath.Join(f.webDir, "index.html")); got != "old-web" {
		t.Fatalf("web = %q, want the previous build", got)
	}
}

func TestRollbackRemovesAWebBuildThatDidNotExistBefore(t *testing.T) {
	f := newFixture(t)
	if err := os.RemoveAll(f.webDir); err != nil {
		t.Fatal(err)
	}
	result, err := Install(context.Background(), f.options(t, ok,
		func(context.Context) error { return errors.New("healthz 502") }, ok))
	if err == nil {
		t.Fatal("Install succeeded with a failing health check")
	}
	if result.Status != "rolled_back" {
		t.Fatalf("Status = %q, want rolled_back", result.Status)
	}
	if _, err := os.Stat(f.webDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("rollback left a web build that was not there before")
	}
	if got := readFile(t, f.binPath); got != "old-binary" {
		t.Fatalf("binary after rollback = %q", got)
	}
}
