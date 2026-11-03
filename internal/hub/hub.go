package hub

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"log/slog"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/abcdlsj/cupola/internal/agent"
	"github.com/abcdlsj/cupola/internal/hub/store"
	"github.com/abcdlsj/cupola/internal/model"
	"github.com/abcdlsj/cupola/internal/updater"
	"github.com/abcdlsj/cupola/internal/version"
)

//go:embed assets/install.sh
var webAssets embed.FS

// Hub is the single hub process: SQLite, poller, alerting, API, SSE and the
// PWA.
type Hub struct {
	cfg   *Config
	log   *slog.Logger
	store *store.Store
	keys  *secrets

	transport *transportManager
	tailnet   tailnetCache
	bus       *broadcaster
	notifier  *notifier
	poller    *poller
	updates   *updater.Checker
	routes    http.Handler
	limiter   *rateLimiter
	runLimiter *rateLimiter
	ingestLimiter *rateLimiter

	agentCancel context.CancelFunc
	mu          sync.Mutex

	fillMu sync.Mutex
	fill   map[string]fillEntry
}

// fillEntry caches the disk-fill forecast. The forecast scans seven days of
// disk samples, which is far too expensive to run on every snapshot and every
// fleet summary.
type fillEntry struct {
	days float64
	at   time.Time
}

// fillForecastTTL is how stale a fill prediction may be; disk usage moves
// slowly, and the prediction is a trend, not a measurement.
const fillForecastTTL = 10 * time.Minute

func New(ctx context.Context, cfg Config) (*Hub, error) {
	if err := cfg.normalize(); err != nil {
		return nil, err
	}
	log := cfg.log()
	dbPath := filepath.Join(cfg.DataDir, "cupola.db")
	st, err := store.Open(ctx, dbPath)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	keys, err := loadSecrets(ctx, &cfg, st)
	if err != nil {
		st.Close()
		return nil, err
	}
	h := &Hub{
		cfg:   &cfg,
		log:   log,
		store: st,
		keys:  keys,
		limiter:    newRateLimiter(5, time.Minute),
		runLimiter: newRateLimiter(12, time.Minute),
		ingestLimiter: newRateLimiter(10, time.Second),
	}
	// Older rows carry only the sealed token; index its hash so push nodes
	// authenticate without a scan.
	if err := st.BackfillTokenHashes(ctx, func(tokenEnc []byte) (string, error) {
		token, err := decrypt(keys.key, tokenEnc)
		if err != nil {
			return "", err
		}
		return tokenHash(string(token)), nil
	}); err != nil {
		st.Close()
		return nil, fmt.Errorf("backfill node tokens: %w", err)
	}
	h.transport = newTransportManager(keys.key)
	h.bus = newBroadcaster()
	h.notifier = newNotifier(&cfg, st, keys.key, log)
	h.updates = updater.New(updater.Options{
		Repo:      cfg.UpdateRepo,
		API:       cfg.UpdateAPI,
		Token:     os.Getenv("CUPOLA_UPDATE_TOKEN"),
		StagedDir: filepath.Join(cfg.DataDir, "updates"),
		Enabled:   cfg.UpdateEnabled,
	})
	h.poller = newPoller(h, cfg.PollInterval)
	h.routes = h.routesHandler()

	if cfg.EmbedAgent {
		if err := h.startEmbeddedAgent(ctx); err != nil {
			st.Close()
			return nil, err
		}
	}
	log.Info("hub ready", "db", dbPath, "listen", cfg.Listen, "web", cfg.WebDir, "version", version.Version)
	return h, nil
}

func (h *Hub) Close() error {
	if h.agentCancel != nil {
		h.agentCancel()
	}
	return h.store.Close()
}

func (h *Hub) Run(ctx context.Context) error {
	pollCtx, cancelPoll := context.WithCancel(ctx)
	defer cancelPoll()
	go h.poller.Run(pollCtx)

	server := &http.Server{
		Addr:              h.cfg.Listen,
		Handler:           h.routes,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       90 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		h.log.Info("http listening", "addr", h.cfg.Listen)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		cancelPoll()
		return h.Close()
	case err := <-errCh:
		cancelPoll()
		_ = h.Close()
		return err
	}
}

// startEmbeddedAgent runs an agent in-process for `cupola serve` and registers
// it as the `local` node. Its config stays editable at <data>/local-agent.json.
// fillForecast returns the days until the root filesystem fills, cached per
// node. It used to be recomputed from seven days of samples on every poll.
func (h *Hub) fillForecast(ctx context.Context, nodeID string, snap *model.Snapshot) float64 {
	if snap == nil {
		return 0
	}
	h.fillMu.Lock()
	entry, ok := h.fill[nodeID]
	h.fillMu.Unlock()
	if ok && time.Since(entry.at) < fillForecastTTL {
		return entry.days
	}
	days := 0.0
	for _, disk := range snap.Disks {
		if disk.Mount != "/" {
			continue
		}
		since := time.Now().Add(-7 * 24 * time.Hour).UnixMilli()
		if history, err := h.store.DiskHistory(ctx, nodeID, disk.Mount, since); err == nil {
			days = daysToFull(history)
		}
	}
	h.fillMu.Lock()
	if h.fill == nil {
		h.fill = make(map[string]fillEntry)
	}
	h.fill[nodeID] = fillEntry{days: days, at: time.Now()}
	h.fillMu.Unlock()
	return days
}

func (h *Hub) startEmbeddedAgent(ctx context.Context) error {
	dataDir := h.cfg.DataDir
	tokenPath := filepath.Join(dataDir, "local-agent.token")
	token, err := ensureToken(tokenPath)
	if err != nil {
		return err
	}
	listen, err := freeLoopbackAddr()
	if err != nil {
		return err
	}
	hostname, _ := os.Hostname()
	nodeID := "local"
	configPath := filepath.Join(dataDir, "local-agent.json")
	if _, err := os.Stat(configPath); errors.Is(err, os.ErrNotExist) {
		cfg := agent.DefaultConfig()
		cfg.Listen = listen
		cfg.NodeID = nodeID
		cfg.Name = hostname
		cfg.Labels = []string{"local"}
		cfg.TokenFile = tokenPath
		body, _ := json.MarshalIndent(cfg, "", "  ")
		if err := os.WriteFile(configPath, append(body, '\n'), 0o600); err != nil {
			return err
		}
	} else if cfgPath := h.cfg.AgentConfig; cfgPath != "" {
		configPath = cfgPath
	}
	cfg, err := agent.LoadConfig(configPath)
	if err != nil {
		return fmt.Errorf("embedded agent config: %w", err)
	}
	if cfg.TokenFile != tokenPath {
		if token, err = agent.ReadToken(cfg.TokenFile); err != nil {
			return err
		}
	}
	instance, err := agent.New(cfg, h.log)
	if err != nil {
		return err
	}
	agentCtx, cancel := context.WithCancel(ctx)
	h.agentCancel = cancel
	go func() {
		if err := instance.Run(agentCtx); err != nil && agentCtx.Err() == nil {
			h.log.Error("embedded agent stopped", "error", err.Error())
		}
	}()

	tokenEnc, err := encrypt(h.keys.key, []byte(token))
	if err != nil {
		return err
	}
	record := model.NodeRecord{
		ID:        cfg.NodeID,
		Name:      cfg.Name,
		Labels:    cfg.Labels,
		Mode:      "pull",
		URL:       "http://" + cfg.Listen,
		CreatedAt: time.Now().UnixMilli(),
		Status:    "unknown",
	}
	// A display name set in Settings -> Nodes survives restarts; the embedded
	// agent must not overwrite it with the hostname on every start.
	if existing, err := h.store.GetNode(ctx, cfg.NodeID); err == nil && existing.ID != "" {
		if existing.Name != "" {
			record.Name = existing.Name
		}
		if len(existing.Labels) > 0 {
			record.Labels = existing.Labels
		}
		record.CreatedAt = existing.CreatedAt
	}
	if err := h.store.UpsertNode(ctx, record, tokenEnc, tokenHash(token)); err != nil {
		return err
	}
	h.log.Info("embedded agent", "node", cfg.NodeID, "addr", cfg.Listen, "config", configPath)
	return nil
}

func ensureToken(path string) (string, error) {
	if body, err := os.ReadFile(path); err == nil {
		return strings.TrimSpace(string(body)), nil
	}
	token := randomID(32)
	if err := os.WriteFile(path, []byte(token+"\n"), 0o600); err != nil {
		return "", err
	}
	return token, nil
}

func freeLoopbackAddr() (string, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	addr := listener.Addr().String()
	_ = listener.Close()
	return addr, nil
}

// attentionCount is the number of findings the overview shows for a node.
func (h *Hub) attentionCount(ctx context.Context, nodeID string, snap *model.Snapshot, days float64) (int, error) {
	if snap == nil {
		return 0, nil
	}
	count := 0
	for _, service := range snap.Services {
		if service.ActiveState == "failed" {
			count++
		}
	}
	for _, disk := range snap.Disks {
		if disk.UsedPct >= 85 {
			count++
		}
	}
	for _, container := range snap.Containers {
		if container.State != "running" && container.State != "exited" {
			count++
		}
	}
	if days > 0 && days < 14 {
		count++
	}
	if snap.Memory.UsedPercent >= 95 {
		count++
	}
	return count, nil
}

// rateLimiter is a small sliding window used for login and action runs.
type rateLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{hits: make(map[string][]time.Time), limit: limit, window: window}
}

func (r *rateLimiter) allow(key string) bool {
	now := time.Now()
	r.mu.Lock()
	defer r.mu.Unlock()
	entries := r.hits[key]
	cutoff := now.Add(-r.window)
	kept := entries[:0]
	for _, at := range entries {
		if at.After(cutoff) {
			kept = append(kept, at)
		}
	}
	if len(kept) >= r.limit {
		r.hits[key] = kept
		return false
	}
	r.hits[key] = append(kept, now)
	return true
}

// spa serves the built PWA from cfg.WebDir, with an index.html fallback for the
// client-side router. A missing build gets instructions instead of a blank page.
func (h *Hub) spa() http.Handler {
	dir := h.cfg.WebDir
	indexPath := filepath.Join(dir, "index.html")
	fileServer := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := os.Stat(indexPath); err != nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprint(w, `<!doctype html><meta charset="utf-8"><title>Cupola</title>
<body style="font:14px system-ui;background:#171719;color:#eee;padding:40px">
<h1>Cupola hub is running</h1>
<p>The web build is missing: run <code>cd web &amp;&amp; npm ci &amp;&amp; npm run build</code>
or start the hub with <code>--web-dir</code> pointing at <code>web/dist</code>.</p>
<p>API: <code>/api/v1</code> · health: <code>/healthz</code></p>
</body>`)
			return
		}
		clean := filepath.Clean(r.URL.Path)
		if strings.HasPrefix(clean, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		if clean != "/" {
			full := filepath.Join(dir, clean)
			if info, err := os.Stat(full); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, indexPath)
	})
}

func (h *Hub) healthz() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"version": version.Get(),
			"service": "hub",
			"time":    time.Now().UnixMilli(),
		})
	})
}
