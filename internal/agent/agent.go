package agent

import (
	"compress/gzip"
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

	"github.com/abcdlsj/cupola/internal/agent/collect"
	"github.com/abcdlsj/cupola/internal/model"
	"github.com/abcdlsj/cupola/internal/version"
)

// Agent is the per-host process: it collects a snapshot, serves a read-only
// API and runs the actions from its config.
type Agent struct {
	cfg       *Config
	log       *slog.Logger
	token     string
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
	return compressJSON(mux)
}

// compressJSON gzips the API responses. A snapshot is about 115 KB of plain
// JSON, and the hub asks for it every few seconds; over a cross-border or
// relayed path that is the difference between a 2.5 s poll and a 0.5 s one.
// SSE is left alone: it must flush every event.
func compressJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/stream" || !acceptsGzip(r) {
			next.ServeHTTP(w, r)
			return
		}
		gz := gzip.NewWriter(w)
		defer gz.Close()
		w.Header().Add("Vary", "Accept-Encoding")
		w.Header().Set("Content-Encoding", "gzip")
		next.ServeHTTP(&gzipWriter{ResponseWriter: w, gz: gz}, r)
	})
}

func acceptsGzip(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		if strings.EqualFold(strings.TrimSpace(strings.SplitN(part, ";", 2)[0]), "gzip") {
			return true
		}
	}
	return false
}

type gzipWriter struct {
	http.ResponseWriter
	gz *gzip.Writer
}

func (g *gzipWriter) Write(body []byte) (int, error) { return g.gz.Write(body) }

func (g *gzipWriter) Flush() {
	_ = g.gz.Flush()
	if flusher, ok := g.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
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
	// ?slim=1 drops the two sections the hub refreshes on its own schedule.
	// Services alone were 84 % of a 115 KB snapshot, and the hub was asking for
	// them every five seconds.
	if r.URL.Query().Get("slim") == "1" {
		slim := *snap
		slim.Services = nil
		slim.Ports = nil
		writeJSON(w, http.StatusOK, &slim)
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

// Run serves the loopback API and, when configured, pushes snapshots to the
// hub. There is no relay: an agent either waits to be polled or reports out.
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

	if a.cfg.Push.Enabled && a.cfg.Push.HubURL != "" {
		pusher, err := newPusher(a)
		if err != nil {
			return err
		}
		go pusher.Run(ctx)
	}

	// Register with the hub that issued the join code, now that the listener is
	// up. Pull agents advertise their URL; push agents need none.
	if a.cfg.JoinHub != "" {
		go func() {
			time.Sleep(300 * time.Millisecond)
			if err := a.join(ctx); err != nil {
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
