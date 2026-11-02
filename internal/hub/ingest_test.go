package hub

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

// pushNode registers a push node the way the join flow would, then returns its
// token.
func pushNode(t *testing.T, hub *Hub, id, token string) {
	t.Helper()
	if err := hub.store.UpsertNode(t.Context(), model.NodeRecord{
		ID: id, Name: id, Labels: []string{}, Mode: "push",
		CreatedAt: time.Now().UnixMilli(), Status: "unknown",
	}, nil, tokenHash(token)); err != nil {
		t.Fatal(err)
	}
}

func ingestBody(t *testing.T, seq int, nodeID string, cpu float64) *bytes.Buffer {
	t.Helper()
	payload := ingestPayload{Snapshot: &model.Snapshot{
		Ts:     time.Now().UnixMilli(),
		Node:   model.NodeInfo{ID: nodeID, Name: nodeID, Platform: "Ubuntu", Kernel: "6.8", Arch: "amd64", AgentVersion: "1.0.0"},
		CPU:    model.CPUStats{Percent: cpu, Load1: 0.5, Procs: 90},
		Memory: model.MemoryStats{Total: 8 << 30, Used: 4 << 30, UsedPercent: 50},
		Disks:  []model.DiskStats{{Mount: "/", Total: 100 << 30, Used: 20 << 30, UsedPct: 20}},
	}}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	var buffer bytes.Buffer
	writer := gzip.NewWriter(&buffer)
	if _, err := writer.Write(raw); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return &buffer
}

func postIngest(t *testing.T, url, token string, seq int, body *bytes.Buffer) int {
	t.Helper()
	request, err := http.NewRequest(http.MethodPost, url, body)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Content-Encoding", "gzip")
	request.Header.Set("X-Cupola-Seq", itoa(seq))
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	return response.StatusCode
}

func itoa(value int) string {
	return string(rune('0' + value%10))
}

func TestIngestStoresSamples(t *testing.T) {
	hub, server := newTestHub(t)
	c := testClient(t)
	if status, _ := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/auth/login", map[string]string{"password": "test-password-123"}, ""); status != http.StatusOK {
		t.Fatalf("login failed")
	}
	pushNode(t, hub, "natted", "push-token")

	if status := postIngest(t, server.URL+"/api/v1/ingest", "push-token", 1, ingestBody(t, 1, "natted", 42)); status != http.StatusOK {
		t.Fatalf("first ingest = %d, want 200", status)
	}
	// A replayed or retried sequence is refused without duplicating a sample.
	if status := postIngest(t, server.URL+"/api/v1/ingest", "push-token", 1, ingestBody(t, 1, "natted", 99)); status != http.StatusConflict {
		t.Fatalf("replayed ingest = %d, want 409", status)
	}
	if status := postIngest(t, server.URL+"/api/v1/ingest", "push-token", 2, ingestBody(t, 2, "natted", 55)); status != http.StatusOK {
		t.Fatalf("second ingest = %d, want 200", status)
	}

	status, node := doJSON(t, c, http.MethodGet, server.URL+"/api/v1/nodes/natted", nil, "")
	if status != http.StatusOK {
		t.Fatalf("node = %d", status)
	}
	snap, _ := node["snapshot"].(map[string]any)
	cpu, _ := snap["cpu"].(map[string]any)
	if cpu["percent"].(float64) != 55 {
		t.Fatalf("stored cpu = %v, want the newest sample", cpu["percent"])
	}
	record := node["node"].(map[string]any)
	if record["mode"] != "push" {
		t.Fatalf("mode = %v", record["mode"])
	}

	// No downward channel: an action run is refused with a reason.
	status, body := doJSON(t, c, http.MethodPost, server.URL+"/api/v1/nodes/natted/actions/anything/run", nil, "")
	if status != http.StatusConflict {
		t.Fatalf("action run on a push node = %d, want 409 (%+v)", status, body)
	}
}

func TestIngestAuth(t *testing.T) {
	hub, server := newTestHub(t)
	pushNode(t, hub, "natted", "push-token")

	if status := postIngest(t, server.URL+"/api/v1/ingest", "wrong-token", 1, ingestBody(t, 1, "natted", 10)); status != http.StatusUnauthorized {
		t.Fatalf("bad token = %d, want 401", status)
	}
	// A pull node must not be writable through ingest.
	if err := hub.store.UpsertNode(t.Context(), model.NodeRecord{
		ID: "pulled", Name: "pulled", Mode: "pull", URL: "http://127.0.0.1:1",
		CreatedAt: time.Now().UnixMilli(),
	}, nil, tokenHash("pull-token")); err != nil {
		t.Fatal(err)
	}
	if status := postIngest(t, server.URL+"/api/v1/ingest", "pull-token", 1, ingestBody(t, 1, "pulled", 10)); status != http.StatusConflict {
		t.Fatalf("pull node ingest = %d, want 409", status)
	}
	// A snapshot claiming another node id is rejected: identity is the token.
	if status := postIngest(t, server.URL+"/api/v1/ingest", "push-token", 3, ingestBody(t, 3, "pulled", 10)); status != http.StatusBadRequest {
		t.Fatalf("spoofed node id = %d, want 400", status)
	}
}
