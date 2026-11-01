import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { netRate, percent } from '../lib/format';
import { identityColor } from '../lib/chart';
import type { NodeView } from '../data/types';

interface FleetRow {
  id: string;
  name: string;
  status: string;
  values: [number, number, number, number];
  networkBps: number;
}

const AXES = ['CPU', 'Memory', 'Root disk', 'Network'] as const;
const AXES_SHORT = ['CPU', 'Mem', 'Disk', 'Net'] as const;

function rowsOf(nodes: NodeView[]): FleetRow[] {
  return nodes.map((view) => ({
    id: view.node.id,
    name: view.node.name,
    status: view.health.status,
    values: [
      Math.max(0, Math.min(100, view.health.cpu_pct || 0)),
      Math.max(0, Math.min(100, view.health.mem_pct || 0)),
      Math.max(0, Math.min(100, view.health.root_disk_pct || 0)),
      0,
    ] as [number, number, number, number],
    networkBps: view.health.net_rx_bps || 0,
  }));
}

function networkCeiling(values: number[]): number {
  const max = Math.max(...values, 1);
  for (const step of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    if (max <= step) return step;
  }
  return Math.ceil(max / 1000) * 1000;
}

/**
 * The fleet at a glance: one thin line per box across four shared axes (CPU,
 * memory, root disk, network). Outliers show as spikes; a flat line is a box
 * with nothing to report. Click or press Enter on a line to open the node.
 */
export function FleetProfile({
  nodes,
  selectedId,
  height = 232,
}: {
  nodes: NodeView[];
  selectedId?: string;
  height?: number;
}) {
  const navigate = useNavigate();
  const host = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0) setWidth(element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => rowsOf(nodes), [nodes]);
  const ceiling = useMemo(() => networkCeiling(rows.map((row) => (row.networkBps * 8) / 1e6)), [rows]);

  const narrow = width < 520;
  const left = 6;
  const right = Math.max(left + 120, width - 10);
  const top = 30;
  const bottom = height - 12;
  const span = Math.max(1, bottom - top);

  const scaled = (row: FleetRow): number[] => [
    row.values[0],
    row.values[1],
    row.values[2],
    ((row.networkBps * 8) / 1e6 / ceiling) * 100,
  ];

  const xAt = (index: number) => left + ((right - left) * index) / 3;
  const yAt = (value: number) => bottom - (Math.max(0, Math.min(100, value)) / 100) * span;

  const points = rows.map((row) =>
    scaled(row)
      .map((value, index) => `${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`)
      .join(' '),
  );
  const active = rows.find((row) => row.id === activeId) ?? rows.find((row) => row.id === selectedId) ?? null;
  const readout = (row: FleetRow) =>
    `${percent(row.values[0])} CPU · ${percent(row.values[1])} memory · ${percent(row.values[2])} disk · ${netRate(row.networkBps)}`;

  return (
    <div className="profile" ref={host}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Fleet profile: ${rows.length} boxes across CPU, memory, root disk and network`}
      >
        {[0, 25, 50, 75, 100].map((value) => (
          <line
            key={value}
            x1={left}
            x2={right}
            y1={yAt(value)}
            y2={yAt(value)}
            stroke="var(--rule)"
            strokeWidth={1}
          />
        ))}

        {AXES.map((axis, index) => (
          <g key={axis}>
            <line x1={xAt(index)} x2={xAt(index)} y1={top - 6} y2={bottom + 4} stroke="var(--border)" strokeWidth={1} />
            <text
              x={xAt(index)}
              y={top - 12}
              className="profile-axis"
              textAnchor={index === 0 ? 'start' : index === 3 ? 'end' : 'middle'}
            >
              {narrow
                ? AXES_SHORT[index]
                : index === 3
                  ? `${axis} · ${ceiling} Mbit/s`
                  : index === 0
                    ? `${axis} · 100%`
                    : axis}
            </text>
          </g>
        ))}

        {rows.map((row, index) => {
          const offline = row.status === 'offline';
          const color = offline ? 'var(--muted)' : identityColor(index);
          const isActive = row.id === activeId;
          const isSelected = row.id === selectedId;
          return (
            <g
              key={row.id}
              className="fleet-node"
              data-status={row.status}
              data-selected={isSelected ? 'true' : undefined}
              data-active={isActive ? 'true' : undefined}
              onMouseEnter={() => setActiveId(row.id)}
              onMouseLeave={() => setActiveId(null)}
              onClick={() => navigate(`/nodes/${row.id}`)}
            >
              <polyline
                className="fleet-line-hit"
                points={points[index]}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                pointerEvents="stroke"
              />
              <polyline
                className="fleet-line"
                points={points[index]}
                fill="none"
                stroke={color}
                strokeWidth={isSelected || isActive ? 2 : 1.5}
                strokeDasharray={offline ? '3 4' : undefined}
                strokeLinejoin="round"
              />
              {scaled(row).map((value, axis) => (
                <circle
                  key={axis}
                  cx={xAt(axis)}
                  cy={yAt(value)}
                  r={isSelected || isActive ? 2.6 : 1.8}
                  fill="var(--ground)"
                  stroke={color}
                  strokeWidth={1.5}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <p className="profile-readout" aria-live="polite">
        {active ? (
          <>
            <span className="profile-readout-name">{active.name}</span>
            <span className="profile-readout-values">{readout(active)}</span>
          </>
        ) : (
          <span className="profile-readout-hint">
            {rows.length} {rows.length === 1 ? 'line' : 'lines'} · hover a line for its four figures
          </span>
        )}
      </p>
      <ul className="fleet-key">
        {rows.map((row, index) => {
          const offline = row.status === 'offline';
          return (
            <li key={row.id}>
              <Link
                to={`/nodes/${row.id}`}
                className="fleet-key-link"
                data-selected={row.id === selectedId ? 'true' : undefined}
                onMouseEnter={() => setActiveId(row.id)}
                onMouseLeave={() => setActiveId(null)}
                onFocus={() => setActiveId(row.id)}
                onBlur={() => setActiveId(null)}
              >
                <span
                  className="fleet-key-line"
                  style={{ background: offline ? 'var(--muted)' : identityColor(index) }}
                  aria-hidden="true"
                />
                <span className="fleet-key-name">{row.name}</span>
                <span className="fleet-key-state" data-status={row.status}>
                  {row.status === 'healthy' ? '' : row.status}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
