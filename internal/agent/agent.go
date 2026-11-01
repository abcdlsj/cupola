package agent

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/abcdlsj/bolthole"
	bhagent "github.com/abcdlsj/bolthole/agent"

	"github.com/abcdlsj/cupola/internal/agent/collect"
	"github.com/abcdlsj/cupola/internal/model"
	"github.com/abcdlsj/cupola/internal/version"
)

// Agent is the per-host process: it collects a snapshot, serves a read-only
// API and runs the actions from its config.
type Agent struct {
	cfg    *Config
	log    *slog.Logger
	token  string
	collector *collect.Collector
	actions   *Actions
	events    *EventRing

	mu       sync.Mutex
	cache    *model.Snapshot
	cacheAt  time.Time
	inflight *snapshotCall
}

type snapshotCall struct {
	done chan struct{}
	snap *model.Snapshot
	err  error
}

const snapshotTTL = 1500 * time.Millisecond

func New(cfg *Config, log *slog.Logger) (*Agent, error) {
	token, err := ReadToken(cfg.TokenFile)
	if err != nil {
		return nil, fmt.Errorf("read token: %w", err)
	}
	logger := &slogLogger{log: log}
	collector, err := collect.New(collect.Options{
		NodeID:    cfg.NodeID,
		Name:      cfg.Name,
		Labels:    cfg.Labels,
		Updates:   cfg.Collect.Updates,
		Docker:    cfg.Collect.Docker,
		SMART:     cfg.Collect.SMART,
		GPU:       cfg.Collect.GPU,
		Processes: cfg.Collect.Processes,
		Logger:    logger,
	})
	if err != nil {
		return nil, err
	}
	agent := &Agent{
		cfg:       cfg,
		log:       log,
		token:     token,
		collector: collector,
		actions:   NewActions(cfg.Actions, logger),
		events:    NewEventRing(),
	}
	return agent, nil
}

func (a *Agent) NodeID() string { return a.cfg.NodeID }

// Snapshot returns the cached snapshot, collecting at most once per TTL and at
// most one collection at a time.
func (a *Agent) Snapshot(ctx context.Context) (*model.Snapshot, error) {
	a.mu.Lock()
	if a.cache != nil && time.Since(a.cacheAt) < snapshotTTL {
		snap := a.cache
		a.mu.Unlock()
		return snap, nil
	}
	if call := a.inflight; call != nil {
		a.mu.Unlock()
		select {
		case <-call.done:
			return call.snap, call.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	call := &snapshotCall{done: make(chan struct{})}
	a.inflight = call
	a.mu.Unlock()

	snap, err := a.collector.Snapshot(ctx)
	if err == nil {
		a.mu.Lock()
		a.cache = snap
		a.cacheAt = time.Now()
		a.mu.Unlock()
	}

	a.mu.Lock()
	a.inflight = nil
	a.mu.Unlock()
	call.snap, call.err = snap, err
	close(call.done)
	return snap, err
}

// Handler is the read-only API. Every /v1 route requires the bearer token.
func (a *Agent) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "version": version.Get()})
	})
	mux.Handle("GET /v1/snapshot", a.auth(http.HandlerFunc(a.handleSnapshot)))
	mux.Handle("GET /v1/processes", a.auth(a.part("processes")))
	mux.Handle("GET /v1/agents", a.auth(a.part("agents")))
	mux.Handle("GET /v1/services", a.auth(a.part("services")))
	mux.Handle("GET /v1/containers", a.auth(a.part("containers")))
	mux.Handle("GET /v1/ports", a.auth(a.part("ports")))
	mux.Handle("GET /v1/actions", a.auth(http.HandlerFunc(a.handleActions)))
	mux.Handle("POST /v1/actions/{id}/run", a.auth(http.HandlerFunc(a.handleRun)))
	mux.Handle("GET /v1/events", a.auth(http.HandlerFunc(a.handleEvents)))
	mux.Handle("GET /v1/stream", a.auth(http.HandlerFunc(a.handleStream)))
	return mux
}

func (a *Agent) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token := strings.TrimPrefix(header, "Bearer ")
		if header == token || subtle.ConstantTimeCompare([]byte(token), []byte(a.token)) != 1 {
			writeError(w, http.StatusUnauthorized, "unauthorized", "a valid agent token is required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *Agent) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	snap, err := a.Snapshot(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "collect", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (a *Agent) part(name string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		snap, err := a.Snapshot(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "collect", err.Error())
			return
		}
		switch name {
		case "processes":
			writeJSON(w, http.StatusOK, map[string]any{"ts": snap.Ts, "processes": snap.Processes})
		case "agents":
			writeJSON(w, http.StatusOK, map[string]any{"ts": snap.Ts, "agents": snap.Agents})
		case "services":
			writeJSON(w, http.StatusOK, map[string]any{"ts": snap.Ts, "services": snap.Services})
		case "containers":
			writeJSON(w, http.StatusOK, map[string]any{"ts": snap.Ts, "containers": snap.Containers})
		case "ports":
			writeJSON(w, http.StatusOK, map[string]any{"ts": snap.Ts, "ports": snap.Ports})
		}
	})
}

func (a *Agent) handleActions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"actions": a.actions.Advertised()})
}

func (a *Agent) handleRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	result, err := a.actions.Run(r.Context(), id, "hub", "api")
	if err != nil {
		writeError(w, http.StatusBadRequest, "action", err.Error())
		return
	}
	def, _ := a.actions.find(id)
	RecordRun(a.events, a.cfg.NodeID, def, result, "hub", "api")
	writeJSON(w, http.StatusOK, result)
}

func (a *Agent) handleEvents(w http.ResponseWriter, r *http.Request) {
	since := time.Now().Add(-24 * time.Hour).UnixMilli()
	if raw := r.URL.Query().Get("since"); raw != "" {
		if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
			since = parsed.UnixMilli()
		} else if parsed, err := time.ParseDuration(raw); err == nil {
			since = time.Now().Add(-parsed).UnixMilli()
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": a.events.Since(since)})
}

func (a *Agent) handleStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "stream", "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Connection", "keep-alive")
	last := time.Now().UnixMilli()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			for _, event := range a.events.Since(last) {
				body, _ := json.Marshal(event)
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Kind, body)
			}
			last = time.Now().UnixMilli()
			fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}

// Run serves the loopback API and, when configured, exposes it through a
// Bolthole relay.
func (a *Agent) Run(ctx context.Context) error {
	handler := a.Handler()
	server := &http.Server{
		Addr:              a.cfg.Listen,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	errCh := make(chan error, 2)
	go func() {
		a.log.Info("agent listening", "addr", a.cfg.Listen, "node", a.cfg.NodeID, "version", version.Version)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	var exposure *bhagent.Agent
	if a.cfg.Relay.URL != "" {
		codeFile := a.cfg.Relay.CodeFile
		if codeFile == "" {
			codeFile = "~/.config/cupola/agent.code"
		}
		code, err := bolthole.LoadOrCreateCode(codeFile)
		if err != nil {
			return fmt.Errorf("relay code: %w", err)
		}
		exposure = bolthole.Expose(a.cfg.Relay.URL, code, handler)
		conn, err := exposure.ConnString()
		if err != nil {
			return fmt.Errorf("relay: %w", err)
		}
		// The connection string is a password: stdout for the operator, never the
		// application log.
		fmt.Println("relay:", conn)
		go func() {
			if err := exposure.Run(ctx); err != nil {
				errCh <- fmt.Errorf("relay: %w", err)
			}
		}()
	}

	// Register with the hub that issued the join code, now that the listener
	// and the relay (if any) are up.
	if a.cfg.JoinHub != "" {
		conn := ""
		if exposure != nil {
			conn, _ = exposure.ConnString()
		}
		go func() {
			time.Sleep(300 * time.Millisecond)
			if err := a.join(ctx, conn); err != nil {
				a.log.Warn("join failed", "error", err.Error())
			}
		}()
	}

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		return nil
	case err := <-errCh:
		return err
	}
}

// ListenAddr is the configured loopback address, for the hub's own log line.
func (a *Agent) ListenAddr() string {
	host, port, err := net.SplitHostPort(a.cfg.Listen)
	if err != nil {
		return a.cfg.Listen
	}
	return net.JoinHostPort(host, port)
}

type slogLogger struct{ log *slog.Logger }

func (l *slogLogger) Info(msg string, args ...any) { l.log.Info(msg, args...) }
func (l *slogLogger) Warn(msg string, args ...any) { l.log.Warn(msg, args...) }

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
