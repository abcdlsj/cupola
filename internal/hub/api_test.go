package hub

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

func fakeAgent(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	require := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Authorization") != "Bearer agent-token" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			next(w, r)
		}
	}
	mux.HandleFunc("GET /v1/snapshot", require(func(w http.ResponseWriter, r *http.Request) {
		snap := model.Snapshot{
			Ts:   time.Now().UnixMilli(),
			Node: model.NodeInfo{ID: "test", Name: "test", Platform: "Ubuntu", Kernel: "6.8", Arch: "amd64", AgentVersion: "1.0.0"},
			CPU:  model.CPUStats{Percent: 55, Load1: 1.5, Procs: 100},
			Memory: model.MemoryStats{Total: 16 << 30, Used: 8 << 30, UsedPercent: 50},
			Disks:  []model.DiskStats{{Mount: "/", Total: 100 << 30, Used: 50 << 30, UsedPct: 50}},
			Agents: []model.AgentSession{{ID: "test-1", Type: "codex", PID: 1}},
		}
		_ = json.NewEncoder(w).Encode(snap)
	}))
	mux.HandleFunc("GET /v1/actions", require(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"actions": []model.Action{{
			ID: "noop", Name: "Noop", Type: "script", AllowAPI: true,
		}}})
	}))
	mux.HandleFunc("POST /v1/actions/noop/run", require(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(model.ActionResult{RunID: "run-1", ActionID: "noop", OK: true, ExitCode: 0, DurationMs: 12, Stdout: "ok"})
	}))
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func newTestHub(t *testing.T) (*Hub, *httptest.Server) {
	t.Helper()
	t.Setenv("CUPOLA_ADMIN_PASSWORD", "test-password-123")
	hub, err := New(context.Background(), Config{
		DataDir:      t.TempDir(),
		WebDir:       t.TempDir(),
		Listen:       "127.0.0.1:0",
		PollInterval: 50 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(hub.routes)
	t.Cleanup(func() {
		server.Close()
		hub.Close()
	})
	return hub, server
}

func testClient(t *testing.T) *http.Client {
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Client{Jar: jar}
}

func doJSON(t *testing.T, httpClient *http.Client, method, url string, body any, bearer string) (int, map[string]any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		payload, _ := json.Marshal(body)
		reader = bytes.NewReader(payload)
	}
	request, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		request.Header.Set("Authorization", "Bearer "+bearer)
	}
	response, err := httpClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	var decoded map[string]any
	_ = json.Unmarshal(raw, &decoded)
	return response.StatusCode, decoded
}

func doRaw(t *testing.T, httpClient *http.Client, url string) (int, []byte) {
	t.Helper()
	response, err := httpClient.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	return response.StatusCode, body
}

func TestEndToEnd(t *testing.T) {
	agentServer := fakeAgent(t)
	hub, server := newTestHub(t)
	c := testClient(t)

	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/nodes", map[string]any{
		"id": "test", "name": "Test", "url": agentServer.URL, "token": "agent-token",
	}, "")
	if status != http.StatusCreated {
		t.Fatalf("add node = %d", status)
	}
	hub.poller.pollAll(context.Background())

	status, summary := doJSON(t, c, http.MethodGet, server.URL+"/api/v1/fleet/summary", nil, "")
	if status != http.StatusOK {
		t.Fatalf("summary = %d", status)
	}
	nodes := summary["nodes"].([]any)
	if len(nodes) != 1 {
		t.Fatalf("nodes = %d", len(nodes))
	}
	health := nodes[0].(map[string]any)["health"].(map[string]any)
	if health["status"] != "healthy" || health["cpu_pct"].(float64) != 55 {
		t.Fatalf("health = %+v", health)
	}

	status, node := doJSON(t, c, http.MethodGet, server.URL+"/api/v1/nodes/test", nil, "")
	if status != http.StatusOK || node["snapshot"] == nil {
		t.Fatalf("node = %d %+v", status, node)
	}
	status, series := doJSON(t, c, http.MethodGet, server.URL+"/api/v1/nodes/test/series?metric=cpu&range=1h", nil, "")
	if status != http.StatusOK || len(series["points"].([]any)) == 0 {
		t.Fatalf("series = %d %+v", status, series)
	}
	status, actions := doJSON(t, c, http.MethodGet, server.URL+"/api/v1/nodes/test/actions", nil, "")
	if status != http.StatusOK || len(actions["actions"].([]any)) != 1 {
		t.Fatalf("actions = %d %+v", status, actions)
	}

	status, created := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/tokens", map[string]any{
		"name": "curl", "scopes": []string{"actions:run"}, "node_ids": []string{"test"}, "action_ids": []string{"noop"},
	}, "")
	if status != http.StatusCreated {
		t.Fatalf("token = %d %+v", status, created)
	}
	bearer := created["token"].(string)
	// A token client carries no admin cookie, exactly like curl.
	tokenClient := testClient(t)

	status, result := doJSON(t, tokenClient, http.MethodPost, server.URL+"/api/v1/nodes/test/actions/noop/run", nil, bearer)
	if status != http.StatusOK || result["ok"] != true {
		t.Fatalf("run = %d %+v", status, result)
	}
	status, rawRuns := doRaw(t, c, server.URL+"/api/v1/nodes/test/action-runs")
	var runs []model.ActionRun
	_ = json.Unmarshal(rawRuns, &runs)
	if status != http.StatusOK || len(runs) != 1 {
		t.Fatalf("runs = %d %+v", status, runs)
	}
	status, rawEvents := doRaw(t, c, server.URL+"/api/v1/events?node=test")
	var events []model.Event
	_ = json.Unmarshal(rawEvents, &events)
	if status != http.StatusOK || len(events) != 1 {
		t.Fatalf("events = %d %+v", status, events)
	}

	status, restricted := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/tokens", map[string]any{
		"name": "other", "scopes": []string{"actions:run"}, "action_ids": []string{"wake"},
	}, "")
	if status != http.StatusCreated {
		t.Fatalf("token = %d", status)
	}
	status, _ = doJSON(t, tokenClient, http.MethodPost, server.URL+"/api/v1/nodes/test/actions/noop/run", nil, restricted["token"].(string))
	if status != http.StatusForbidden {
		t.Fatalf("allowlist run = %d, want 403", status)
	}
	status, _ = doJSON(t, c, http.MethodPost, server.URL+"/api/v1/nodes/test/actions/noop/run", nil, "")
	if status != http.StatusOK {
		t.Fatalf("admin run = %d", status)
	}
}

func TestJoinFlow(t *testing.T) {
	agentServer := fakeAgent(t)
	hub, server := newTestHub(t)
	c := testClient(t)
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login = %d", status)
	}
	status, created := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/join/codes", map[string]any{
		"id": "joined", "name": "Joined", "labels": []string{"new"},
	}, "")
	if status != http.StatusCreated {
		t.Fatalf("create code = %d %+v", status, created)
	}
	code := created["code"].(string)
	commands := created["commands"].(map[string]any)
	if !strings.Contains(commands["linux"].(string), "--code "+code) {
		t.Fatalf("linux command missing the code: %v", commands["linux"])
	}

	// Unknown code is refused, and the public endpoint needs no session.
	anon := testClient(t)
	status, _ = doJSON(t, anon, http.MethodPost, server.URL+"/api/v1/join", map[string]any{
		"code": "WRONG", "token": "agent-token", "url": agentServer.URL,
	}, "")
	if status != http.StatusBadRequest {
		t.Fatalf("bad code = %d, want 400", status)
	}

	status, joined := doJSON(t, anon, http.MethodPost, server.URL+"/api/v1/join", map[string]any{
		"code": code, "token": "agent-token", "url": agentServer.URL, "os": "linux", "arch": "amd64",
	}, "")
	if status != http.StatusOK || joined["node_url"] == "" {
		t.Fatalf("join = %d %+v", status, joined)
	}

	// The code is single use.
	status, _ = doJSON(t, anon, http.MethodPost, server.URL+"/api/v1/join", map[string]any{
		"code": code, "token": "agent-token", "url": agentServer.URL,
	}, "")
	if status != http.StatusBadRequest {
		t.Fatalf("reused code = %d, want 400", status)
	}

	status, info := doJSON(t, c, http.MethodGet, server.URL+"/api/v1/join/joined/status", nil, "")
	if status != http.StatusOK || info["joined"] != false {
		t.Fatalf("status before poll = %d %+v", status, info)
	}
	hub.poller.pollAll(context.Background())
	status, info = doJSON(t, c, http.MethodGet, server.URL+"/api/v1/join/joined/status", nil, "")
	if status != http.StatusOK || info["joined"] != true {
		t.Fatalf("status after poll = %d %+v", status, info)
	}
	// The install script is served with this hub's base URL.
	response, err := anon.Get(server.URL + "/install.sh")
	if err == nil { defer response.Body.Close() }
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("install.sh = %v", err)
	}
}
