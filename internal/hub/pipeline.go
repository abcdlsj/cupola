package hub

import (
	"context"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

// processSnapshot is the single write path for a node sample. The pull source
// (poller.go) and the push source (ingest.go) both end here, so events, alert
// rules, health and the SSE bus cannot drift between modes.
//
// normaliseSections keeps every section an array: a nil Go slice marshals as
// JSON null, and the PWA reads .length on these without a guard, so one missing
// section used to blank the whole node page.
func normaliseSections(snap *model.Snapshot) {
	if snap.Disks == nil {
		snap.Disks = []model.DiskStats{}
	}
	if snap.Network == nil {
		snap.Network = []model.NetStats{}
	}
	if snap.Processes == nil {
		snap.Processes = []model.Process{}
	}
	if snap.Ports == nil {
		snap.Ports = []model.Port{}
	}
	// Older agents send kernel threads and client sockets; keep the hub's stored
	// shape identical to a current agent's so the UI and the alerts agree.
	snap.Processes = model.PruneProcesses(snap.Processes)
	snap.Ports = model.PrunePorts(snap.Ports)
	if snap.Services == nil {
		snap.Services = []model.Service{}
	}
	// Older agents send every systemd unit type; keep the hub's stored shape
	// identical to a current agent's so the UI, alerts and diffs agree.
	snap.Services = model.PruneServices(snap.Services)
	if snap.Containers == nil {
		snap.Containers = []model.Container{}
	}
	if snap.Images == nil {
		snap.Images = []model.Image{}
	}
	if snap.Sensors == nil {
		snap.Sensors = []model.Sensor{}
	}
	if snap.GPUs == nil {
		snap.GPUs = []model.GPU{}
	}
	if snap.SMART == nil {
		snap.SMART = []model.SMARTDevice{}
	}
	if snap.Users == nil {
		snap.Users = []model.User{}
	}
	if snap.Node.Labels == nil {
		snap.Node.Labels = []string{}
	}
	if snap.CPU.PerCore == nil {
		snap.CPU.PerCore = []float64{}
	}
	for i := range snap.Containers {
		if snap.Containers[i].Ports == nil {
			snap.Containers[i].Ports = []string{}
		}
	}
}

func (p *poller) processSnapshot(ctx context.Context, node model.NodeRecord, snap *model.Snapshot, actions []model.Action) {
	normaliseSections(snap)
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
