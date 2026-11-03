package hub

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
	"github.com/abcdlsj/cupola/internal/updater"
	"github.com/abcdlsj/cupola/internal/version"
)

func fakeReleaseServer(t *testing.T, tag string) *httptest.Server {
	t.Helper()
	asset := fmt.Sprintf("cupola_%s_%s_%s.tar.gz", tag, runtime.GOOS, runtime.GOARCH)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tag_name":     "v" + tag,
			"published_at": "2026-11-02T03:34:24Z",
			"body":         "A quieter log.",
			"assets": []map[string]string{{
				"name":                 asset,
				"browser_download_url": "https://example.com/v" + tag + "/" + asset,
			}},
		})
	}))
	t.Cleanup(server.Close)
	return server
}

func newUpdateHub(t *testing.T, api string, enabled bool) (*Hub, *httptest.Server) {
	t.Helper()
	t.Setenv("CUPOLA_ADMIN_PASSWORD", "test-password-123")
	instance, err := New(context.Background(), Config{
		DataDir:        t.TempDir(),
		WebDir:         t.TempDir(),
		Listen:         "127.0.0.1:0",
		PollInterval:   50 * time.Millisecond,
		UpdateDisabled: !enabled,
		UpdateRepo:     "abcdlsj/cupola",
		UpdateAPI:      api,
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(instance.routes)
	t.Cleanup(func() {
		server.Close()
		instance.Close()
	})
	return instance, server
}

func TestUpdateStatusReportsAnAvailableRelease(t *testing.T) {
	instance, server := newUpdateHub(t, fakeReleaseServer(t, "9.9.9").URL, true)
	c := testClient(t)
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	status, body := doJSON(t, c, http.MethodGet, server.URL+"/api/v1/update", nil, "")
	if status != http.StatusOK {
		t.Fatalf("GET /update = %d", status)
	}
	if body["available"] != true {
		t.Fatalf("available = %v, want true", body["available"])
	}
	latest, _ := body["latest"].(map[string]any)
	if latest["version"] != "9.9.9" {
		t.Fatalf("latest.version = %v", latest["version"])
	}
	if body["can_apply"] != true {
		t.Fatalf("can_apply = %v, want true", body["can_apply"])
	}
	requestPath, _, _ := instance.updatePaths()
	if _, err := os.Stat(requestPath); !os.IsNotExist(err) {
		t.Fatal("a status check wrote a request file")
	}
}

func TestUpdateApplyQueuesARequest(t *testing.T) {
	instance, server := newUpdateHub(t, fakeReleaseServer(t, "9.9.9").URL, true)
	c := testClient(t)
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	status, body := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/update", map[string]any{"version": "9.9.9"}, "")
	if status != http.StatusAccepted {
		t.Fatalf("POST /update = %d (%v)", status, body)
	}
	if body["queued"] != true || body["version"] != "9.9.9" {
		t.Fatalf("body = %v", body)
	}
	requestPath, _, _ := instance.updatePaths()
	request, err := updater.ReadRequest(requestPath)
	if err != nil {
		t.Fatalf("ReadRequest: %v", err)
	}
	if request.Version != "9.9.9" || request.BaseURL != "https://example.com/v9.9.9" {
		t.Fatalf("request = %+v", request)
	}
	if request.RequestedBy != "session" {
		t.Fatalf("RequestedBy = %q, want session", request.RequestedBy)
	}
	status, body = doJSON(t, c, http.MethodGet, server.URL+"/api/v1/update", nil, "")
	if status != http.StatusOK {
		t.Fatalf("GET /update = %d", status)
	}
	if _, ok := body["queued"]; !ok {
		t.Fatal("the queued request is not reported back")
	}
}

func TestUpdateCancelRemovesTheRequest(t *testing.T) {
	instance, server := newUpdateHub(t, fakeReleaseServer(t, "9.9.9").URL, true)
	c := testClient(t)
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/update", map[string]any{}, ""); status != http.StatusAccepted {
		t.Fatalf("POST /update = %d", status)
	}
	if status, _ := doJSON(t, c, http.MethodDelete, server.URL+"/api/v1/update", nil, ""); status != http.StatusOK {
		t.Fatalf("DELETE /update = %d", status)
	}
	requestPath, _, _ := instance.updatePaths()
	if _, err := os.Stat(requestPath); !os.IsNotExist(err) {
		t.Fatal("the request file survived a cancel")
	}
}

func TestUpdateApplyIsAdminOnly(t *testing.T) {
	_, server := newUpdateHub(t, fakeReleaseServer(t, "9.9.9").URL, true)
	status, _ := doJSON(t, testClient(t), http.MethodPost, server.URL+"/api/v1/update", map[string]any{}, "")
	if status != http.StatusUnauthorized {
		t.Fatalf("anonymous POST /update = %d, want 401", status)
	}
}

func TestUpdateApplyRejectsAnUnknownVersion(t *testing.T) {
	_, server := newUpdateHub(t, fakeReleaseServer(t, "9.9.9").URL, true)
	c := testClient(t)
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/update", map[string]any{"version": "0.0.1"}, "")
	if status != http.StatusBadRequest {
		t.Fatalf("POST /update with an unknown version = %d, want 400", status)
	}
}

func TestUpdateApplyRefusesTheRunningVersionUnlessForced(t *testing.T) {
	instance, server := newUpdateHub(t, fakeReleaseServer(t, version.Version).URL, true)
	c := testClient(t)
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/update", map[string]any{}, ""); status != http.StatusConflict {
		t.Fatalf("POST /update on the running version = %d, want 409", status)
	}
	status, body := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/update", map[string]any{"force": true}, "")
	if status != http.StatusAccepted {
		t.Fatalf("forced POST /update = %d (%v)", status, body)
	}
	requestPath, _, _ := instance.updatePaths()
	if _, err := os.Stat(requestPath); err != nil {
		t.Fatalf("forced request not written: %v", err)
	}
}

func TestUpdateApplyRefusesAHeldVersion(t *testing.T) {
	instance, server := newUpdateHub(t, fakeReleaseServer(t, "9.9.9").URL, true)
	_, _, holdPath := instance.updatePaths()
	if err := os.MkdirAll(filepath.Dir(holdPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := updater.WriteHold(holdPath, updater.Hold{Version: "9.9.9", Reason: "healthz 502"}); err != nil {
		t.Fatal(err)
	}
	c := testClient(t)
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	status, body := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/update", map[string]any{}, "")
	failure, _ := body["error"].(map[string]any)
	if status != http.StatusConflict || failure["code"] != "held" {
		t.Fatalf("POST /update on a held version = %d %v, want 409 held", status, body)
	}
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/update", map[string]any{"force": true}, ""); status != http.StatusAccepted {
		t.Fatalf("forced POST /update on a held version = %d, want 202", status)
	}
}

func TestUpdateStatusWhenDisabled(t *testing.T) {
	_, server := newUpdateHub(t, fakeReleaseServer(t, "9.9.9").URL, false)
	c := testClient(t)
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	status, body := doJSON(t, c, http.MethodGet, server.URL+"/api/v1/update", nil, "")
	if status != http.StatusOK {
		t.Fatalf("GET /update = %d", status)
	}
	if body["enabled"] != false || body["can_apply"] != false {
		t.Fatalf("disabled hub reported %v", body)
	}
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/update", map[string]any{}, ""); status != http.StatusConflict {
		t.Fatalf("POST /update on a disabled hub = %d, want 409", status)
	}
}

// The fill forecast used to scan seven days of disk samples on every poll and
// every fleet summary; it is a trend, so it is cached.
func TestFillForecastIsCachedPerNode(t *testing.T) {
	instance, _ := newUpdateHub(t, "", false)
	ctx := context.Background()
	now := time.Now().UnixMilli()
	weekAgo := now - 7*24*3600*1000
	save := func(ts int64, used uint64) {
		snap := &model.Snapshot{
			Ts:   ts,
			Node: model.NodeInfo{ID: "atlas", Name: "atlas"},
			Disks: []model.DiskStats{{
				Mount: "/", Device: "/dev/vda1", FsType: "ext4", Total: 100 << 30, Used: used, UsedPct: 50,
			}},
		}
		if err := instance.store.SaveSnapshot(ctx, snap, nil); err != nil {
			t.Fatal(err)
		}
	}
	// daysToFull needs a dozen points inside the seven-day window before it
	// will fit a line; an hour apart keeps them all in it.
	for hour := 0; hour < 36; hour++ {
		save(now-int64(35-hour)*3600*1000, uint64(40+hour/4)<<30)
	}
	_ = weekAgo

	growing := &model.Snapshot{Disks: []model.DiskStats{{Mount: "/", Total: 100 << 30, Used: 60 << 30}}}
	first := instance.fillForecast(ctx, "atlas", growing)
	if first <= 0 {
		t.Fatalf("forecast = %v days, want a positive trend", first)
	}
	// A different snapshot inside the TTL must come back from the cache.
	full := &model.Snapshot{Disks: []model.DiskStats{{Mount: "/", Total: 100 << 30, Used: 99 << 30}}}
	if got := instance.fillForecast(ctx, "atlas", full); got != first {
		t.Fatalf("second forecast = %v, want the cached %v", got, first)
	}
	if got := instance.fillForecast(ctx, "other", nil); got != 0 {
		t.Fatalf("forecast without a snapshot = %v, want 0", got)
	}
}
