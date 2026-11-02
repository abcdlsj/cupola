// Package updater resolves the newest published release and performs the
// privileged install of it.
//
// The hub is not allowed to replace its own binary (systemd mounts the install
// directory read-only and drops privileges), so the split is deliberate: the
// hub only resolves a release and writes a request file; a root oneshot unit
// runs "cupola upgrade" and owns the download, the swap and the rollback.
package updater

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

const (
	// DefaultRepo is the GitHub repository that publishes the binaries.
	DefaultRepo = "abcdlsj/cupola"
	// DefaultAPI is the GitHub REST endpoint; CUPOLA_UPDATE_API overrides it
	// for tests and GitHub Enterprise.
	DefaultAPI = "https://api.github.com"
	// DefaultTTL is how long a resolved release is trusted before the hub asks
	// GitHub again.
	DefaultTTL = time.Hour
	// ChecksumFile is published beside every tarball.
	ChecksumFile = "checksums.txt"

	maxNotes = 2000
)

// Release is one upgrade candidate: a tarball that contains the binary and,
// from v1.0.2 on, the built PWA in web/.
type Release struct {
	Version     string `json:"version"`
	Tag         string `json:"tag"`
	PublishedAt string `json:"published_at,omitempty"`
	Notes       string `json:"notes,omitempty"`
	Asset       string `json:"asset"`
	BaseURL     string `json:"base_url"`
	Source      string `json:"source"`
}

// Options configure a Checker.
type Options struct {
	Repo      string
	API       string
	Token     string
	StagedDir string
	GOOS      string
	GOARCH    string
	Enabled   bool
	TTL       time.Duration
	HTTP      *http.Client
	Now       func() time.Time
}

// Checker resolves the newest release and caches the answer for TTL. It is
// safe for concurrent use.
type Checker struct {
	opt Options

	mu       sync.Mutex
	cached   *Release
	cachedAt time.Time
}

// New builds a Checker from the hub configuration.
func New(opt Options) *Checker {
	if opt.Repo == "" {
		opt.Repo = DefaultRepo
	}
	if opt.API == "" {
		opt.API = DefaultAPI
	}
	if opt.GOOS == "" {
		opt.GOOS = runtime.GOOS
	}
	if opt.GOARCH == "" {
		opt.GOARCH = runtime.GOARCH
	}
	if opt.TTL <= 0 {
		opt.TTL = DefaultTTL
	}
	if opt.HTTP == nil {
		opt.HTTP = &http.Client{Timeout: 15 * time.Second}
	}
	if opt.Now == nil {
		opt.Now = time.Now
	}
	return &Checker{opt: opt}
}

// Enabled reports whether update checks are configured.
func (c *Checker) Enabled() bool { return c != nil && c.opt.Enabled }

// Repo is the GitHub repository the checker reads.
func (c *Checker) Repo() string { return c.opt.Repo }

// AssetName is the platform tarball for a version. The release workflow
// publishes both this and a version-less alias.
func (c *Checker) AssetName(version string) string {
	return fmt.Sprintf("cupola_%s_%s_%s.tar.gz", version, c.opt.GOOS, c.opt.GOARCH)
}

// Check returns the newest release it can resolve, the time the answer was
// produced and any error. A failed check may still return the previous
// cached release, which is better than showing nothing.
func (c *Checker) Check(ctx context.Context, force bool) (*Release, time.Time, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.opt.Now()
	if !c.opt.Enabled {
		return nil, time.Time{}, nil
	}
	if !force && c.cached != nil && now.Sub(c.cachedAt) < c.opt.TTL {
		return c.cached, c.cachedAt, nil
	}
	release, err := c.resolve(ctx)
	if err != nil {
		return c.cached, c.cachedAt, err
	}
	c.cached = release
	c.cachedAt = now
	return release, now, nil
}

// resolve prefers GitHub and falls back to a locally staged tarball, so a host
// without outbound access can still be upgraded from /var/lib/cupola/updates.
func (c *Checker) resolve(ctx context.Context) (*Release, error) {
	githubRelease, githubErr := c.githubLatest(ctx)
	staged, stagedErr := c.stagedLatest()
	switch {
	case githubErr == nil && staged != nil && Newer(staged.Version, githubRelease.Version):
		return staged, nil
	case githubErr == nil:
		return githubRelease, nil
	case staged != nil:
		return staged, nil
	case stagedErr != nil && !errors.Is(stagedErr, os.ErrNotExist):
		return nil, fmt.Errorf("%v; staged releases: %v", githubErr, stagedErr)
	default:
		return nil, githubErr
	}
}

type githubRelease struct {
	TagName     string `json:"tag_name"`
	PublishedAt string `json:"published_at"`
	Body        string `json:"body"`
	Assets      []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

func (c *Checker) githubLatest(ctx context.Context) (*Release, error) {
	endpoint := strings.TrimRight(c.opt.API, "/") + "/repos/" + c.opt.Repo + "/releases/latest"
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "cupola-hub")
	if c.opt.Token != "" {
		request.Header.Set("Authorization", "Bearer "+c.opt.Token)
	}
	response, err := c.opt.HTTP.Do(request)
	if err != nil {
		return nil, fmt.Errorf("github: %w", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("github: %w", err)
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github: %s", strings.TrimSpace(firstLine(string(body), response.Status)))
	}
	var payload githubRelease
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("github: %w", err)
	}
	version := strings.TrimPrefix(payload.TagName, "v")
	if version == "" {
		return nil, errors.New("github: release has no tag")
	}
	want := c.AssetName(version)
	alias := fmt.Sprintf("cupola_%s_%s.tar.gz", c.opt.GOOS, c.opt.GOARCH)
	asset, url := want, ""
	for _, candidate := range payload.Assets {
		if candidate.Name == want {
			asset, url = candidate.Name, candidate.URL
			break
		}
		if candidate.Name == alias {
			asset, url = candidate.Name, candidate.URL
		}
	}
	if url == "" {
		return nil, fmt.Errorf("github: release %s has no %s asset", payload.TagName, want)
	}
	return &Release{
		Version:     version,
		Tag:         payload.TagName,
		PublishedAt: payload.PublishedAt,
		Notes:       truncate(payload.Body, maxNotes),
		Asset:       asset,
		BaseURL:     strings.TrimSuffix(url, "/"+asset),
		Source:      "github",
	}, nil
}

var stagedPattern = regexp.MustCompile(`^cupola_([0-9][0-9A-Za-z.\-]*)_([a-z]+)_([a-z0-9]+)\.tar\.gz$`)

// stagedLatest reads the highest version dropped into the staging directory.
// A tarball without checksums.txt beside it is ignored: the upgrader refuses
// to install anything it cannot verify.
func (c *Checker) stagedLatest() (*Release, error) {
	dir := c.opt.StagedDir
	if dir == "" {
		return nil, os.ErrNotExist
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(filepath.Join(dir, ChecksumFile)); err != nil {
		return nil, os.ErrNotExist
	}
	var best *Release
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		match := stagedPattern.FindStringSubmatch(entry.Name())
		if match == nil || match[2] != c.opt.GOOS || match[3] != c.opt.GOARCH {
			continue
		}
		candidate := &Release{
			Version: match[1],
			Tag:     "v" + match[1],
			Asset:   entry.Name(),
			BaseURL: "file://" + dir,
			Source:  "staged",
		}
		if best == nil || Newer(candidate.Version, best.Version) {
			best = candidate
		}
	}
	if best == nil {
		return nil, os.ErrNotExist
	}
	return best, nil
}

// Writable reports whether the hub can write the request file in dir.
func Writable(dir string) bool {
	file, err := os.CreateTemp(dir, ".writable-")
	if err != nil {
		return false
	}
	name := file.Name()
	_ = file.Close()
	_ = os.Remove(name)
	return true
}

func truncate(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	return strings.TrimSpace(s[:limit]) + "…"
}

func firstLine(s, fallback string) string {
	if line, _, _ := strings.Cut(strings.TrimSpace(s), "\n"); line != "" {
		return line
	}
	return fallback
}
