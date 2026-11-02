package hub

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

// poller owns the sample pipeline and the pull source. Push nodes (see
// ingest.go) share processSnapshot but are never dialled from here.
type poller struct {
	hub      *Hub
	interval time.Duration

	mu         sync.Mutex
	failures   map[string]int
	nextTry    map[string]time.Time
	wasOffline map[string]bool
	prev       map[string]*model.Snapshot
}

func newPoller(h *Hub, interval time.Duration) *poller {
	return &poller{
		hub:        h,
		interval:   interval,
		failures:   make(map[string]int),
		nextTry:    make(map[string]time.Time),
		wasOffline: make(map[string]bool),
		prev:       make(map[string]*model.Snapshot),
	}
}

func (p *poller) Run(ctx context.Context) {
	// Materialise rollups once at start so a restart immediately serves 6h+
	// windows from the 1m/1h tables.
	if err := p.hub.store.Rollup(ctx, time.Now().UnixMilli()); err != nil {
		p.hub.log.Warn("rollup failed", "error", err.Error())
	}
	p.pollAll(ctx)
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	rollup := time.NewTicker(2 * time.Minute)
	defer rollup.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.pollAll(ctx)
			p.sweepOffline(ctx)
		case <-rollup.C:
			if err := p.hub.store.Rollup(ctx, time.Now().UnixMilli()); err != nil {
				p.hub.log.Warn("rollup failed", "error", err.Error())
			}
		}
	}
}

func (p *poller) pollAll(ctx context.Context) {
	nodes, err := p.hub.store.ListNodeRecords(ctx)
	if err != nil {
		p.hub.log.Warn("list nodes", "error", err.Error())
		return
	}
	sem := make(chan struct{}, 8)
	var wg sync.WaitGroup
	for _, node := range nodes {
		if ctx.Err() != nil {
			break
		}
		if node.Mode != "" && node.Mode != "pull" {
			continue // push nodes report on their own schedule
		}
		if !p.due(node.ID) {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(node model.NodeRecord) {
			defer wg.Done()
			defer func() { <-sem }()
			p.pollNode(ctx, node)
		}(node)
	}
	wg.Wait()
}

// due reports whether a failing node has finished its backoff window.
func (p *poller) due(id string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	at, ok := p.nextTry[id]
	return !ok || time.Now().After(at)
}

// noteFailure grows a per-node backoff (5 s doubling to 5 min) so a dead node
// cannot occupy the poll semaphore every tick.
func (p *poller) noteFailure(id string) {
	p.mu.Lock()
	p.failures[id]++
	failures := p.failures[id]
	p.mu.Unlock()
	delay := p.interval
	for i := 1; i < failures && delay < 5*time.Minute; i++ {
		delay *= 2
	}
	if delay > 5*time.Minute {
		delay = 5 * time.Minute
	}
	p.mu.Lock()
	p.nextTry[id] = time.Now().Add(delay)
	p.mu.Unlock()
}

func (p *poller) pollNode(ctx context.Context, node model.NodeRecord) {
	secret, err := p.hub.store.GetNodeSecret(ctx, node.ID)
	if err != nil {
		p.hub.log.Warn("node secret", "node", node.ID, "error", err.Error())
		return
	}
	endpoint, err := p.hub.transport.endpoint(ctx, secret)
	if err != nil {
		p.hub.log.Warn("node endpoint", "node", node.ID, "error", err.Error())
		p.noteFailure(node.ID)
		return
	}
	pollCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	snap, err := fetchSnapshot(pollCtx, endpoint)
	if err != nil {
		p.hub.log.Warn("poll failed", "node", node.ID, "error", sanitizeError(err))
		p.noteFailure(node.ID)
		return
	}
	if snap.Node.ID == "" {
		snap.Node.ID = node.ID
	}
	actions, err := fetchActions(pollCtx, endpoint)
	if err != nil {
		if previous, err := p.hub.store.GetActions(ctx, node.ID); err == nil {
			actions = previous
		}
	}
	p.processSnapshot(ctx, node, snap, actions)
}

// sweepOffline marks a node offline when nothing has arrived for three
// intervals, whatever the mode. last_seen stays at the last good sample.
func (p *poller) sweepOffline(ctx context.Context) {
	nodes, err := p.hub.store.ListNodeRecords(ctx)
	if err != nil {
		return
	}
	now := time.Now().UnixMilli()
	limit := int64(3 * p.interval / time.Millisecond)
	for _, node := range nodes {
		if node.LastSeen == 0 || node.Status == "offline" {
			continue
		}
		if now-node.LastSeen <= limit {
			continue
		}
		p.mu.Lock()
		already := p.wasOffline[node.ID]
		p.wasOffline[node.ID] = true
		p.mu.Unlock()
		if already {
			continue
		}
		_ = p.hub.store.SetNodeStatus(ctx, node.ID, "offline", node.LastSeen)
		p.emit(ctx, model.Event{NodeID: node.ID, Ts: now, Kind: "node", Severity: "critical",
			Message: "Agent stopped reporting"})
		p.hub.bus.send("node", map[string]any{"node_id": node.ID, "status": "offline", "ts": now})
	}
}

func (p *poller) health(ctx context.Context, nodeID, status string, snap *model.Snapshot) model.NodeHealth {
	days := 0.0
	if snap != nil {
		for _, disk := range snap.Disks {
			if disk.Mount != "/" {
				continue
			}
			since := time.Now().Add(-7 * 24 * time.Hour).UnixMilli()
			if history, err := p.hub.store.DiskHistory(ctx, nodeID, disk.Mount, since); err == nil {
				days = daysToFull(history)
			}
		}
	}
	attention, _ := p.hub.attentionCount(ctx, nodeID, snap, days)
	record, _ := p.hub.store.GetNode(ctx, nodeID)
	record.Status = status
	return nodeHealth(record, snap, days, attention)
}

func (p *poller) emit(ctx context.Context, event model.Event) {
	if event.Ts == 0 {
		event.Ts = time.Now().UnixMilli()
	}
	if err := p.hub.store.InsertEvent(ctx, &event); err != nil {
		p.hub.log.Warn("insert event", "node", event.NodeID, "error", err.Error())
		return
	}
	p.hub.bus.send("event", event)
	p.evaluateEventRules(ctx, event)
}

func snapshotStatus(snap *model.Snapshot) string {
	if snap == nil {
		return "unknown"
	}
	for _, service := range snap.Services {
		if service.ActiveState == "failed" {
			return "degraded"
		}
	}
	for _, disk := range snap.Disks {
		if disk.UsedPct >= 90 {
			return "degraded"
		}
	}
	if snap.Memory.UsedPercent >= 95 {
		return "degraded"
	}
	return "healthy"
}

// sanitizeError keeps the transport reason and drops hosts, addresses and URLs
// from agent failures; the hub log is not the place to learn a node's address.
func sanitizeError(err error) string {
	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "refused"):
		return "agent refused the connection"
	case strings.Contains(message, "timeout"), strings.Contains(message, "deadline"):
		return "agent timed out"
	case strings.Contains(message, "no such host"), strings.Contains(message, "not found"):
		return "agent host not found"
	case strings.Contains(message, "401"), strings.Contains(message, "unauthorized"):
		return "agent rejected the token"
	case strings.Contains(message, "certificate"), strings.Contains(message, "tls"):
		return "agent TLS check failed"
	default:
		return "agent unreachable"
	}
}

// ---------- diffing ----------

func diffEvents(previous, current *model.Snapshot, nodeID string, now int64) []model.Event {
	if previous == nil || current == nil {
		return nil
	}
	var events []model.Event
	if previous.Node.BootTime != 0 && current.Node.BootTime != 0 && previous.Node.BootTime != current.Node.BootTime {
		events = append(events, model.Event{NodeID: nodeID, Ts: now, Kind: "system", Severity: "info", Message: "Rebooted (boot time changed)"})
	}
	previousFailed := map[string]bool{}
	for _, service := range previous.Services {
		if service.ActiveState == "failed" {
			previousFailed[service.Name] = true
		}
	}
	for _, service := range current.Services {
		if service.ActiveState == "failed" && !previousFailed[service.Name] {
			events = append(events, model.Event{NodeID: nodeID, Ts: now, Kind: "service", Severity: "warning",
				Message: "Unit failed: " + service.Name, Meta: metaJSON(map[string]any{"unit": service.Name})})
		}
	}
	previousContainers := map[string]model.Container{}
	for _, container := range previous.Containers {
		previousContainers[container.Name] = container
	}
	for _, container := range current.Containers {
		old, ok := previousContainers[container.Name]
		if !ok {
			continue
		}
		if old.State != container.State {
			severity := "info"
			if container.State != "running" {
				severity = "warning"
			}
			events = append(events, model.Event{NodeID: nodeID, Ts: now, Kind: "container", Severity: severity,
				Message: fmt.Sprintf("Container %s: %s → %s", container.Name, old.State, container.State),
				Meta:    metaJSON(map[string]any{"container": container.Name})})
		}
		if container.Restarts > old.Restarts {
			events = append(events, model.Event{NodeID: nodeID, Ts: now, Kind: "container", Severity: "warning",
				Message: fmt.Sprintf("Container %s restarted (%d total)", container.Name, container.Restarts),
				Meta:    metaJSON(map[string]any{"container": container.Name})})
		}
	}
	previousPorts := map[string]model.Port{}
	for _, port := range previous.Ports {
		previousPorts[fmt.Sprintf("%s/%d", port.Proto, port.Port)] = port
	}
	for _, port := range current.Ports {
		key := fmt.Sprintf("%s/%d", port.Proto, port.Port)
		if _, ok := previousPorts[key]; ok {
			continue
		}
		process := port.Process
		if process == "" {
			process = "unknown process"
		}
		events = append(events, model.Event{NodeID: nodeID, Ts: now, Kind: "network", Severity: "info",
			Message: fmt.Sprintf("New listening port %d/%s (%s)", port.Port, port.Proto, process),
			Meta:    metaJSON(map[string]any{"port": port.Port, "proto": port.Proto, "process": port.Process})})
	}
	return events
}

func metaJSON(value any) string {
	body, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(body)
}

// ---------- alert evaluation ----------

func (p *poller) evaluateMetricRules(ctx context.Context, node model.NodeRecord, snap *model.Snapshot, now int64) {
	rules, err := p.hub.store.ListRules(ctx)
	if err != nil {
		p.hub.log.Warn("list rules", "error", err.Error())
		return
	}
	sort.Slice(rules, func(i, j int) bool { return rules[i].ID < rules[j].ID })
	for _, rule := range rules {
		if !rule.Enabled || rule.Type != "metric" {
			continue
		}
		if rule.NodeID != "" && rule.NodeID != node.ID {
			continue
		}
		value, ok := metricValue(snap, rule.Metric)
		if !ok {
			continue
		}
		met := conditionMet(rule.Comparator, value, rule.Threshold)
		state, since, _, notified, err := p.hub.store.GetAlertState(ctx, rule.ID, node.ID)
		if err != nil {
			continue
		}
		if met {
			if state == "firing" {
				continue
			}
			if state == "" || since == 0 {
				_ = p.hub.store.SetAlertState(ctx, rule.ID, node.ID, "pending", now, value, notified)
				continue
			}
			if now-since < int64(rule.DurationSec)*1000 {
				continue
			}
			alert := model.Alert{
				RuleID: rule.ID, RuleName: rule.Name, NodeID: node.ID, Ts: now, State: "firing", Value: value,
				Message: fmt.Sprintf("%s is %.1f (threshold %s %.1f) on %s", metricLabel(rule.Metric), value, comparatorSymbol(rule.Comparator), rule.Threshold, node.ID),
			}
			if err := p.hub.store.InsertAlert(ctx, &alert); err != nil {
				continue
			}
			_ = p.hub.store.SetAlertState(ctx, rule.ID, node.ID, "firing", since, value, now)
			p.hub.bus.send("alert", alert)
			p.hub.notifier.notifyAsync(alert, rule.ChannelID)
			continue
		}
		switch state {
		case "firing":
			alert := model.Alert{
				RuleID: rule.ID, RuleName: rule.Name, NodeID: node.ID, Ts: now, State: "resolved", Value: value,
				Message: fmt.Sprintf("%s recovered on %s (%.1f)", metricLabel(rule.Metric), node.ID, value),
			}
			if err := p.hub.store.InsertAlert(ctx, &alert); err == nil {
				p.hub.bus.send("alert", alert)
				p.hub.notifier.notifyAsync(alert, rule.ChannelID)
			}
			_ = p.hub.store.ClearAlertState(ctx, rule.ID, node.ID)
		case "pending":
			_ = p.hub.store.ClearAlertState(ctx, rule.ID, node.ID)
		}
	}
}

func (p *poller) evaluateEventRules(ctx context.Context, event model.Event) {
	rules, err := p.hub.store.ListRules(ctx)
	if err != nil {
		return
	}
	for _, rule := range rules {
		if !rule.Enabled || rule.Type != "event" {
			continue
		}
		if rule.NodeID != "" && rule.NodeID != event.NodeID {
			continue
		}
		if len(rule.Kinds) > 0 && !contains(rule.Kinds, event.Kind) {
			continue
		}
		if rule.Severity != "" && rule.Severity != event.Severity {
			continue
		}
		state, _, _, notified, _ := p.hub.store.GetAlertState(ctx, rule.ID, event.NodeID)
		if state == "event" && notified > 0 && time.Now().UnixMilli()-notified < int64(rule.CooldownSec)*1000 {
			continue
		}
		alert := model.Alert{
			RuleID: rule.ID, RuleName: rule.Name, NodeID: event.NodeID, Ts: event.Ts, State: "firing",
			Message: event.Message,
		}
		if err := p.hub.store.InsertAlert(ctx, &alert); err != nil {
			continue
		}
		_ = p.hub.store.SetAlertState(ctx, rule.ID, event.NodeID, "event", event.Ts, 0, time.Now().UnixMilli())
		p.hub.bus.send("alert", alert)
		p.hub.notifier.notifyAsync(alert, rule.ChannelID)
	}
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func metricLabel(metric string) string {
	switch metric {
	case "cpu":
		return "CPU"
	case "mem":
		return "Memory"
	case "load":
		return "Load 1m"
	case "disk":
		return "Disk"
	case "inode":
		return "Inodes"
	case "temp":
		return "Temperature"
	case "psi_cpu":
		return "CPU pressure"
	case "psi_io":
		return "IO pressure"
	}
	return metric
}

func comparatorSymbol(comparator string) string {
	if comparator == "lt" {
		return "<"
	}
	return ">"
}

// ---------- agent HTTP ----------

func fetchSnapshot(ctx context.Context, endpoint nodeEndpoint) (*model.Snapshot, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.Base+"/v1/snapshot", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+endpoint.Token)
	response, err := endpoint.HTTP.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 512))
		return nil, fmt.Errorf("agent returned %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}
	var snap model.Snapshot
	if err := json.NewDecoder(response.Body).Decode(&snap); err != nil {
		return nil, err
	}
	return &snap, nil
}

func fetchActions(ctx context.Context, endpoint nodeEndpoint) ([]model.Action, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.Base+"/v1/actions", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+endpoint.Token)
	response, err := endpoint.HTTP.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("actions request failed")
	}
	var body struct {
		Actions []model.Action `json:"actions"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		return nil, err
	}
	return body.Actions, nil
}
