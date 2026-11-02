import { Link } from 'react-router-dom';
import { netRate, percent } from '../lib/format';
import type { NodeStatus, NodeView } from '../data/types';

const STATUS_RANK: Record<NodeStatus, number> = { degraded: 0, offline: 1, healthy: 2, unknown: 3 };

type Column = {
  key: 'cpu' | 'mem' | 'disk' | 'net';
  label: string;
  value: (view: NodeView) => number | null;
  text: (view: NodeView) => string;
  /** narrow screens: a bare figure, its unit moved to the header */
  short?: { label: string; text: (view: NodeView) => string };
  level: (view: NodeView, maxNet: number) => number;
  tone: (level: number) => 'warning' | 'negative' | undefined;
};

const percentLevel = (value: number | null) => {
  if (value === null) return -1;
  if (value >= 90) return 4;
  if (value >= 75) return 3;
  if (value >= 50) return 2;
  if (value >= 25) return 1;
  return 0;
};

const percentTone = (level: number) => (level >= 4 ? 'negative' : level === 3 ? 'warning' : undefined);

const COLUMNS: Column[] = [
  {
    key: 'cpu',
    label: 'CPU',
    value: (view) => (view.health.status === 'offline' ? null : view.health.cpu_pct),
    text: (view) => (view.health.status === 'offline' ? '—' : percent(view.health.cpu_pct)),
    level: (view) => percentLevel(view.health.status === 'offline' ? null : view.health.cpu_pct),
    tone: percentTone,
  },
  {
    key: 'mem',
    label: 'Memory',
    value: (view) => (view.health.status === 'offline' ? null : view.health.mem_pct),
    text: (view) => (view.health.status === 'offline' ? '—' : percent(view.health.mem_pct)),
    level: (view) => percentLevel(view.health.status === 'offline' ? null : view.health.mem_pct),
    tone: percentTone,
  },
  {
    key: 'disk',
    label: 'Root disk',
    value: (view) => (view.health.status === 'offline' ? null : view.health.root_disk_pct),
    text: (view) => (view.health.status === 'offline' ? '—' : percent(view.health.root_disk_pct)),
    level: (view) => percentLevel(view.health.status === 'offline' ? null : view.health.root_disk_pct),
    tone: percentTone,
  },
  {
    key: 'net',
    label: 'Network',
    value: (view) => (view.health.status === 'offline' ? null : view.health.net_rx_bps),
    text: (view) => (view.health.status === 'offline' ? '—' : netRate(view.health.net_rx_bps || 0)),
    short: {
      label: 'Mbit/s',
      text: (view) => (view.health.status === 'offline' ? '—' : (((view.health.net_rx_bps || 0) * 8) / 1e6).toFixed(1)),
    },
    level: (view, maxNet) => {
      if (view.health.status === 'offline') return -1;
      const value = view.health.net_rx_bps || 0;
      if (value <= 0) return 0;
      const ratio = value / maxNet;
      return ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
    },
    tone: () => undefined,
  },
];

/**
 * The fleet at a glance: one row per box and four dimensions as heat cells
 * (CPU, memory, root disk, network). Each cell is a current reading, not a
 * series, so nothing implies a relation between dimensions. Intensity is the
 * share of that dimension: percent for the first three, relative to the
 * busiest box for network. A whole row opens the node.
 */
export function FleetGrid({ nodes, selectedId }: { nodes: NodeView[]; selectedId?: string }) {
  const rows = [...nodes].sort((a, b) => {
    const rank = STATUS_RANK[a.health.status] - STATUS_RANK[b.health.status];
    return rank !== 0 ? rank : a.node.name.localeCompare(b.node.name);
  });
  const maxNet = Math.max(...nodes.map((view) => view.health.net_rx_bps || 0), 1);

  return (
    <div className="fleet-grid" role="table" aria-label="Fleet at a glance">
      <div className="fleet-grid-head" role="row">
        <span role="columnheader" className="fleet-grid-node">
          Node
        </span>
        {COLUMNS.map((column) => (
          <span key={column.key} role="columnheader" className="fleet-grid-cell">
            {column.short ? (
              <>
                <span className="fleet-long">{column.label}</span>
                <span className="fleet-short" aria-hidden="true">{column.short.label}</span>
              </>
            ) : (
              column.label
            )}
          </span>
        ))}
        <span role="columnheader" className="fleet-grid-status" aria-label="Status">
          <span className="fleet-long">Status</span>
        </span>
      </div>
      {rows.map((view) => {
        const selected = view.node.id === selectedId;
        const offline = view.health.status === 'offline';
        return (
          <Link
            key={view.node.id}
            to={`/nodes/${view.node.id}`}
            className="fleet-row"
            role="row"
            data-status={view.health.status}
            data-selected={selected ? 'true' : undefined}
            aria-label={`${view.node.name}: ${view.health.status}`}
          >
            <span role="cell" className="fleet-grid-node">
              <span className="fleet-row-name">{view.node.name}</span>
              <span className="fleet-row-sub">
                {view.node.os || 'unknown OS'} · {view.node.arch}
              </span>
            </span>
            {COLUMNS.map((column) => {
              const value = column.value(view);
              const level = column.level(view, maxNet);
              const tone = column.tone(level);
              return (
                <span
                  key={column.key}
                  role="cell"
                  className="fleet-cell"
                  data-level={level >= 0 ? level : undefined}
                  data-tone={tone}
                  data-missing={value === null ? 'true' : undefined}
                  aria-label={`${column.label}: ${column.text(view)}`}
                >
                  {column.short ? (
                    <>
                      <span className="fleet-long">{column.text(view)}</span>
                      <span className="fleet-short">{column.short.text(view)}</span>
                    </>
                  ) : (
                    column.text(view)
                  )}
                </span>
              );
            })}
            <span role="cell" className="fleet-grid-status" data-status={view.health.status}>
              <span className="dot-mark" data-severity={offline ? 'critical' : view.health.status === 'degraded' ? 'warning' : 'info'} aria-hidden="true" />
              <span className="fleet-status-text">{view.health.status}</span>
            </span>
          </Link>
        );
      })}
      <div className="fleet-grid-foot">
        <span className="fleet-scale" aria-hidden="true">
          <span className="fleet-scale-label">0%</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className="fleet-scale-step" data-level={level} />
          ))}
          <span className="fleet-scale-label">100%</span>
        </span>
        <span className="note">Network is relative to the busiest box; the other columns are percent of capacity.</span>
      </div>
    </div>
  );
}
