package agent

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

)

// TestPusherSendsSnapshot checks the wire contract the hub's ingest endpoint
// depends on: token auth, gzip, a monotonic sequence and the advertised actions.
func TestPusherSendsSnapshot(t *testing.T) {
	type received struct {
		token   string
		seq     string
		payload ingestPayload
	}
	var got []received
	hub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/ingest" || r.Method != http.MethodPost {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		var reader io.Reader = r.Body
		if r.Header.Get("Content-Encoding") == "gzip" {
			gz, err := gzip.NewReader(r.Body)
			if err != nil {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			defer gz.Close()
			reader = gz
		}
		var payload ingestPayload
		if err := json.NewDecoder(reader).Decode(&payload); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		got = append(got, received{token: r.Header.Get("Authorization"), seq: r.Header.Get("X-Cupola-Seq"), payload: payload})
		_, _ = w.Write([]byte(`{"ok":true,"next_poll_sec":5}`))
	}))
	defer hub.Close()

	dir := t.TempDir()
	tokenPath := filepath.Join(dir, "agent.token")
	if err := os.WriteFile(tokenPath, []byte(strings.Repeat("b", 32)), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg := DefaultConfig()
	cfg.NodeID = "atlas"
	cfg.Name = "atlas"
	cfg.TokenFile = tokenPath
	cfg.Collect.Processes = 1
	cfg.Collect.Docker = false
	cfg.Collect.SMART = false
	cfg.Collect.GPU = false
	cfg.Push = PushConfig{Enabled: true, HubURL: hub.URL}
	instance, err := New(&cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	pusher, err := newPusher(instance)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := pusher.pushOnce(context.Background()); err != nil {
			t.Fatalf("push %d: %v", i, err)
		}
	}
	if len(got) != 2 {
		t.Fatalf("hub received %d pushes", len(got))
	}
	if got[0].token != "Bearer "+strings.Repeat("b", 32) {
		t.Fatalf("token header = %q", got[0].token)
	}
	if got[0].seq == got[1].seq {
		t.Fatalf("sequence did not advance: %q", got[0].seq)
	}
	if got[1].payload.Snapshot == nil || got[1].payload.Snapshot.Node.ID != "atlas" {
		t.Fatalf("payload = %+v", got[1].payload.Snapshot)
	}
}
