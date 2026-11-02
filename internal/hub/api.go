package hub

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/abcdlsj/cupola/internal/hub/store"
	"github.com/abcdlsj/cupola/internal/model"
	"github.com/abcdlsj/cupola/internal/version"
)

const sessionCookie = "cupola_session"

var nodeIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,31}$`)

// seriesAllow is the set of time-series the hub stores and serves; alert
// metrics (disk, inode, temp) are current values, not series.
var seriesAllow = map[string]bool{
	"cpu": true, "mem": true, "load": true,
	"net_rx": true, "net_tx": true, "disk_r": true, "disk_w": true,
	"psi_cpu": true, "psi_io": true, "procs": true,
}

type identity struct {
	authenticated bool
	admin         bool
	mode          string // session | token
	token         *model.APIToken
}

func (h *Hub) identity(r *http.Request) identity {
	if cookie, err := r.Cookie(sessionCookie); err == nil && verifySession(h.keys.key, cookie.Value) {
		return identity{authenticated: true, admin: true, mode: "session"}
	}
	header := r.Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer cupola_") {
		raw := strings.TrimPrefix(header, "Bearer cupola_")
		parts := strings.SplitN(raw, "_", 2)
		if len(parts) == 2 {
			token, hash, err := h.store.GetToken(r.Context(), parts[0])
			if err == nil {
				if token.ExpiresAt > 0 && token.ExpiresAt < time.Now().UnixMilli() {
					return identity{}
				}
				if subtle.ConstantTimeCompare([]byte(hash), []byte(hashSecret(parts[1]))) == 1 {
					_ = h.store.TouchToken(r.Context(), token.ID, time.Now().UnixMilli())
					copyToken := token
					return identity{authenticated: true, mode: "token", token: &copyToken}
				}
			}
		}
	}
	return identity{}
}

func (h *Hub) requireRead(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := h.identity(r)
		if !id.authenticated {
			apiError(w, http.StatusUnauthorized, "unauthorized", "sign in or present a bearer token")
			return
		}
		if id.mode == "token" && !hasScope(id.token, "read") && !hasScope(id.token, "actions:run") {
			apiError(w, http.StatusForbidden, "scope", "this token has no read scope")
			return
		}
		next.ServeHTTP(w, r.WithContext(withIdentity(r.Context(), id)))
	})
}

func (h *Hub) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := h.identity(r)
		if !id.authenticated || !id.admin {
			apiError(w, http.StatusUnauthorized, "unauthorized", "admin session required")
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && !sameOrigin(r) {
			apiError(w, http.StatusForbidden, "csrf", "cross-origin write refused")
			return
		}
		next.ServeHTTP(w, r.WithContext(withIdentity(r.Context(), id)))
	})
}

func (h *Hub) requireActions(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := h.identity(r)
		if !id.authenticated {
			apiError(w, http.StatusUnauthorized, "unauthorized", "sign in or present a bearer token")
			return
		}
		if id.mode == "token" && !hasScope(id.token, "actions:run") {
			apiError(w, http.StatusForbidden, "scope", "this token lacks actions:run")
			return
		}
		if id.mode == "session" && !sameOrigin(r) {
			apiError(w, http.StatusForbidden, "csrf", "cross-origin write refused")
			return
		}
		next.ServeHTTP(w, r.WithContext(withIdentity(r.Context(), id)))
	})
}

type identityKey struct{}

func withIdentity(ctx context.Context, id identity) context.Context {
	return context.WithValue(ctx, identityKey{}, id)
}

func identityFrom(ctx context.Context) identity {
	id, _ := ctx.Value(identityKey{}).(identity)
	return id
}

func hasScope(token *model.APIToken, scope string) bool {
	if token == nil {
		return false
	}
	for _, value := range token.Scopes {
		if value == scope {
			return true
		}
	}
	return false
}

func sameOrigin(r *http.Request) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "same-site" && site != "none" {
		return false
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return strings.EqualFold(parsed.Host, r.Host)
}

func (h *Hub) handleLogin(w http.ResponseWriter, r *http.Request) {
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	if !h.limiter.allow("login:" + ip) {
		apiError(w, http.StatusTooManyRequests, "rate_limit", "too many login attempts; wait a minute")
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		apiError(w, http.StatusBadRequest, "json", "invalid body")
		return
	}
	if !verifyPassword(body.Password, h.keys.adminHash) {
		apiError(w, http.StatusUnauthorized, "password", "wrong password")
		return
	}
	value, err := signSession(h.keys.key, h.cfg.SessionTTL)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "session", err.Error())
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil || strings.HasPrefix(h.cfg.PublicURL, "https://"),
		MaxAge:   int(h.cfg.SessionTTL.Seconds()),
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Hub) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Hub) handleMe(w http.ResponseWriter, r *http.Request) {
	id := identityFrom(r.Context())
	nodes, _ := h.store.ListNodeRecords(r.Context())
	out := map[string]any{
		"authenticated": id.authenticated,
		"mode":          id.mode,
		"admin":         id.admin,
		"version":       version.Get(),
		"public_url":    h.cfg.PublicURL,
		"node_count":    len(nodes),
	}
	if id.token != nil {
		out["token_name"] = id.token.Name
		out["scopes"] = id.token.Scopes
	}
	writeJSON(w, http.StatusOK, out)
}

// ---------- fleet ----------

func (h *Hub) handleFleetSummary(w http.ResponseWriter, r *http.Request) {
	nodes, err := h.store.ListNodeRecords(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	views := make([]model.NodeView, 0, len(nodes))
	for _, node := range nodes {
		views = append(views, h.nodeView(r.Context(), node, false))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"nodes":   views,
		"updated": time.Now().UnixMilli(),
	})
}

func (h *Hub) nodeView(ctx context.Context, node model.NodeRecord, withSnapshot bool) model.NodeView {
	snap, _ := h.store.GetState(ctx, node.ID)
	days := 0.0
	if snap != nil {
		for _, disk := range snap.Disks {
			if disk.Mount != "/" {
				continue
			}
			since := time.Now().Add(-7 * 24 * time.Hour).UnixMilli()
			if history, err := h.store.DiskHistory(ctx, node.ID, disk.Mount, since); err == nil {
				days = daysToFull(history)
			}
		}
	}
	attention, _ := h.attentionCount(ctx, node.ID, snap, days)
	health := nodeHealth(node, snap, days, attention)
	if actions, err := h.store.GetActions(ctx, node.ID); err == nil {
		health.Apps = len(actions)
	}
	view := model.NodeView{Node: node, Health: health}
	if withSnapshot {
		view.Snapshot = snap
	}
	return view
}

func (h *Hub) handleGetNode(w http.ResponseWriter, r *http.Request) {
	node, err := h.store.GetNode(r.Context(), r.PathValue("id"))
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found", "no such node")
		return
	}
	if !tokenAllowsNode(identityFrom(r.Context()), node.ID) {
		apiError(w, http.StatusForbidden, "scope", "token is not allowed on this node")
		return
	}
	writeJSON(w, http.StatusOK, h.nodeView(r.Context(), node, true))
}

func (h *Hub) handleNodeSnapshot(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !tokenAllowsNode(identityFrom(r.Context()), id) {
		apiError(w, http.StatusForbidden, "scope", "token is not allowed on this node")
		return
	}
	snap, err := h.store.GetState(r.Context(), id)
	if err != nil || snap == nil {
		apiError(w, http.StatusNotFound, "not_found", "no snapshot yet")
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (h *Hub) handleNodePart(part string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !tokenAllowsNode(identityFrom(r.Context()), id) {
			apiError(w, http.StatusForbidden, "scope", "token is not allowed on this node")
			return
		}
		snap, err := h.store.GetState(r.Context(), id)
		if err != nil || snap == nil {
			apiError(w, http.StatusNotFound, "not_found", "no snapshot yet")
			return
		}
		switch part {
		case "processes":
			writeJSON(w, http.StatusOK, map[string]any{"ts": snap.Ts, "processes": snap.Processes, "agents": snap.Agents})
		case "agents":
			writeJSON(w, http.StatusOK, map[string]any{"ts": snap.Ts, "agents": snap.Agents})
		case "services":
			writeJSON(w, http.StatusOK, map[string]any{"ts": snap.Ts, "services": snap.Services})
		case "containers":
			writeJSON(w, http.StatusOK, map[string]any{"ts": snap.Ts, "containers": snap.Containers})
		case "ports":
			writeJSON(w, http.StatusOK, map[string]any{"ts": snap.Ts, "ports": snap.Ports})
		default:
			apiError(w, http.StatusNotFound, "not_found", "unknown part")
		}
	})
}

func tokenAllowsNode(id identity, nodeID string) bool {
	if id.mode != "token" || id.token == nil || len(id.token.NodeIDs) == 0 {
		return true
	}
	return contains(id.token.NodeIDs, nodeID)
}

func (h *Hub) handleSeries(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !tokenAllowsNode(identityFrom(r.Context()), id) {
		apiError(w, http.StatusForbidden, "scope", "token is not allowed on this node")
		return
	}
	metric := r.URL.Query().Get("metric")
	if metric == "" {
		metric = "cpu"
	}
	if !seriesAllow[metric] {
		apiError(w, http.StatusBadRequest, "metric", "this metric has no series; available: cpu, mem, load, net_rx, net_tx, disk_r, disk_w, psi_cpu, psi_io, procs")
		return
	}
	rangeID := r.URL.Query().Get("range")
	now := time.Now().UnixMilli()
	from, to, step := seriesWindow(rangeID, now)
	if raw := r.URL.Query().Get("from"); raw != "" {
		if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
			from = parsed.UnixMilli()
		}
	}
	if raw := r.URL.Query().Get("to"); raw != "" {
		if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
			to = parsed.UnixMilli()
		}
	}
	points, err := h.store.Series(r.Context(), id, metric, from, to, step)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "series", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, model.Series{NodeID: id, Metric: metric, Range: rangeID, Step: step, Points: downsample(points, 1200)})
}

func seriesWindow(rangeID string, now int64) (from, to, step int64) {
	to = now
	switch rangeID {
	case "1h":
		return now - 3600_000, to, 5
	case "6h":
		return now - 6*3600_000, to, 30
	case "7d":
		return now - 7*24*3600_000, to, 300
	case "30d":
		return now - 30*24*3600_000, to, 900
	case "13mo":
		return now - 395*24*3600_000, to, 3600
	default: // 24h
		return now - 24*3600_000, to, 60
	}
}

func downsample(points []model.SeriesPoint, max int) []model.SeriesPoint {
	if len(points) <= max {
		return points
	}
	bucket := len(points)/max + 1
	out := make([]model.SeriesPoint, 0, max)
	for i := 0; i < len(points); i += bucket {
		end := i + bucket
		if end > len(points) {
			end = len(points)
		}
		chunk := points[i:end]
		point := model.SeriesPoint{Ts: chunk[0].Ts, Min: chunk[0].Min, Avg: 0, Max: chunk[0].Max}
		for _, item := range chunk {
			if item.Min < point.Min {
				point.Min = item.Min
			}
			if item.Max > point.Max {
				point.Max = item.Max
			}
			point.Avg += item.Avg
		}
		point.Avg /= float64(len(chunk))
		out = append(out, point)
	}
	return out
}

// ---------- nodes CRUD ----------

func (h *Hub) handleListNodes(w http.ResponseWriter, r *http.Request) {
	nodes, err := h.store.ListNodeRecords(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	views := make([]model.NodeView, 0, len(nodes))
	for _, node := range nodes {
		views = append(views, h.nodeView(r.Context(), node, false))
	}
	writeJSON(w, http.StatusOK, views)
}

type nodeRequest struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Labels []string `json:"labels"`
	Mode   string   `json:"mode"`
	URL    string   `json:"url"`
	Token  string   `json:"token"`
}

func (h *Hub) handleCreateNode(w http.ResponseWriter, r *http.Request) {
	var body nodeRequest
	if err := decodeJSON(r, &body); err != nil {
		apiError(w, http.StatusBadRequest, "json", "invalid body")
		return
	}
	if !nodeIDPattern.MatchString(body.ID) {
		apiError(w, http.StatusBadRequest, "id", "id must be a short lowercase slug")
		return
	}
	if body.Name == "" {
		body.Name = body.ID
	}
	if body.Labels == nil {
		body.Labels = []string{}
	}
	if body.Mode == "" {
		body.Mode = "pull"
	}
	if body.Mode != "pull" && body.Mode != "push" {
		apiError(w, http.StatusBadRequest, "mode", "mode must be pull or push")
		return
	}
	if body.Mode == "pull" {
		parsed, err := url.Parse(body.URL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			apiError(w, http.StatusBadRequest, "url", "a pull node needs an http(s) URL")
			return
		}
	}
	if body.Token == "" {
		apiError(w, http.StatusBadRequest, "token", "the agent token is required")
		return
	}
	tokenEnc, err := encrypt(h.keys.key, []byte(body.Token))
	if err != nil {
		apiError(w, http.StatusInternalServerError, "encrypt", err.Error())
		return
	}
	record := model.NodeRecord{
		ID: body.ID, Name: body.Name, Labels: body.Labels, Mode: body.Mode, URL: body.URL,
		CreatedAt: time.Now().UnixMilli(), Status: "unknown",
	}
	if err := h.store.UpsertNode(r.Context(), record, tokenEnc, tokenHash(body.Token)); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, h.nodeView(r.Context(), record, false))
}

func (h *Hub) handleUpdateNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	secret, err := h.store.GetNodeSecret(r.Context(), id)
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found", "no such node")
		return
	}
	var body nodeRequest
	if err := decodeJSON(r, &body); err != nil {
		apiError(w, http.StatusBadRequest, "json", "invalid body")
		return
	}
	if body.Name == "" {
		body.Name = secret.Node.Name
	}
	if body.Mode == "" {
		body.Mode = secret.Node.Mode
	}
	if body.Mode != "pull" && body.Mode != "push" {
		apiError(w, http.StatusBadRequest, "mode", "mode must be pull or push")
		return
	}
	if body.URL == "" {
		body.URL = secret.Node.URL
	}
	labels := secret.Node.Labels
	if body.Labels != nil {
		labels = body.Labels
	}
	var tokenEnc []byte
	tokenHashValue := ""
	if body.Token != "" {
		tokenEnc, err = encrypt(h.keys.key, []byte(body.Token))
		if err != nil {
			apiError(w, http.StatusInternalServerError, "encrypt", err.Error())
			return
		}
		tokenHashValue = tokenHash(body.Token)
	}
	record := secret.Node
	record.Name = body.Name
	record.Labels = labels
	record.Mode = body.Mode
	record.URL = body.URL
	if err := h.store.UpsertNode(r.Context(), record, tokenEnc, tokenHashValue); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, h.nodeView(r.Context(), record, false))
}

func (h *Hub) handleDeleteNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.store.DeleteNode(r.Context(), id); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Hub) handleTestNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	secret, err := h.store.GetNodeSecret(r.Context(), id)
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found", "no such node")
		return
	}
	if secret.Node.Mode == "push" {
		// Nothing to dial: the node's own reports are the only evidence.
		fresh := secret.Node.LastSeen > 0 && time.Since(time.UnixMilli(secret.Node.LastSeen)) < 30*time.Second
		if !fresh {
			apiError(w, http.StatusBadGateway, "agent", "this node pushes samples and has not reported recently")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"mode":    "push",
			"ts":      secret.Node.LastSeen,
			"node_id": secret.Node.ID,
			"os":      secret.Node.OS,
			"kernel":  secret.Node.Kernel,
			"agent":   secret.Node.AgentVersion,
		})
		return
	}
	endpoint, err := h.transport.endpoint(r.Context(), secret)
	if err != nil {
		apiError(w, http.StatusBadGateway, "transport", err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	snap, err := fetchSnapshot(ctx, endpoint)
	if err != nil {
		apiError(w, http.StatusBadGateway, "agent", sanitizeError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"ts":        snap.Ts,
		"node_id":   snap.Node.ID,
		"os":        snap.Node.Platform,
		"kernel":    snap.Node.Kernel,
		"agent":     snap.Node.AgentVersion,
		"cpu_pct":   snap.CPU.Percent,
		"processes": len(snap.Processes),
	})
}

// ---------- actions ----------

func (h *Hub) handleListActions(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !tokenAllowsNode(identityFrom(r.Context()), id) {
		apiError(w, http.StatusForbidden, "scope", "token is not allowed on this node")
		return
	}
	actions, err := h.store.GetActions(r.Context(), id)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"actions": actions})
}

func (h *Hub) handleRunAction(w http.ResponseWriter, r *http.Request) {
	nodeID := r.PathValue("id")
	actionID := r.PathValue("action")
	id := identityFrom(r.Context())
	if !tokenAllowsNode(id, nodeID) {
		apiError(w, http.StatusForbidden, "scope", "token is not allowed on this node")
		return
	}
	if id.mode == "token" {
		if len(id.token.ActionIDs) > 0 && !contains(id.token.ActionIDs, actionID) {
			apiError(w, http.StatusForbidden, "scope", "token is not allowed on this action")
			return
		}
		actions, _ := h.store.GetActions(r.Context(), nodeID)
		var allowed bool
		for _, action := range actions {
			if action.ID == actionID && action.AllowAPI {
				allowed = true
				break
			}
		}
		if !allowed {
			apiError(w, http.StatusForbidden, "allow_api", "this action is not API callable")
			return
		}
	}
	limitKey := "run:" + nodeID + ":" + actionID + ":" + id.mode
	if id.token != nil {
		limitKey += ":" + id.token.ID
	}
	if !h.runLimiter.allow(limitKey) {
		apiError(w, http.StatusTooManyRequests, "rate_limit", "too many runs of this action; wait a minute")
		return
	}
	secret, err := h.store.GetNodeSecret(r.Context(), nodeID)
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found", "no such node")
		return
	}
	if secret.Node.Mode == "push" {
		apiError(w, http.StatusConflict, "mode", "this node pushes samples; actions need a pull node")
		return
	}
	endpoint, err := h.transport.endpoint(r.Context(), secret)
	if err != nil {
		apiError(w, http.StatusBadGateway, "transport", err.Error())
		return
	}
	actions, _ := h.store.GetActions(r.Context(), nodeID)
	actionName := actionID
	for _, action := range actions {
		if action.ID == actionID {
			actionName = action.Name
		}
	}
	actor := "admin"
	if id.token != nil {
		actor = id.token.Name
	}
	source := "ui"
	if id.mode == "token" {
		source = "api"
	}
	ctx, cancel := context.WithTimeout(r.Context(), 65*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.Base+"/v1/actions/"+url.PathEscape(actionID)+"/run", nil)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "request", err.Error())
		return
	}
	request.Header.Set("Authorization", "Bearer "+endpoint.Token)
	started := time.Now()
	response, err := endpoint.HTTP.Do(request)
	if err != nil {
		apiError(w, http.StatusBadGateway, "agent", sanitizeError(err))
		return
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 64*1024))
	if response.StatusCode != http.StatusOK {
		apiError(w, http.StatusBadGateway, "agent", strings.TrimSpace(string(body)))
		return
	}
	var result model.ActionResult
	if err := json.Unmarshal(body, &result); err != nil {
		apiError(w, http.StatusBadGateway, "agent", "invalid action result")
		return
	}
	run := model.ActionRun{
		ID: result.RunID, NodeID: nodeID, ActionID: actionID, ActionName: actionName,
		Ts: result.StartedAt, Actor: actor, Source: source, OK: result.OK,
		ExitCode: result.ExitCode, DurationMs: result.DurationMs, Truncated: result.Truncated,
	}
	if run.ID == "" {
		run.ID = randomID(8)
	}
	if run.Ts == 0 {
		run.Ts = started.UnixMilli()
	}
	if result.Stdout != "" || result.Stderr != "" {
		run.Output = truncate(strings.TrimRight(result.Stdout+result.Stderr, "\n"), 8192)
	}
	if err := h.store.InsertActionRun(r.Context(), run); err != nil {
		h.log.Warn("insert action run", "error", err.Error())
	}
	severity := "info"
	message := fmt.Sprintf("%s ran (%s)", actionName, actor)
	if !result.OK {
		severity = "warning"
		message = fmt.Sprintf("%s failed with exit %d", actionName, result.ExitCode)
	}
	event := model.Event{NodeID: nodeID, Ts: time.Now().UnixMilli(), Kind: "action", Severity: severity, Message: message,
		Meta: metaJSON(map[string]any{"action": actionID, "run_id": run.ID, "actor": actor, "source": source, "exit_code": result.ExitCode})}
	if err := h.store.InsertEvent(r.Context(), &event); err == nil {
		h.bus.send("event", event)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          result.OK,
		"run_id":      run.ID,
		"exit_code":   result.ExitCode,
		"duration_ms": result.DurationMs,
		"stdout":      result.Stdout,
		"stderr":      result.Stderr,
		"truncated":   result.Truncated,
		"action":      actionName,
		"node_id":     nodeID,
	})
}

func (h *Hub) handleActionRuns(w http.ResponseWriter, r *http.Request) {
	nodeID := r.PathValue("id")
	if nodeID != "" && !tokenAllowsNode(identityFrom(r.Context()), nodeID) {
		apiError(w, http.StatusForbidden, "scope", "token is not allowed on this node")
		return
	}
	runs, err := h.store.ListActionRuns(r.Context(), nodeID, 100)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, runs)
}

// ---------- events ----------

func (h *Hub) handleEvents(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	filter := store.EventFilter{
		NodeID:   query.Get("node"),
		Severity: query.Get("severity"),
		Query:    query.Get("q"),
	}
	if kinds := query.Get("kind"); kinds != "" {
		filter.Kinds = strings.Split(kinds, ",")
	}
	if nodeID := filter.NodeID; nodeID != "" && !tokenAllowsNode(identityFrom(r.Context()), nodeID) {
		apiError(w, http.StatusForbidden, "scope", "token is not allowed on this node")
		return
	}
	if raw := query.Get("since"); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil {
			filter.Since = time.Now().Add(-parsed).UnixMilli()
		}
	}
	if raw := query.Get("limit"); raw != "" {
		fmt.Sscanf(raw, "%d", &filter.Limit)
	}
	events, err := h.store.ListEvents(r.Context(), filter)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, events)
}

func (h *Hub) handleEvent(w http.ResponseWriter, r *http.Request) {
	var id int64
	fmt.Sscanf(r.PathValue("id"), "%d", &id)
	event, err := h.store.GetEvent(r.Context(), id)
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found", "no such event")
		return
	}
	writeJSON(w, http.StatusOK, event)
}

// ---------- alerts, rules, channels ----------

func (h *Hub) handleAlerts(w http.ResponseWriter, r *http.Request) {
	firingOnly := r.URL.Query().Get("state") == "firing"
	alerts, err := h.store.ListAlerts(r.Context(), firingOnly, 200)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, alerts)
}

func (h *Hub) handleListRules(w http.ResponseWriter, r *http.Request) {
	rules, err := h.store.ListRules(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rules)
}

func (h *Hub) handleGetRule(w http.ResponseWriter, r *http.Request) {
	rule, err := h.store.GetRule(r.Context(), r.PathValue("id"))
	if err != nil {
		apiError(w, http.StatusNotFound, "not_found", "no such rule")
		return
	}
	writeJSON(w, http.StatusOK, rule)
}

func (h *Hub) handleSaveRule(w http.ResponseWriter, r *http.Request) {
	var rule model.AlertRule
	if err := decodeJSON(r, &rule); err != nil {
		apiError(w, http.StatusBadRequest, "json", "invalid body")
		return
	}
	if pathID := r.PathValue("id"); pathID != "" {
		rule.ID = pathID
	}
	if rule.Name == "" {
		apiError(w, http.StatusBadRequest, "name", "a rule needs a name")
		return
	}
	switch rule.Type {
	case "", "metric":
		rule.Type = "metric"
		if _, ok := metricNames[rule.Metric]; !ok {
			apiError(w, http.StatusBadRequest, "metric", "unknown metric")
			return
		}
	case "event":
		if len(rule.Kinds) == 0 {
			rule.Kinds = []string{"service", "container", "node", "system", "network", "action"}
		}
	default:
		apiError(w, http.StatusBadRequest, "type", "type must be metric or event")
		return
	}
	if rule.Comparator == "" {
		rule.Comparator = "gt"
	}
	if rule.Severity == "" {
		rule.Severity = "warning"
	}
	if rule.CooldownSec <= 0 {
		rule.CooldownSec = 300
	}
	if rule.DurationSec < 0 {
		rule.DurationSec = 0
	}
	if rule.ID == "" {
		rule.ID = randomID(6)
	}
	if rule.CreatedAt == 0 {
		rule.CreatedAt = time.Now().UnixMilli()
	}
	if rule.ChannelID != "" {
		if _, err := h.store.GetChannelRecord(r.Context(), rule.ChannelID); err != nil {
			apiError(w, http.StatusBadRequest, "channel", "no such channel")
			return
		}
	}
	if err := h.store.UpsertRule(r.Context(), rule); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rule)
}

func (h *Hub) handleDeleteRule(w http.ResponseWriter, r *http.Request) {
	if err := h.store.DeleteRule(r.Context(), r.PathValue("id")); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Hub) handleDeliveries(w http.ResponseWriter, r *http.Request) {
	var alertID int64
	if raw := r.URL.Query().Get("alert"); raw != "" {
		fmt.Sscanf(raw, "%d", &alertID)
	}
	deliveries, err := h.store.ListDeliveries(r.Context(), alertID, 100)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, deliveries)
}

func (h *Hub) handleChannels(w http.ResponseWriter, r *http.Request) {
	records, err := h.store.ListChannelRecords(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	out := make([]model.Channel, 0, len(records))
	for _, record := range records {
		out = append(out, h.channelView(record))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Hub) channelView(record store.ChannelRecord) model.Channel {
	channel := model.Channel{ID: record.ID, Name: record.Name, Kind: record.Kind, HasSecret: len(record.SecretEnc) > 0, CreatedAt: record.CreatedAt}
	var config channelConfig
	if body, err := decrypt(h.keys.key, record.ConfigEnc); err == nil {
		_ = json.Unmarshal(body, &config)
	}
	if parsed, err := url.Parse(config.URL); err == nil && parsed.Host != "" {
		channel.Target = parsed.Scheme + "://" + parsed.Host + "/…"
	} else if record.Kind == "telegram" {
		channel.Target = "telegram · configured"
	}
	return channel
}

type channelRequest struct {
	Name   string `json:"name"`
	Kind   string `json:"kind"`
	URL    string `json:"url"`
	Token  string `json:"token"`
	ChatID string `json:"chat_id"`
	Secret string `json:"secret"`
}

func (h *Hub) handleSaveChannel(w http.ResponseWriter, r *http.Request) {
	var body channelRequest
	if err := decodeJSON(r, &body); err != nil {
		apiError(w, http.StatusBadRequest, "json", "invalid body")
		return
	}
	if body.Name == "" || body.Kind == "" {
		apiError(w, http.StatusBadRequest, "name", "a channel needs a name and a kind")
		return
	}
	switch body.Kind {
	case "webhook", "ntfy", "discord", "slack":
		if body.URL == "" {
			apiError(w, http.StatusBadRequest, "url", "this channel needs a URL")
			return
		}
		if err := validateChannelURL(body.URL, h.cfg.AllowPrivateWebhooks); err != nil {
			apiError(w, http.StatusBadRequest, "url", err.Error())
			return
		}
	case "telegram":
		if body.Token == "" || body.ChatID == "" {
			apiError(w, http.StatusBadRequest, "token", "telegram needs a bot token and chat id")
			return
		}
	default:
		apiError(w, http.StatusBadRequest, "kind", "unknown channel kind")
		return
	}
	configBody, _ := json.Marshal(channelConfig{URL: body.URL, Token: body.Token, ChatID: body.ChatID})
	configEnc, err := encrypt(h.keys.key, configBody)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "encrypt", err.Error())
		return
	}
	var secretEnc []byte
	if body.Secret != "" {
		secretEnc, err = encrypt(h.keys.key, []byte(body.Secret))
		if err != nil {
			apiError(w, http.StatusInternalServerError, "encrypt", err.Error())
			return
		}
	}
	record := store.ChannelRecord{
		ID: randomID(6), Name: body.Name, Kind: body.Kind, ConfigEnc: configEnc, SecretEnc: secretEnc,
		CreatedAt: time.Now().UnixMilli(),
	}
	if pathID := r.PathValue("id"); pathID != "" {
		existing, err := h.store.GetChannelRecord(r.Context(), pathID)
		if err == nil {
			record.ID = existing.ID
			record.CreatedAt = existing.CreatedAt
			if secretEnc == nil {
				record.SecretEnc = existing.SecretEnc
			}
		}
	}
	if err := h.store.UpsertChannel(r.Context(), record); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, h.channelView(record))
}

func (h *Hub) handleDeleteChannel(w http.ResponseWriter, r *http.Request) {
	if err := h.store.DeleteChannel(r.Context(), r.PathValue("id")); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Hub) handleTestAlert(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ChannelID string `json:"channel_id"`
	}
	if err := decodeJSON(r, &body); err != nil || body.ChannelID == "" {
		apiError(w, http.StatusBadRequest, "channel", "channel_id is required")
		return
	}
	alert := model.Alert{
		ID: 0, RuleName: "Test alert", NodeID: "cupola", Ts: time.Now().UnixMilli(), State: "firing",
		Message: "This is a test delivery from Cupola",
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := h.notifier.deliver(ctx, alert, body.ChannelID); err != nil {
		apiError(w, http.StatusBadGateway, "delivery", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- tokens ----------

func (h *Hub) handleListTokens(w http.ResponseWriter, r *http.Request) {
	tokens, err := h.store.ListTokens(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	// JSON null for an empty allowlist makes clients branch on null; always send
	// an array.
	for i := range tokens {
		if tokens[i].Scopes == nil {
			tokens[i].Scopes = []string{}
		}
		if tokens[i].NodeIDs == nil {
			tokens[i].NodeIDs = []string{}
		}
		if tokens[i].ActionIDs == nil {
			tokens[i].ActionIDs = []string{}
		}
	}
	writeJSON(w, http.StatusOK, tokens)
}

func (h *Hub) handleCreateToken(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name      string   `json:"name"`
		Scopes    []string `json:"scopes"`
		NodeIDs   []string `json:"node_ids"`
		ActionIDs []string `json:"action_ids"`
		ExpiresAt int64    `json:"expires_at"`
	}
	if err := decodeJSON(r, &body); err != nil || body.Name == "" {
		apiError(w, http.StatusBadRequest, "name", "a token needs a name")
		return
	}
	if len(body.Scopes) == 0 {
		body.Scopes = []string{"read"}
	}
	for _, scope := range body.Scopes {
		if scope != "read" && scope != "actions:run" {
			apiError(w, http.StatusBadRequest, "scope", "scopes are read and actions:run")
			return
		}
	}
	id, _, token, hash, err := newAPIToken()
	if err != nil {
		apiError(w, http.StatusInternalServerError, "token", err.Error())
		return
	}
	record := model.APIToken{
		ID: id, Name: body.Name, Prefix: tokenPrefix(id, strings.SplitN(token, "_", 3)[2]),
		Scopes: body.Scopes, NodeIDs: body.NodeIDs, ActionIDs: body.ActionIDs,
		CreatedAt: time.Now().UnixMilli(), ExpiresAt: body.ExpiresAt,
	}
	if record.NodeIDs == nil {
		record.NodeIDs = []string{}
	}
	if record.ActionIDs == nil {
		record.ActionIDs = []string{}
	}
	if err := h.store.InsertToken(r.Context(), record, hash); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "record": record})
}

func (h *Hub) handleDeleteToken(w http.ResponseWriter, r *http.Request) {
	if err := h.store.DeleteToken(r.Context(), r.PathValue("id")); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- settings and stream ----------

func (h *Hub) handleSettings(w http.ResponseWriter, r *http.Request) {
	nodes, _ := h.store.ListNodeRecords(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"poll_interval_sec":      int(h.cfg.PollInterval.Seconds()),
		"retention_raw_hours":    48,
		"retention_minute_days":  30,
		"retention_hour_months":  13,
		"allow_private_webhooks": h.cfg.AllowPrivateWebhooks,
		"public_url":             h.cfg.PublicURL,
		"node_count":             len(nodes),
		"version":                version.Get(),
		"data_dir":               h.cfg.DataDir,
	})
}

func (h *Hub) handleStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		apiError(w, http.StatusInternalServerError, "stream", "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	messages, cancel := h.bus.subscribe()
	defer cancel()
	keepalive := time.NewTicker(20 * time.Second)
	defer keepalive.Stop()
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case message, ok := <-messages:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", message.event, message.data)
			flusher.Flush()
		case <-keepalive.C:
			fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}

// ---------- router ----------

func (h *Hub) routesHandler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", h.healthz())
		mux.HandleFunc("GET /install.sh", h.handleInstallScript)
	mux.HandleFunc("GET /install/cupola", h.handleInstallBinary)
	mux.HandleFunc("POST /api/v1/join", h.handleJoin)
	mux.HandleFunc("POST /api/v1/ingest", h.handleIngest)
	mux.Handle("POST /api/v1/join/codes", h.requireAdmin(http.HandlerFunc(h.handleCreateJoinCode)))
	mux.Handle("GET /api/v1/join/{id}/status", h.requireRead(http.HandlerFunc(h.handleJoinStatus)))
	mux.Handle("GET /api/v1/tailnet/peers", h.requireRead(http.HandlerFunc(h.handleTailnetPeers)))
mux.Handle("POST /api/v1/auth/password", h.requireAdmin(http.HandlerFunc(h.handleChangePassword)))
	mux.HandleFunc("POST /api/v1/auth/login", h.handleLogin)
	mux.HandleFunc("POST /api/v1/auth/logout", h.handleLogout)
	mux.Handle("GET /api/v1/auth/me", h.requireRead(http.HandlerFunc(h.handleMe)))

	mux.Handle("GET /api/v1/fleet/summary", h.requireRead(http.HandlerFunc(h.handleFleetSummary)))
	mux.Handle("GET /api/v1/nodes", h.requireRead(http.HandlerFunc(h.handleListNodes)))
	mux.Handle("GET /api/v1/agents", h.requireRead(http.HandlerFunc(h.handleFleetAgents)))
	mux.Handle("GET /api/v1/actions", h.requireRead(http.HandlerFunc(h.handleFleetActions)))
	mux.Handle("POST /api/v1/nodes", h.requireAdmin(http.HandlerFunc(h.handleCreateNode)))
	mux.Handle("GET /api/v1/nodes/{id}", h.requireRead(http.HandlerFunc(h.handleGetNode)))
	mux.Handle("PATCH /api/v1/nodes/{id}", h.requireAdmin(http.HandlerFunc(h.handleUpdateNode)))
	mux.Handle("DELETE /api/v1/nodes/{id}", h.requireAdmin(http.HandlerFunc(h.handleDeleteNode)))
	mux.Handle("POST /api/v1/nodes/{id}/test", h.requireAdmin(http.HandlerFunc(h.handleTestNode)))
	mux.Handle("GET /api/v1/nodes/{id}/snapshot", h.requireRead(http.HandlerFunc(h.handleNodeSnapshot)))
	mux.Handle("GET /api/v1/nodes/{id}/series", h.requireRead(http.HandlerFunc(h.handleSeries)))
	for _, part := range []string{"processes", "agents", "services", "containers", "ports"} {
		mux.Handle("GET /api/v1/nodes/{id}/"+part, h.requireRead(h.handleNodePart(part)))
	}
	mux.Handle("GET /api/v1/nodes/{id}/actions", h.requireRead(http.HandlerFunc(h.handleListActions)))
	mux.Handle("POST /api/v1/nodes/{id}/actions/{action}/run", h.requireActions(http.HandlerFunc(h.handleRunAction)))
	mux.Handle("GET /api/v1/nodes/{id}/action-runs", h.requireRead(http.HandlerFunc(h.handleActionRuns)))
	mux.Handle("GET /api/v1/action-runs", h.requireRead(http.HandlerFunc(h.handleActionRuns)))

	mux.Handle("GET /api/v1/events", h.requireRead(http.HandlerFunc(h.handleEvents)))
	mux.Handle("GET /api/v1/events/{id}", h.requireRead(http.HandlerFunc(h.handleEvent)))
	mux.Handle("GET /api/v1/alerts", h.requireRead(http.HandlerFunc(h.handleAlerts)))
	mux.Handle("GET /api/v1/alerts/rules", h.requireRead(http.HandlerFunc(h.handleListRules)))
	mux.Handle("POST /api/v1/alerts/rules", h.requireAdmin(http.HandlerFunc(h.handleSaveRule)))
	mux.Handle("GET /api/v1/alerts/rules/{id}", h.requireRead(http.HandlerFunc(h.handleGetRule)))
	mux.Handle("PATCH /api/v1/alerts/rules/{id}", h.requireAdmin(http.HandlerFunc(h.handleSaveRule)))
	mux.Handle("DELETE /api/v1/alerts/rules/{id}", h.requireAdmin(http.HandlerFunc(h.handleDeleteRule)))
	mux.Handle("GET /api/v1/alerts/deliveries", h.requireRead(http.HandlerFunc(h.handleDeliveries)))
	mux.Handle("POST /api/v1/alerts/test", h.requireAdmin(http.HandlerFunc(h.handleTestAlert)))
	mux.Handle("GET /api/v1/channels", h.requireRead(http.HandlerFunc(h.handleChannels)))
	mux.Handle("POST /api/v1/channels", h.requireAdmin(http.HandlerFunc(h.handleSaveChannel)))
	mux.Handle("PATCH /api/v1/channels/{id}", h.requireAdmin(http.HandlerFunc(h.handleSaveChannel)))
	mux.Handle("DELETE /api/v1/channels/{id}", h.requireAdmin(http.HandlerFunc(h.handleDeleteChannel)))
	mux.Handle("GET /api/v1/tokens", h.requireAdmin(http.HandlerFunc(h.handleListTokens)))
	mux.Handle("POST /api/v1/tokens", h.requireAdmin(http.HandlerFunc(h.handleCreateToken)))
	mux.Handle("DELETE /api/v1/tokens/{id}", h.requireAdmin(http.HandlerFunc(h.handleDeleteToken)))
	mux.Handle("GET /api/v1/settings", h.requireRead(http.HandlerFunc(h.handleSettings)))
	mux.Handle("GET /api/v1/update", h.requireRead(http.HandlerFunc(h.handleUpdateStatus)))
	mux.Handle("POST /api/v1/update", h.requireAdmin(http.HandlerFunc(h.handleUpdateApply)))
	mux.Handle("DELETE /api/v1/update", h.requireAdmin(http.HandlerFunc(h.handleUpdateCancel)))
	mux.Handle("GET /api/v1/stream", h.requireRead(http.HandlerFunc(h.handleStream)))
	mux.Handle("/", h.spa())
	return h.security(h.cors(mux))
}

// security adds the headers the hub owns (the static host adds HSTS when it
// terminates TLS).
func (h *Hub) security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		if strings.HasPrefix(h.cfg.PublicURL, "https://") || r.TLS != nil {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Hub) cors(next http.Handler) http.Handler {
	allowed := make(map[string]bool, len(h.cfg.CORSOrigins))
	for _, origin := range h.cfg.CORSOrigins {
		allowed[origin] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------- helpers ----------

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func apiError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func decodeJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	return nil
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}

// handleFleetAgents lists the AI sessions from every node's latest snapshot.
func (h *Hub) handleFleetAgents(w http.ResponseWriter, r *http.Request) {
	nodes, err := h.store.ListNodeRecords(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	type row struct {
		NodeID   string `json:"node_id"`
		NodeName string `json:"node_name"`
		model.AgentSession
	}
	out := make([]row, 0)
	for _, node := range nodes {
		snap, err := h.store.GetState(r.Context(), node.ID)
		if err != nil || snap == nil {
			continue
		}
		for _, session := range snap.Agents {
			out = append(out, row{NodeID: node.ID, NodeName: node.Name, AgentSession: session})
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// handleFleetActions lists the actions advertised by every node.
func (h *Hub) handleFleetActions(w http.ResponseWriter, r *http.Request) {
	nodes, err := h.store.ListNodeRecords(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	type row struct {
		NodeID   string `json:"node_id"`
		NodeName string `json:"node_name"`
		model.Action
	}
	out := make([]row, 0)
	for _, node := range nodes {
		actions, err := h.store.GetActions(r.Context(), node.ID)
		if err != nil {
			continue
		}
		for _, action := range actions {
			out = append(out, row{NodeID: node.ID, NodeName: node.Name, Action: action})
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// handleChangePassword lets the signed-in admin rotate the hub password. The
// current password is required; the session stays valid.
func (h *Hub) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	if !h.limiter.allow("password:" + ip) {
		apiError(w, http.StatusTooManyRequests, "rate_limit", "too many attempts; wait a minute")
		return
	}
	var body struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		apiError(w, http.StatusBadRequest, "json", "invalid body")
		return
	}
	if !verifyPassword(body.Current, h.keys.adminHash) {
		apiError(w, http.StatusUnauthorized, "password", "the current password is wrong")
		return
	}
	if len(body.New) < 10 {
		apiError(w, http.StatusBadRequest, "password", "the new password needs at least 10 characters")
		return
	}
	hash, err := hashPassword(body.New)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "password", err.Error())
		return
	}
	if err := h.store.SetSetting(r.Context(), "admin_hash", hash); err != nil {
		apiError(w, http.StatusInternalServerError, "store", err.Error())
		return
	}
	h.mu.Lock()
	h.keys.adminHash = hash
	h.mu.Unlock()
	h.log.Info("admin password changed")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
