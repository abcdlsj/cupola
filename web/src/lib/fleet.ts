import type { Event, NodeView } from '../data/types';

/** The figures a systems row shows, read from the health record and the last snapshot. */
export interface NodeFigures {
  online: boolean;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  gpu: number | null;
  /** bytes per second, received + sent, loopback excluded */
  net: number | null;
  rx: number | null;
  tx: number | null;
  load: [number, number, number] | null;
  temp: number | null;
  agents: number;
}

/**
 * The fleet list carries the health record, not the snapshot, so every figure
 * here comes from it. A node that is down or has not answered yet has none.
 */
export function nodeFigures(view: NodeView): NodeFigures {
  const health = view.health;
  const online = health.status === 'healthy' || health.status === 'degraded';
  if (!online) {
    return { online: false, cpu: null, mem: null, disk: null, gpu: null, net: null, rx: null, tx: null, load: null, temp: null, agents: health.agents };
  }
  const rx = health.net_rx_bps ?? 0;
  const tx = health.net_tx_bps ?? 0;
  return {
    online: true,
    cpu: health.cpu_pct,
    mem: health.mem_pct,
    disk: health.root_disk_total ? health.root_disk_pct : null,
    gpu: health.gpu_pct ?? null,
    net: rx + tx,
    rx,
    tx,
    load: [health.load1, health.load5 ?? health.load1, health.load15 ?? health.load1],
    temp: health.temp_max_c ?? null,
    agents: health.agents,
  };
}

export interface Finding {
  key: string;
  nodeId: string;
  nodeName: string;
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  ts: number;
}

/**
 * What needs a look, newest first: every node that stopped answering, then one
 * finding per node and event kind from the last 24 hours.
 */
export function findings(nodes: NodeView[], events: Event[], now: number): Finding[] {
  const names = new Map(nodes.map((view) => [view.node.id, view.node.name]));
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const view of nodes) {
    if (view.health.status !== 'offline') continue;
    seen.add(`${view.node.id}:node.offline`);
    out.push({
      key: `offline-${view.node.id}`,
      nodeId: view.node.id,
      nodeName: view.node.name,
      severity: 'critical',
      title: 'System down',
      detail: view.node.last_seen ? 'no answer since its last poll' : 'never answered',
      ts: view.node.last_seen || now,
    });
  }
  for (const event of events) {
    if (event.severity === 'info' || now - event.ts > 24 * 3600 * 1000) continue;
    const key = `${event.node_id}:${event.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key: `event-${event.id}`,
      nodeId: event.node_id,
      nodeName: names.get(event.node_id) ?? event.node_id,
      severity: event.severity,
      title: event.message,
      detail: event.kind,
      ts: event.ts,
    });
  }
  return out;
}
