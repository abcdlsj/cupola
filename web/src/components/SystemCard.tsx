import { Cpu, HardDrives, Memory, Pulse } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { NodeView } from '../data/types';
import { Meter } from './Meter';

export interface SystemCardFigures {
  online: boolean;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  load: [number, number, number] | null;
  cores: number;
  temp: number | null;
  uptime: number;
}

const STATE_TONE = { healthy: 'positive', degraded: 'warning', offline: 'negative' } as const;

function uptimeWord(seconds: number): string {
  if (!seconds) return '';
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `up ${days} d`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `up ${hours} h`;
  return `up ${Math.max(1, Math.floor(seconds / 60))} m`;
}

/**
 * One machine, read top to bottom: which figures are strained, then the quiet
 * line of what it is. Every card leads with a meter, so three cards compare by
 * bar length and only a breach takes a colour.
 */
export function SystemCard({ view, fig }: { view: NodeView; fig: SystemCardFigures }) {
  const { node, health } = view;
  const loadPercent = fig.load && fig.cores ? (fig.load[0] / fig.cores) * 100 : null;
  const role = node.labels[0] ?? (node.mode === 'push' ? 'push' : '');

  const meta = [
    node.os || null,
    fig.cores ? `${fig.cores} cores` : null,
    uptimeWord(fig.uptime),
    fig.temp != null ? `${Math.round(fig.temp)} °C` : null,
  ].filter(Boolean);

  return (
    <Link to={`/nodes/${node.id}`} className="syscard">
      <div className="syscard-head">
        <span className="syscard-dot" data-tone={STATE_TONE[health.status as keyof typeof STATE_TONE] ?? 'neutral'} aria-hidden="true" />
        <span className="syscard-name" title={node.name}>
          {node.name}
        </span>
        {role ? (
          <span className="syscard-role" title={role}>
            {role}
          </span>
        ) : null}
        <span className="syscard-open" aria-hidden="true">
          Open
        </span>
      </div>
      <div className="syscard-body">
        <div className="syscard-row">
          <Cpu size={16} aria-hidden="true" />
          <span className="syscard-key">CPU</span>
          <Meter value={fig.online ? fig.cpu : null} label={`${node.name} CPU`} digits={1} />
        </div>
        <div className="syscard-row">
          <Memory size={16} aria-hidden="true" />
          <span className="syscard-key">Memory</span>
          <Meter value={fig.online ? fig.mem : null} label={`${node.name} memory`} digits={1} />
        </div>
        <div className="syscard-row">
          <HardDrives size={16} aria-hidden="true" />
          <span className="syscard-key">Disk</span>
          <Meter value={fig.online ? fig.disk : null} label={`${node.name} root filesystem`} digits={1} />
        </div>
        <div className="syscard-row">
          <Pulse size={16} aria-hidden="true" />
          <span className="syscard-key">Load</span>
          <Meter
            value={fig.online ? loadPercent : null}
            label={`${node.name} load against ${fig.cores} cores`}
            text={fig.load ? fig.load[0].toFixed(2) : undefined}
          />
        </div>
        <div className="syscard-meta" title={meta.length ? meta.join(' · ') : undefined}>
          {meta.length ? meta.join(' · ') : 'no data yet'}
        </div>
      </div>
    </Link>
  );
}
