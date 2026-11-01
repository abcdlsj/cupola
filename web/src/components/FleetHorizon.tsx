import * as Tooltip from '@radix-ui/react-tooltip';
import { Link } from 'react-router-dom';
import { percent, relative } from '../lib/format';
import type { Node } from '../data/schema';

/**
 * The fleet horizon: one mark per node on a common baseline. Height is CPU
 * utilisation, status colour only for degraded or offline, and a 1px accent
 * line under the selected node. Every mark links to its node.
 */
export function FleetHorizon({
  nodes,
  now,
  selectedId,
}: {
  nodes: Node[];
  now: number;
  selectedId?: string;
}) {
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
          {nodes.map((node) => {
            const offline = node.status === 'offline';
            const height = offline ? 0 : Math.min(100, Math.max(0, node.cpuPct));
            return (
              <Tooltip.Root key={node.id} delayDuration={180}>
                <Tooltip.Trigger asChild>
                  <Link
                    to={`/nodes/${node.id}`}
                    className="horizon-node"
                    data-status={node.status}
                    data-selected={node.id === selectedId ? 'true' : undefined}
                    aria-label={`${node.name}: ${node.status}, CPU ${percent(node.cpuPct, 1)}`}
                  >
                    <span className="horizon-track">
                      <span
                        className="horizon-bar"
                        style={{ height: offline ? '2px' : `${Math.max(2, height * 0.96)}%` }}
                      />
                      <span className="horizon-tick" aria-hidden="true" />
                    </span>
                    <span className="horizon-label">
                      <span className="horizon-name">{node.name}</span>
                      <span className="horizon-value">
                        {offline ? 'offline' : percent(node.cpuPct)}
                      </span>
                    </span>
                  </Link>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="tooltip" sideOffset={8} collisionPadding={12}>
                    <span className="fig">{node.name}</span>
                    <span className="quiet">
                      {' '}
                      {offline
                        ? `last seen ${relative(node.lastSeenAt, now)}`
                        : `CPU ${percent(node.cpuPct, 1)} · load ${node.load[0].toFixed(2)}`}
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
