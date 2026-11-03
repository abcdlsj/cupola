package hub

import (
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
