import { Fig } from '../../components/Fig';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Power } from '@phosphor-icons/react';
import { PageHeader, Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { FleetGrid } from '../../components/FleetGrid';
import { StatusPill } from '../../components/StatusPill';
import { Empty, ErrorPanel, PageSkeleton } from '../../components/States';
import { RunActionDialog } from '../apps/RunActionDialog';
import { EventsList } from '../events/EventsList';
import { useEvents, useFleet, useFleetActions, useSettings } from '../../data/queries';
import type { Action, Event, FleetAction } from '../../data/types';
import { days, percent, relative, size, uptime } from '../../lib/format';

interface Attention {
  key: string;
  nodeId: string;
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  ts: number;
}

function attentionItems(events: Event[]): Attention[] {
  const now = Date.now();
  const seen = new Set<string>();
  const out: Attention[] = [];
  for (const event of events) {
    if (event.severity === 'info' || now - event.ts > 24 * 3600 * 1000) continue;
    const key = `${event.node_id}:${event.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key: `${event.id}`,
      nodeId: event.node_id,
      severity: event.severity,
      title: event.message,
      detail: `${event.node_id} · ${event.kind}`,
      ts: event.ts,
    });
  }
  return out;
}

export function OverviewPage() {
  const fleet = useFleet();
  const events = useEvents({ limit: 60 });
  const actions = useFleetActions();
  const settings = useSettings();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<FleetAction | null>(null);
  const [open, setOpen] = useState(false);
  const now = Date.now();

  const nodes = fleet.data?.nodes ?? [];
  const attention = useMemo(() => attentionItems(events.data ?? []), [events.data]);
  const offline = nodes.find((view) => view.health.status === 'offline');
  const degraded = nodes.find((view) => view.health.status === 'degraded');
  const selectedId = params.get('node') ?? (offline ?? degraded)?.node.id ?? nodes[0]?.node.id;
  const needAttention = nodes.filter((view) => view.health.status !== 'healthy').length;
  const sessions = nodes.reduce((sum, view) => sum + view.health.agents, 0);
  const appCount = actions.data?.length ?? 0;
  const stripActions = (actions.data ?? []).slice(0, 3);

  if (fleet.isPending) return <PageSkeleton title="Overview" />;
  if (fleet.isError || !fleet.data) {
    return (
      <>
        <PageHeader title="Overview" finding="The fleet did not load." />
        <ErrorPanel what="Couldn't load the fleet snapshot." onRetry={() => void fleet.refetch()} />
      </>
    );
  }

  const finding = (() => {
    if (nodes.length === 0) return 'No node is registered yet. Add one in Settings → Nodes.';
    const parts: string[] = [];
    if (offline) parts.push(`${offline.node.name} is offline`);
    const full = nodes
      .map((view) => ({ view, disk: view.snapshot?.disks.find((disk) => disk.mount === '/') }))
      .filter((entry) => entry.disk && entry.disk.used_pct >= 85)
      .sort((a, b) => (b.disk?.used_pct ?? 0) - (a.disk?.used_pct ?? 0))[0];
    if (full?.disk) parts.push(`${full.view.node.name}'s root disk is ${percent(full.disk.used_pct)} full`);
    const otherFinding = attention.find((item) => item.nodeId !== offline?.node.id);
    if (otherFinding) parts.push(otherFinding.title.toLowerCase());
    const verb = needAttention === 1 ? 'needs' : 'need';
    return `${nodes.length} boxes, ${needAttention} ${verb} attention${parts.length ? `: ${parts.join('; ')}` : '.'}`;
  })();

  return (
    <>
      <PageHeader
        title="Overview"
        finding={finding}
        actions={
          <>
            {stripActions[0] ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setSelected(stripActions[0]);
                  setOpen(true);
                }}
              >
                <Power size={15} aria-hidden="true" />
                {stripActions[0].name}
              </button>
            ) : null}
          </>
        }
      />

      <Panel
        title="Fleet at a glance"
        meta={
          <>
            <span>{nodes.length} boxes</span>
            <span className="quiet">current reading per dimension</span>
          </>
        }
        flush
      >
        {nodes.length === 0 ? <Empty>No node yet.</Empty> : <FleetGrid nodes={nodes} selectedId={selectedId} />}
      </Panel>

      <div className="kpi-row" data-count="4">
        <div className="kpi-cell">
          <div className="kpi-label">Boxes</div>
          <div className="kpi-value"><Fig>{nodes.length}</Fig></div>
          <div className="kpi-sub">{needAttention} {needAttention === 1 ? 'needs' : 'need'} attention</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Agent sessions</div>
          <div className="kpi-value"><Fig>{sessions}</Fig></div>
          <div className="kpi-sub">across the fleet</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Apps</div>
          <div className="kpi-value"><Fig>{appCount}</Fig></div>
          <div className="kpi-sub">configured actions</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Findings</div>
          <div className="kpi-value"><Fig>{attention.length}</Fig></div>
          <div className="kpi-sub">{attention.length === 1 ? 'warning' : 'warnings'} in the last 24 h</div>
        </div>
      </div>

      <div className="row">
        <div className="span-5">
          <Panel title="Attention" meta={attention.length === 1 ? '1 finding' : `${attention.length} findings`} flush>
            {attention.length === 0 ? (
              <Empty>Nothing needs attention. Units, containers, disks and thresholds are quiet.</Empty>
            ) : (
              <ul className="attention-list">
                {attention.slice(0, 4).map((item) => (
                  <li key={item.key}>
                    <Link className="attention-row" to={`/nodes/${item.nodeId}/events`}>
                      <span className="dot-mark attention-dot" data-severity={item.severity} aria-hidden="true" />
                      <span>
                        <span className="attention-title">{item.title}</span>
                        <span className="attention-detail">{item.detail}</span>
                      </span>
                      <span className="attention-when">{relative(item.ts, now)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="panel-foot">
              <span className="note">
                {attention.length > 4 ? `${attention.length - 4} more ${attention.length - 4 === 1 ? 'finding' : 'findings'} in Events. ` : ''}
                Derived from events; action failures stay on the Apps screen.
              </span>
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
                <Th num>Uptime</Th>
              </THead>
              <TBody>
                {nodes.map((view) => {
                  const node = view.node;
                  return (
                    <tr key={node.id}>
                      <Td cell="primary">
                        <Link to={`/nodes/${node.id}`} className="row-name">
                          {node.name}
                          <StatusPill status={view.health.status} />
                        </Link>
                        <span className="cell-sub">{node.os || 'unknown OS'} · {node.arch}</span>
                      </Td>
                      <Td num cell="key">{view.health.status === 'offline' ? '—' : percent(view.health.cpu_pct)}</Td>
                      <Td num cell="field" label="Memory">
                        {percent(view.health.mem_pct)}
                        <span className="cell-sub">{size(view.health.mem_used)} of {size(view.health.mem_total)}</span>
                      </Td>
                      <Td num cell="field" label="Disk">
                        {percent(view.health.root_disk_pct)}
                        <span className="cell-sub">{view.health.root_disk_total ? `${size(view.health.root_disk_used)} of ${size(view.health.root_disk_total)}` : 'no disk'}</span>
                      </Td>
                      <Td num cell="field" label="Uptime">
                        {view.health.status === 'offline'
                          ? node.last_seen ? relative(node.last_seen, now) : 'never seen'
                          : uptime(view.health.uptime_sec)}
                        <span className="cell-sub">
                          {view.health.days_to_full ? `full in ${days(view.health.days_to_full)}` : 'disk steady'}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
            <div className="panel-foot">
              <span className="note">Updated every {settings.data?.poll_interval_sec ?? 5} s · open a node for the full snapshot.</span>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        title="Apps"
        meta={
          <>
            <span>{stripActions.length} of {appCount} actions</span>
            <Link className="text-link" to="/apps">
              All apps
            </Link>
          </>
        }
        flush
      >
        {stripActions.length === 0 ? (
          <Empty>No action configured. Add them to the agent config on each host.</Empty>
        ) : (
          <div className="app-cells" data-count={stripActions.length}>
            {stripActions.map((action) => (
              <button
                type="button"
                className="app-cell"
                key={`${action.node_id}-${action.id}`}
                onClick={() => {
                  setSelected(action);
                  setOpen(true);
                }}
              >
                <span className="app-cell-top">
                  <span className="app-cell-name">{action.name}</span>
                  {action.last_ok == null ? (
                    <span className="pill" data-tone="neutral">Never run</span>
                  ) : (
                    <span className="pill" data-tone={action.last_ok ? 'positive' : 'negative'}>{action.last_ok ? 'OK' : 'Failed'}</span>
                  )}
                </span>
                <span className="app-cell-desc">{action.description}</span>
                <span className="app-cell-meta">
                  {action.node_name} · {action.last_run_at ? relative(action.last_run_at, now) : 'never run'}
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <EventsList title="Recent events" compact />

      <RunActionDialog
        action={selected as Action | null}
        nodeId={selected?.node_id ?? ''}
        nodeName={selected?.node_name ?? ''}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
