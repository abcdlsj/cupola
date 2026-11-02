package hub

import (
	"context"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

// processSnapshot is the single write path for a node sample. The pull source
// (poller.go) and the push source (ingest.go) both end here, so events, alert
// rules, health and the SSE bus cannot drift between modes.
func (p *poller) processSnapshot(ctx context.Context, node model.NodeRecord, snap *model.Snapshot, actions []model.Action) {
	now := time.Now().UnixMilli()
	if err := p.hub.store.SaveSnapshot(ctx, snap, actions); err != nil {
		p.hub.log.Warn("save snapshot", "node", node.ID, "error", err.Error())
		return
	}
	if err := p.hub.store.UpdateNodeMeta(ctx, node.ID, snap.Node.AgentVersion, snap.Node.Platform, snap.Node.Kernel, snap.Node.Arch); err != nil {
		p.hub.log.Warn("update node", "node", node.ID, "error", err.Error())
	}
	status := snapshotStatus(snap)
	if err := p.hub.store.SetNodeStatus(ctx, node.ID, status, now); err != nil {
		p.hub.log.Warn("set status", "node", node.ID, "error", err.Error())
	}

	p.mu.Lock()
	wasOffline := p.wasOffline[node.ID]
	previous := p.prev[node.ID]
	p.wasOffline[node.ID] = false
	p.failures[node.ID] = 0
	delete(p.nextTry, node.ID)
	p.prev[node.ID] = snap
	p.mu.Unlock()

	if wasOffline {
		p.emit(ctx, model.Event{
			NodeID: node.ID, Ts: now, Kind: "node", Severity: "info",
			Message: "Agent is reporting again",
		})
	}

	for _, event := range diffEvents(previous, snap, node.ID, now) {
		p.emit(ctx, event)
	}
	p.evaluateMetricRules(ctx, node, snap, now)

	health := p.health(ctx, node.ID, status, snap)
	p.hub.bus.send("node", map[string]any{
		"node_id": node.ID,
		"status":  status,
		"health":  health,
		"ts":      now,
	})
}

// ingestInterval is the cadence the hub suggests to a push agent.
func (p *poller) ingestInterval() time.Duration { return p.interval }
