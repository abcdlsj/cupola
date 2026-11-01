import * as Tooltip from '@radix-ui/react-tooltip';
import { Link } from 'react-router-dom';
import { percent, relative } from '../lib/format';
import type { NodeView } from '../data/types';

/**
 * The fleet horizon: one mark per node on a common baseline. Height is CPU
 * utilisation, status colour only for degraded or offline, and a 1px accent
 * line beside the selected node. Every mark links to its node.
 */
export function FleetHorizon({ nodes, selectedId }: { nodes: NodeView[]; selectedId?: string }) {
  const now = Date.now();
  return (
    <div className="horizon">
      <div className="horizon-scale" aria-hidden="true">
        <span>100</span>
        <span>50</span>
        <span>0</span>
      </div>
      <div className="horizon-band">
        <div className="horizon-grid" data-line="top" aria-hidden="true" />
        <div className="horizon-grid" data-line="mid" aria-hidden="true" />
        <div className="horizon-marks">
          {nodes.map((view) => {
            const node = view.node;
            const offline = view.health.status === 'offline';
            const value = Math.min(100, Math.max(0, view.health.cpu_pct || 0));
            return (
              <Tooltip.Root key={node.id} delayDuration={180}>
                <Tooltip.Trigger asChild>
                  <Link
                    to={`/nodes/${node.id}`}
                    className="horizon-node"
                    data-status={view.health.status}
                    data-selected={node.id === selectedId ? 'true' : undefined}
                    aria-label={`${node.name}: ${view.health.status}, CPU ${percent(value, 1)}`}
                  >
                    <span className="horizon-track">
                      <span className="horizon-bar" style={{ height: offline ? '2px' : `${Math.max(2, value * 0.96)}%` }} />
                      <span className="horizon-tick" aria-hidden="true" />
                    </span>
                    <span className="horizon-label">
                      <span className="horizon-name">{node.name}</span>
                      <span className="horizon-value">{offline ? 'offline' : percent(value)}</span>
                    </span>
                  </Link>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="tooltip" sideOffset={8} collisionPadding={12}>
                    <span className="fig">{node.name}</span>
                    <span className="quiet">
                      {' '}
                      {offline
                        ? `last seen ${relative(node.last_seen, now)}`
                        : `CPU ${percent(view.health.cpu_pct, 1)} · memory ${percent(view.health.mem_pct)}`}
                    </span>
                    <Tooltip.Arrow className="tooltip-arrow" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          })}
        </div>
      </div>
    </div>
  );
}
