package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func githubServer(t *testing.T, tag string, assets map[string]string, status int) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/abcdlsj/cupola/releases/latest" {
			http.NotFound(w, r)
			return
		}
		if status != http.StatusOK {
			w.WriteHeader(status)
			fmt.Fprint(w, `{"message":"Not Found"}`)
			return
		}
		payload := map[string]any{
			"tag_name":     tag,
			"published_at": "2026-11-02T03:34:24Z",
			"body":         "Fixes and a quieter log.",
			"assets":       []map[string]string{},
		}
		assetsOut := make([]map[string]string, 0, len(assets))
		for name, url := range assets {
			assetsOut = append(assetsOut, map[string]string{"name": name, "browser_download_url": url})
		}
		payload["assets"] = assetsOut
		_ = json.NewEncoder(w).Encode(payload)
	}))
	t.Cleanup(server.Close)
	return server
}

func TestCheckReadsGitHubLatest(t *testing.T) {
	base := "https://github.com/abcdlsj/cupola/releases/download/v1.0.2"
	server := githubServer(t, "v1.0.2", map[string]string{
		"cupola_1.0.2_linux_amd64.tar.gz": base + "/cupola_1.0.2_linux_amd64.tar.gz",
		"checksums.txt":                   base + "/checksums.txt",
	}, http.StatusOK)
	checker := New(Options{
		API:     server.URL,
		GOOS:    "linux",
		GOARCH:  "amd64",
		Enabled: true,
	})
	release, _, err := checker.Check(context.Background(), true)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if release.Version != "1.0.2" {
		t.Fatalf("Version = %q, want 1.0.2", release.Version)
	}
	if release.Asset != "cupola_1.0.2_linux_amd64.tar.gz" {
		t.Fatalf("Asset = %q", release.Asset)
	}
	if release.BaseURL != base {
		t.Fatalf("BaseURL = %q, want %q", release.BaseURL, base)
	}
	if release.Source != "github" {
		t.Fatalf("Source = %q", release.Source)
	}
}

func TestCheckFallsBackToTheVersionlessAlias(t *testing.T) {
	alias := "https://github.com/abcdlsj/cupola/releases/latest/download/cupola_linux_amd64.tar.gz"
	server := githubServer(t, "v1.0.2", map[string]string{
		"cupola_linux_amd64.tar.gz": alias,
	}, http.StatusOK)
	checker := New(Options{API: server.URL, GOOS: "linux", GOARCH: "amd64", Enabled: true})
	release, _, err := checker.Check(context.Background(), true)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if release.Asset != "cupola_linux_amd64.tar.gz" {
		t.Fatalf("Asset = %q", release.Asset)
	}
	if release.BaseURL != "https://github.com/abcdlsj/cupola/releases/latest/download" {
		t.Fatalf("BaseURL = %q", release.BaseURL)
	}
}

func TestCheckRejectsAReleaseWithoutAnAsset(t *testing.T) {
	server := githubServer(t, "v1.0.2", map[string]string{
		"cupola_1.0.2_windows_amd64.tar.gz": "https://example.com/x.tar.gz",
	}, http.StatusOK)
	checker := New(Options{API: server.URL, GOOS: "linux", GOARCH: "amd64", Enabled: true})
	if _, _, err := checker.Check(context.Background(), true); err == nil {
		t.Fatal("Check succeeded without a matching asset")
	}
}

func TestCheckCachesUntilForced(t *testing.T) {
	var hits int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tag_name": "v1.0.2",
			"assets": []map[string]string{{
				"name":                 "cupola_1.0.2_linux_amd64.tar.gz",
				"browser_download_url": "https://example.com/v1.0.2/cupola_1.0.2_linux_amd64.tar.gz",
			}},
		})
	}))
	defer server.Close()
	now := time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)
	checker := New(Options{
		API: server.URL, GOOS: "linux", GOARCH: "amd64", Enabled: true,
		TTL: time.Hour,
		Now: func() time.Time { return now },
	})
	if _, _, err := checker.Check(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	now = now.Add(30 * time.Minute)
	if _, _, err := checker.Check(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if hits != 1 {
		t.Fatalf("github was called %d times inside the TTL, want 1", hits)
	}
	now = now.Add(2 * time.Hour)
	if _, _, err := checker.Check(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if hits != 2 {
		t.Fatalf("github was called %d times after the TTL, want 2", hits)
	}
}

func TestCheckPrefersAStagedTarballWhenItIsNewer(t *testing.T) {
	dir := t.TempDir()
	writeTarball(t, filepath.Join(dir, "cupola_1.0.3_linux_amd64.tar.gz"), map[string]string{"cupola": "x"})
	if err := os.WriteFile(filepath.Join(dir, ChecksumFile), []byte("deadbeef  cupola_1.0.3_linux_amd64.tar.gz\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	server := githubServer(t, "v1.0.2", map[string]string{
		"cupola_1.0.2_linux_amd64.tar.gz": "https://example.com/v1.0.2/cupola_1.0.2_linux_amd64.tar.gz",
	}, http.StatusOK)
	checker := New(Options{API: server.URL, GOOS: "linux", GOARCH: "amd64", StagedDir: dir, Enabled: true})
	release, _, err := checker.Check(context.Background(), true)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if release.Version != "1.0.3" || release.Source != "staged" {
		t.Fatalf("release = %+v, want staged 1.0.3", release)
	}
	if release.BaseURL != "file://"+dir {
		t.Fatalf("BaseURL = %q", release.BaseURL)
	}
}

func TestCheckUsesStagedReleasesWhenGitHubIsUnreachable(t *testing.T) {
	dir := t.TempDir()
	writeTarball(t, filepath.Join(dir, "cupola_1.0.4_linux_amd64.tar.gz"), map[string]string{"cupola": "x"})
	if err := os.WriteFile(filepath.Join(dir, ChecksumFile), []byte("x  cupola_1.0.4_linux_amd64.tar.gz\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	server := githubServer(t, "v1.0.4", nil, http.StatusInternalServerError)
	checker := New(Options{API: server.URL, GOOS: "linux", GOARCH: "amd64", StagedDir: dir, Enabled: true})
	release, _, err := checker.Check(context.Background(), true)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if release.Version != "1.0.4" || release.Source != "staged" {
		t.Fatalf("release = %+v", release)
	}
}

func TestStagedReleasesNeedChecksums(t *testing.T) {
	dir := t.TempDir()
	writeTarball(t, filepath.Join(dir, "cupola_1.0.4_linux_amd64.tar.gz"), map[string]string{"cupola": "x"})
	checker := New(Options{GOOS: "linux", GOARCH: "amd64", StagedDir: dir, Enabled: true})
	if _, err := checker.stagedLatest(); err == nil {
		t.Fatal("a staged tarball without checksums.txt was accepted")
	}
}

func TestCheckDoesNothingWhenDisabled(t *testing.T) {
	checker := New(Options{API: "http://127.0.0.1:1", Enabled: false})
	release, _, err := checker.Check(context.Background(), true)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if release != nil {
		t.Fatalf("release = %+v, want nil", release)
	}
}

func TestDigest(t *testing.T) {
	checksums := "abc123  cupola_1.0.2_linux_amd64.tar.gz\n" +
		"0123456789012345678901234567890123456789012345678901234567890123 *cupola_linux_amd64.tar.gz\n"
	got, err := Digest(checksums, "cupola_linux_amd64.tar.gz")
	if err != nil {
		t.Fatalf("Digest: %v", err)
	}
	if got != "0123456789012345678901234567890123456789012345678901234567890123" {
		t.Fatalf("Digest = %q", got)
	}
	if _, err := Digest(checksums, "missing.tar.gz"); err == nil {
		t.Fatal("Digest accepted a missing asset")
	}
	if _, err := Digest(checksums, "cupola_1.0.2_linux_amd64.tar.gz"); err == nil {
		t.Fatal("Digest accepted a malformed sha256")
	}
}
