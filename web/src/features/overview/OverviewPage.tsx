import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Power } from '@phosphor-icons/react';
import { PageHeader, Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { FleetHorizon } from '../../components/FleetHorizon';
import { CopyLinkButton } from '../../components/CopyLinkButton';
import { RunPill, StatusPill } from '../../components/StatusPill';
import { PageSkeleton, ErrorPanel } from '../../components/States';
import { RunActionDialog } from '../apps/RunActionDialog';
import { useFleet } from '../../data/queries';
import {
  attentionItems,
  diskUsedPct,
  fleetFinding,
  needAttention,
  nodeById,
} from '../../data/derive';
import type { Action } from '../../data/schema';
import { capacity, eventTime, percent, relative, size, uptime } from '../../lib/format';

export function OverviewPage() {
  const fleet = useFleet();
  const [params] = useSearchParams();
  const [pending, setPending] = useState<Action | null>(null);
  const [runOpen, setRunOpen] = useState(false);

  if (fleet.isPending) return <PageSkeleton title="Overview" />;
  if (fleet.isError || !fleet.data) {
    return (
      <>
        <PageHeader title="Overview" finding="The snapshot did not load." />
        <ErrorPanel what="Couldn't load the fleet snapshot." onRetry={() => void fleet.refetch()} />
      </>
    );
  }

  const snapshot = fleet.data;
  const now = snapshot.generatedAt;
  const nodes = snapshot.nodes;
  const attention = attentionItems(snapshot, now);
  const offline = nodes.find((node) => node.status === 'offline');
  const degraded = nodes.find((node) => node.status === 'degraded');
  const selectedId = params.get('node') ?? (offline ?? degraded)?.id ?? nodes[0]?.id;

  const wake = snapshot.actions.find((action) => action.id === 'wake-desk') ?? snapshot.actions[0];

  const stripActions = ['wake-desk', 'restart-jellyfin', 'backup-now']
    .map((id) => snapshot.actions.find((action) => action.id === id))
    .filter((action): action is Action => Boolean(action));

  const events = snapshot.events.slice(0, 5);

  const openRun = (action: Action) => {
    setPending(action);
    setRunOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Overview"
        finding={`${nodes.length} boxes, ${needAttention(snapshot)} need attention: ${fleetFinding(snapshot, now)}`}
        actions={
          <>
            {wake ? (
              <button type="button" className="btn btn-ghost" onClick={() => openRun(wake)}>
                <Power size={15} aria-hidden="true" />
                {wake.name}
              </button>
            ) : null}
            <CopyLinkButton />
          </>
        }
      />

      <Panel
        title="Fleet horizon"
        meta={
          <>
            <span>CPU now</span>
            <span className="quiet">accent line marks {nodes.find((node) => node.id === selectedId)?.name}</span>
          </>
        }
        flush
      >
        <FleetHorizon nodes={nodes} now={now} selectedId={selectedId} />
      </Panel>

      <div className="row">
        <div className="span-5">
          <Panel
            title="Attention"
            meta={`${attention.length} findings`}
            flush
          >
            <ul className="attention-list">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link className="attention-row" to={item.href}>
                    <span className="dot-mark attention-dot" data-severity={item.severity} aria-hidden="true" />
                    <span>
                      <span className="attention-title">{item.title}</span>
                      <span className="attention-detail">{item.detail}</span>
                    </span>
                    <span className="attention-when">{relative(item.at, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="panel-foot">
              <span className="note">Sorted by severity. Action failures stay on the Apps screen.</span>
            </div>
          </Panel>
        </div>

        <div className="span-7">
          <Panel
            title="Nodes"
            meta={
              <>
                <span>{nodes.length} boxes</span>
                <Link className="text-link" to="/nodes">
                  All nodes
                </Link>
              </>
            }
            flush
          >
            <Table label="Fleet nodes">
              <THead>
                <Th>Node</Th>
                <Th num>CPU</Th>
                <Th num>Memory</Th>
                <Th num>Root disk</Th>
                <Th num>Net Mbit/s</Th>
                <Th num>Uptime</Th>
              </THead>
              <TBody>
                {nodes.map((node) => {
                  const disk = node.disks.find((entry) => entry.mount === '/') ?? node.disks[0];
                  return (
                    <tr key={node.id}>
                      <Td cell="primary">
                        <Link to={`/nodes/${node.id}`} className="row-name">
                          {node.name}
                          <StatusPill status={node.status} />
                        </Link>
                        <span className="cell-sub">{node.ip}</span>
                      </Td>
                      <Td num cell="key">
                        {node.status === 'offline' ? '—' : percent(node.cpuPct)}
                      </Td>
                      <Td num cell="field" label="Memory">
                        {size(node.memUsedGb)}
                        <span className="cell-sub">of {capacity(node.memTotalGb)}</span>
                      </Td>
                      <Td num cell="field" label="Disk">
                        {disk ? percent(diskUsedPct(disk.usedGb, disk.sizeGb)) : '—'}
                        <span className="cell-sub">
                          {disk ? `${size(disk.usedGb)} of ${size(disk.sizeGb)}` : 'no disk'}
                        </span>
                      </Td>
                      <Td num cell="field" label="Net">
                        {node.status === 'offline'
                          ? '—'
                          : `${(node.net.rxKbps / 1000).toFixed(1)} / ${(node.net.txKbps / 1000).toFixed(1)}`}
                        <span className="cell-sub">rx / tx</span>
                      </Td>
                      <Td num cell="field" label="Uptime">
                        {node.status === 'offline' ? relative(node.lastSeenAt, now) : uptime(node.uptimeSec)}
                      </Td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </Panel>
        </div>
      </div>

      <Panel
        title="Apps"
        meta={
          <>
            <span>{stripActions.length} of {snapshot.actions.length} actions</span>
            <Link className="text-link" to="/apps">
              All apps
            </Link>
          </>
        }
        flush
      >
        <div className="app-cells" data-count={stripActions.length}>
          {stripActions.map((action) => {
            const node = nodeById(snapshot, action.nodeId);
            return (
              <button type="button" className="app-cell" key={action.id} onClick={() => openRun(action)}>
                <span className="app-cell-top">
                  <span className="app-cell-name">{action.name}</span>
                  {action.lastRun ? <RunPill ok={action.lastRun.ok} /> : <span className="pill" data-tone="neutral">Never run</span>}
                </span>
                <span className="app-cell-desc">{action.description}</span>
                <span className="app-cell-meta">
                  {node?.name ?? action.nodeId} ·{' '}
                  {action.lastRun ? relative(action.lastRun.at, now) : 'never run'}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Recent events" meta={`${snapshot.events.length} events`} flush>
        <ul className="event-list">
          {events.map((event) => (
            <li className="event-row" key={event.id}>
              <span className="event-time">{eventTime(event.at, now)}</span>
              <span className="event-node">
                {nodeById(snapshot, event.nodeId)?.name ?? event.nodeId}
              </span>
              <span className="dot-mark" data-severity={event.severity} aria-hidden="true" />
              <span className="event-message">{event.message}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <RunActionDialog
        action={pending}
        nodeName={pending ? nodeById(snapshot, pending.nodeId)?.name ?? pending.nodeId : ''}
        open={runOpen}
        onOpenChange={setRunOpen}
      />
    </>
  );
}
