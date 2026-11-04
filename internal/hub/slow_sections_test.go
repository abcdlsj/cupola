package hub

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

func partAgent(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	auth := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Authorization") != "Bearer agent-token" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			next(w, r)
		}
	}
	// The slim snapshot: no services, no ports.
	mux.HandleFunc("GET /v1/snapshot", auth(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(model.Snapshot{Ts: 7, Node: model.NodeInfo{ID: "test"}})
	}))
	mux.HandleFunc("GET /v1/services", auth(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ts":       7,
			"services": []model.Service{{Name: "jellyfin.service", ActiveState: "active"}},
		})
	}))
	mux.HandleFunc("GET /v1/ports", auth(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ts":    7,
			"ports": []model.Port{{Proto: "tcp", Port: 8096}},
		})
	}))
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestMergeSlowSectionsFillsServicesAndPorts(t *testing.T) {
	agent := partAgent(t)
	hub, _ := newTestHub(t)
	endpoint := nodeEndpoint{HTTP: &http.Client{Timeout: 2 * time.Second}, Base: agent.URL, Token: "agent-token"}

	snap := &model.Snapshot{Ts: 7}
	hub.poller.mergeSlowSections(context.Background(), "test", endpoint, snap)
	if len(snap.Services) != 1 || snap.Services[0].Name != "jellyfin.service" {
		t.Fatalf("services = %+v", snap.Services)
	}
	if len(snap.Ports) != 1 || snap.Ports[0].Port != 8096 {
		t.Fatalf("ports = %+v", snap.Ports)
	}

	// Inside the refresh window the cached copy answers, even when the agent is
	// gone: a failed part fetch must not blank the panel.
	agent.Close()
	again := &model.Snapshot{Ts: 8}
	hub.poller.mergeSlowSections(context.Background(), "test", endpoint, again)
	if len(again.Services) != 1 || len(again.Ports) != 1 {
		t.Fatalf("cache lost the slow sections: %+v", again)
	}
}

func TestMergeSlowSectionsCachesASlimSnapshot(t *testing.T) {
	agent := partAgent(t)
	hub, _ := newTestHub(t)
	endpoint := nodeEndpoint{HTTP: &http.Client{Timeout: 2 * time.Second}, Base: agent.URL, Token: "agent-token"}
	snap, err := fetchSnapshot(context.Background(), endpoint)
	if err != nil {
		t.Fatalf("fetchSnapshot: %v", err)
	}
	if len(snap.Services) != 0 {
		t.Fatalf("the poll path asked for the full snapshot: %+v", snap.Services)
	}
	hub.poller.mergeSlowSections(context.Background(), "test", endpoint, snap)
	if len(snap.Services) != 1 {
		t.Fatalf("merge did not fill services: %+v", snap.Services)
	}
}

func TestProcessesAreFetchedOnDemandAndCached(t *testing.T) {
	var fetches int
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/processes", func(w http.ResponseWriter, r *http.Request) {
		fetches++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ts":        7,
			"processes": []model.Process{{PID: 42, Name: "codex"}},
			"agents":    []model.AgentSession{{ID: "test-42", Type: "codex"}},
		})
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	hub, _ := newTestHub(t)
	node := model.NodeRecord{ID: "test", Name: "test", Mode: "pull", URL: server.URL}
	sealed, err := encrypt(hub.keys.key, []byte("agent-token"))
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.store.UpsertNode(context.Background(), node, sealed, "hash"); err != nil {
		t.Fatal(err)
	}

	hub.poller.refreshProcesses(context.Background(), "test", processesOnDemand)
	hub.poller.refreshProcesses(context.Background(), "test", processesOnDemand)
	if fetches != 1 {
		t.Fatalf("fetched %d times, want 1: the second call is inside the throttle", fetches)
	}

	snap := &model.Snapshot{Ts: 7}
	fake := nodeEndpoint{HTTP: &http.Client{Timeout: 2 * time.Second}, Base: server.URL, Token: "agent-token"}
	hub.poller.mergeSlowSections(context.Background(), "test", fake, snap)
	if len(snap.Processes) != 1 || snap.Processes[0].Name != "codex" {
		t.Fatalf("processes not merged into the snapshot: %+v", snap.Processes)
	}
	if len(snap.Agents) != 1 {
		t.Fatalf("agents not merged into the snapshot: %+v", snap.Agents)
	}
}

// An older agent (or a test double) that ignores ?slim=1 still sends services
// inside the snapshot; if its part endpoint is missing, the merge must keep
// what arrived instead of blanking the panel.
func TestMergeKeepsSectionsTheAgentSentWhenThePartFetchFails(t *testing.T) {
	agent := partAgent(t)
	hub, _ := newTestHub(t)
	// Point at a server without /v1/services or /v1/ports.
	broken := httptest.NewServer(http.NotFoundHandler())
	defer broken.Close()
	endpoint := nodeEndpoint{HTTP: &http.Client{Timeout: time.Second}, Base: broken.URL, Token: "agent-token"}
	_ = agent

	snap := &model.Snapshot{
		Ts:       7,
		Services: []model.Service{{Name: "from-snapshot.service"}},
		Ports:    []model.Port{{Port: 22}},
	}
	hub.poller.mergeSlowSections(context.Background(), "test", endpoint, snap)
	if len(snap.Services) != 1 || snap.Services[0].Name != "from-snapshot.service" {
		t.Fatalf("services were blanked: %+v", snap.Services)
	}
	if len(snap.Ports) != 1 {
		t.Fatalf("ports were blanked: %+v", snap.Ports)
	}
}

// Agents before 1.4.7 answer /v1/processes without them, and a node page reads
// .length on the section: the hub must ask /v1/agents rather than store null.
func TestProcessRefreshFallsBackToTheAgentsPart(t *testing.T) {
	var agentFetches int
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/processes", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ts":        7,
			"processes": []model.Process{{PID: 42, Name: "codex"}},
		})
	})
	mux.HandleFunc("GET /v1/agents", func(w http.ResponseWriter, r *http.Request) {
		agentFetches++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ts":     7,
			"agents": []model.AgentSession{{ID: "test-42", Type: "codex"}},
		})
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	hub, _ := newTestHub(t)
	node := model.NodeRecord{ID: "test", Name: "test", Mode: "pull", URL: server.URL}
	sealed, err := encrypt(hub.keys.key, []byte("agent-token"))
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.store.UpsertNode(context.Background(), node, sealed, "hash"); err != nil {
		t.Fatal(err)
	}

	hub.poller.refreshProcesses(context.Background(), "test", processesOnDemand)
	if agentFetches != 1 {
		t.Fatalf("/v1/agents fetched %d times, want 1", agentFetches)
	}

	snap := &model.Snapshot{Ts: 7}
	endpoint := nodeEndpoint{HTTP: &http.Client{Timeout: 2 * time.Second}, Base: server.URL, Token: "agent-token"}
	hub.poller.mergeSlowSections(context.Background(), "test", endpoint, snap)
	if len(snap.Agents) != 1 || snap.Agents[0].ID != "test-42" {
		t.Fatalf("agents not merged into the snapshot: %+v", snap.Agents)
	}
}

// A node with no agents at all must still answer an empty array, not null.
func TestMergeKeepsEmptySectionsAsArrays(t *testing.T) {
	mux := http.NewServeMux()
	for _, part := range []string{"processes", "agents"} {
		key := part
		mux.HandleFunc("GET /v1/"+key, func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]any{"ts": 7, key: []any{}})
		})
	}
	server := httptest.NewServer(mux)
	defer server.Close()

	hub, _ := newTestHub(t)
	node := model.NodeRecord{ID: "test", Name: "test", Mode: "pull", URL: server.URL}
	sealed, err := encrypt(hub.keys.key, []byte("agent-token"))
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.store.UpsertNode(context.Background(), node, sealed, "hash"); err != nil {
		t.Fatal(err)
	}
	hub.poller.refreshProcesses(context.Background(), "test", processesOnDemand)

	snap := &model.Snapshot{Ts: 7}
	endpoint := nodeEndpoint{HTTP: &http.Client{Timeout: 2 * time.Second}, Base: server.URL, Token: "agent-token"}
	hub.poller.mergeSlowSections(context.Background(), "test", endpoint, snap)
	if snap.Processes == nil || snap.Agents == nil {
		t.Fatalf("empty sections became nil: processes %v agents %v", snap.Processes, snap.Agents)
	}
}

func TestNormaliseSectionsFillsEveryArray(t *testing.T) {
	snap := &model.Snapshot{}
	normaliseSections(snap)
	if snap.Disks == nil || snap.Network == nil || snap.Processes == nil || snap.Agents == nil ||
		snap.Ports == nil || snap.Services == nil || snap.Containers == nil || snap.Images == nil ||
		snap.Sensors == nil || snap.GPUs == nil || snap.SMART == nil || snap.Users == nil {
		t.Fatalf("a section is still nil: %+v", snap)
	}
	body, err := json.Marshal(snap)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(body, []byte(`":null`)) {
		t.Fatalf("a section marshals as null: %s", body)
	}
}

// A hub that stalls for a third of a minute must not read as an outage: the
// stop/reporting pairs came back every five minutes while it did.
func TestSweepOfflineIgnoresAShortStall(t *testing.T) {
	hub, _ := newTestHub(t)
	hub.poller.interval = 5 * time.Second
	ctx := context.Background()
	node := model.NodeRecord{ID: "test", Name: "test", Mode: "pull", URL: "http://127.0.0.1:1"}
	sealed, err := encrypt(hub.keys.key, []byte("agent-token"))
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.store.UpsertNode(ctx, node, sealed, "hash"); err != nil {
		t.Fatal(err)
	}

	// 20 s of silence: three polls missed, the old threshold, not an outage.
	if err := hub.store.SetNodeStatus(ctx, "test", "online", time.Now().UnixMilli()-20_000); err != nil {
		t.Fatal(err)
	}
	hub.poller.sweepOffline(ctx)
	if record, err := hub.store.GetNode(ctx, "test"); err != nil || record.Status == "offline" {
		t.Fatalf("20 s of silence marked the node offline: %+v", record)
	}

	// 50 s of silence is nine missed polls: that is an outage.
	if err := hub.store.SetNodeStatus(ctx, "test", "online", time.Now().UnixMilli()-50_000); err != nil {
		t.Fatal(err)
	}
	hub.poller.sweepOffline(ctx)
	if record, err := hub.store.GetNode(ctx, "test"); err != nil || record.Status != "offline" {
		t.Fatalf("50 s of silence did not mark the node offline: %+v", record)
	}
}
