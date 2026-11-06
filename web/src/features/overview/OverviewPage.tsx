import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, CaretRight, FunnelSimple, Play, Rows, SquaresFour } from '@phosphor-icons/react';
import { Panel } from '../../components/Panel';
import { Fig as Figure } from '../../components/Fig';
import { Meter } from '../../components/Meter';
import { StatusDot } from '../../components/StatusPill';
import { Empty, ErrorPanel } from '../../components/States';
import { RunActionDialog } from '../apps/RunActionDialog';
import { useEvents, useFleet, useFleetActions, useSettings } from '../../data/queries';
import type { Action, FleetAction, NodeView } from '../../data/types';
import { netRate, relative } from '../../lib/format';
import { findings, nodeFigures, type NodeFigures } from '../../lib/fleet';

type SortKey = 'name' | 'cpu' | 'mem' | 'disk' | 'gpu' | 'net' | 'load' | 'temp';

interface Row {
  view: NodeView;
  fig: NodeFigures;
}

function sortValue(row: Row, key: SortKey): number | string {
  const fig = row.fig;
  switch (key) {
    case 'name':
      return row.view.node.name.toLowerCase();
    case 'load':
      return fig.load?.[0] ?? -1;
    default:
      return fig[key] ?? -1;
  }
}

/** The hub and agents ship together; an older agent is worth a quiet amber dot. */
function versionTone(agent: string, hub: string | undefined): 'positive' | 'warning' | 'neutral' {
  if (!agent) return 'neutral';
  if (!hub || hub === 'dev' || agent === 'dev') return 'positive';
  return agent.replace(/^v/, '') === hub.replace(/^v/, '') ? 'positive' : 'warning';
}

function SortHeader({
  id,
  label,
  sort,
  dir,
  onSort,
  num = false,
  width,
}: {
  id: SortKey;
  label: string;
  sort: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  num?: boolean;
  width?: number;
}) {
  const active = sort === id;
  return (
    <th scope="col" className={num ? 'num' : undefined} style={width ? { width } : undefined} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="sort-btn" data-active={active || undefined} onClick={() => onSort(id)}>
        {label}
        {active ? dir === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" /> : null}
      </button>
    </th>
  );
}

/** A figure cell: digits in mono, units in the UI face, a dash when missing. */
function Fig({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span className={muted ? 'quiet' : undefined}>
      <Figure>{children}</Figure>
    </span>
  );
}

function SystemsTable({ rows, showGpu, hubVersion, sort, dir, onSort }: {
  rows: Row[];
  showGpu: boolean;
  hubVersion?: string;
  sort: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  const navigate = useNavigate();
  const now = Date.now();
  const head = { sort, dir, onSort };
  return (
    <div className="table-wrap systems-table-wrap">
      <table className="table systems-table" aria-label="Systems">
        <thead>
          <tr>
            <SortHeader id="name" label="System" {...head} />
            <SortHeader id="cpu" label="CPU" width={150} {...head} />
            <SortHeader id="mem" label="Memory" width={150} {...head} />
            <SortHeader id="disk" label="Disk" width={150} {...head} />
            {showGpu ? <SortHeader id="gpu" label="GPU" width={150} {...head} /> : null}
            <SortHeader id="net" label="Net" num {...head} />
            <SortHeader id="load" label="Load avg" num {...head} />
            <SortHeader id="temp" label="Temp" num {...head} />
            <th scope="col" className="systems-go">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ view, fig }) => {
            const node = view.node;
            const href = `/nodes/${node.id}`;
            const tone = versionTone(node.agent_version, hubVersion);
            return (
              <tr
                key={node.id}
                className="systems-row"
                data-offline={!fig.online || undefined}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a,button')) return;
                  navigate(href);
                }}
              >
                <td>
                  <Link to={href} className="system-cell">
                    <StatusDot status={view.health.status} />
                    <span className="system-text">
                      <span className="system-name">{node.name}</span>
                      <span className="system-sub">
                        {fig.online
                          ? [node.os || view.snapshot?.node.platform, node.arch].filter(Boolean).join(' · ') || 'unknown OS'
                          : node.last_seen
                            ? `down · last seen ${relative(node.last_seen, now)}`
                            : 'waiting for the first poll'}
                      </span>
                    </span>
                  </Link>
                </td>
                <td>
                  <Meter value={fig.cpu} label={`CPU on ${node.name}`} />
                </td>
                <td>
                  <Meter value={fig.mem} label={`Memory on ${node.name}`} />
                </td>
                <td>
                  <Meter value={fig.disk} label={`Root disk on ${node.name}`} />
                </td>
                {showGpu ? (
                  <td>
                    <Meter value={fig.gpu} label={`GPU on ${node.name}`} />
                  </td>
                ) : null}
                <td className="num">{fig.net == null ? <Fig muted>—</Fig> : <Fig>{netRate(fig.net)}</Fig>}</td>
                <td className="num">{fig.load ? <span className="fig load-figs">{fig.load.map((value) => value.toFixed(2)).join(' ')}</span> : <Fig muted>—</Fig>}</td>
                <td className="num">
                  {fig.temp == null ? (
                    <Fig muted>—</Fig>
                  ) : (
                    <span className={fig.temp >= 80 ? 'temp-hot' : undefined}>
                      <Figure>{`${Math.round(fig.temp)} °C`}</Figure>
                    </span>
                  )}
                </td>
                <td className="num">
                </td>
                <td>
                  <span className="agent-version" title={tone === 'warning' ? `The hub runs ${hubVersion}` : undefined}>
                    <span className="status-dot" data-tone={fig.online ? tone : 'neutral'} aria-hidden="true" />
                    <span className="fig">{node.agent_version || '—'}</span>
                    <span className="quiet">{node.mode}</span>
                  </span>
                </td>
                <td className="systems-go">
                  <CaretRight size={14} aria-hidden="true" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SystemsGrid({ rows, fallback = false }: { rows: Row[]; fallback?: boolean }) {
  const now = Date.now();
  return (
    <div className="systems-grid" data-fallback={fallback || undefined}>
      {rows.map(({ view, fig }) => {
        const node = view.node;
        return (
          <Link to={`/nodes/${node.id}`} className="system-card" key={node.id} data-offline={!fig.online || undefined}>
            <span className="system-card-head">
              <StatusDot status={view.health.status} />
              <span className="system-name">{node.name}</span>
              <span className="system-card-side fig">
                {fig.online ? (fig.net == null ? '—' : netRate(fig.net)) : node.last_seen ? `down ${relative(node.last_seen, now).replace(' ago', '')}` : 'waiting'}
              </span>
            </span>
            <span className="system-card-meters">
              <span className="system-card-meter">
                <span className="system-card-label">CPU</span>
                <Meter value={fig.cpu} label={`CPU on ${node.name}`} />
              </span>
              <span className="system-card-meter">
                <span className="system-card-label">Memory</span>
                <Meter value={fig.mem} label={`Memory on ${node.name}`} />
              </span>
              <span className="system-card-meter">
                <span className="system-card-label">Disk</span>
                <Meter value={fig.disk} label={`Root disk on ${node.name}`} />
              </span>
            </span>
            <span className="system-card-foot">
              <span>{[node.os || view.snapshot?.node.platform, node.arch].filter(Boolean).join(' · ') || 'unknown OS'}</span>
              {fig.load ? <span className="fig">load {fig.load[0].toFixed(2)}</span> : null}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function OverviewPage() {
  const fleet = useFleet();
  const events = useEvents({ limit: 60 });
  const actions = useFleetActions();
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<FleetAction | null>(null);
  const [open, setOpen] = useState(false);

  const query = params.get('q') ?? '';
  const view = params.get('view') === 'grid' ? 'grid' : 'table';
  const sort = (params.get('sort') as SortKey | null) ?? 'name';
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  const nodes = useMemo(() => fleet.data?.nodes ?? [], [fleet.data]);
  const now = Date.now();
  const found = useMemo(() => findings(nodes, events.data ?? [], Date.now()), [nodes, events.data]);

  const rows = useMemo<Row[]>(() => {
    const needle = query.trim().toLowerCase();
    const list = nodes
      .filter((entry) =>
        needle
          ? [entry.node.name, entry.node.id, entry.node.os, entry.node.kernel, entry.node.arch, entry.node.mode, ...entry.node.labels]
              .join(' ')
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .map((entry) => ({ view: entry, fig: nodeFigures(entry) }));
    const factor = dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const left = sortValue(a, sort);
      const right = sortValue(b, sort);
      if (left < right) return -1 * factor;
      if (left > right) return 1 * factor;
      return a.view.node.name.localeCompare(b.view.node.name);
    });
  }, [nodes, query, sort, dir]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const onSort = (key: SortKey) => {
    const next = new URLSearchParams(params);
    if (sort === key) {
      next.set('dir', dir === 'asc' ? 'desc' : 'asc');
    } else {
      next.set('sort', key);
      // figures read best biggest-first; names read A to Z
      next.set('dir', key === 'name' ? 'asc' : 'desc');
    }
    if (next.get('sort') === 'name' && next.get('dir') === 'asc') {
      next.delete('sort');
      next.delete('dir');
    }
    setParams(next, { replace: true });
  };

  if (fleet.isError && !fleet.data) {
    return <ErrorPanel what="Couldn't load the fleet snapshot." onRetry={() => void fleet.refetch()} />;
  }

  const counts = {
    up: nodes.filter((entry) => entry.health.status === 'healthy').length,
    degraded: nodes.filter((entry) => entry.health.status === 'degraded').length,
    down: nodes.filter((entry) => entry.health.status === 'offline').length,
  };
  const showGpu = nodes.some((entry) => entry.health.gpu_pct != null);
  const fleetActions = actions.data ?? [];

  return (
    <>
      <h1 className="sr-only">Systems</h1>
      {found.length > 0 ? (
        <section className="alert-strip" aria-labelledby="alerts-head">
          <div className="section-head">
            <h2 className="section-title" id="alerts-head">
              Needs attention
            </h2>
            <Link className="text-link" to="/events">
              {found.length > 2 ? `All ${found.length}` : 'Events'}
            </Link>
          </div>
          <div className="alert-cards">
            {found.slice(0, 4).map((item) => (
              <Link className="alert-card" to={`/nodes/${item.nodeId}/events`} key={item.key}>
                <span className="dot-mark" data-severity={item.severity} aria-hidden="true" />
                <span className="alert-card-text">
                  <span className="alert-card-title">{item.title}</span>
                  <span className="alert-card-detail">
                    {item.nodeName} · {item.detail}
                  </span>
                </span>
                <span className="alert-card-when">{relative(item.ts, now).replace(' ago', '')}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel systems" aria-labelledby="systems-head">
        <header className="panel-head systems-head">
          <div className="panel-heading">
            <h2 className="panel-title systems-title" id="systems-head">
              All systems
            </h2>
            <p className="panel-desc">
              {fleet.isPending ? (
                'Loading the fleet…'
              ) : nodes.length === 0 ? (
                'No system yet.'
              ) : (
                <>
                  <span className="fig">{nodes.length}</span> {nodes.length === 1 ? 'system' : 'systems'} · <span className="fig">{counts.up}</span> up
                  {counts.degraded ? (
                    <>
                      {' · '}
                      <span className="fig tone-warning">{counts.degraded}</span> degraded
                    </>
                  ) : null}
                  {counts.down ? (
                    <>
                      {' · '}
                      <span className="fig tone-negative">{counts.down}</span> down
                    </>
                  ) : null}
                  . Updated every {settings.data?.poll_interval_sec ?? 5} s; open a system for its charts.
                </>
              )}
            </p>
          </div>
          <div className="systems-tools">
            <label className="filter">
              <span className="sr-only">Filter systems</span>
              <FunnelSimple size={15} aria-hidden="true" />
              <input
                className="input input-search"
                value={query}
                onChange={(event) => setParam('q', event.target.value || null)}
                placeholder="Filter…"
                type="search"
              />
            </label>
            <div className="seg" role="group" aria-label="Layout">
              <button type="button" className="seg-btn" aria-pressed={view === 'table'} aria-label="Table" title="Table" onClick={() => setParam('view', null)}>
                <Rows size={15} aria-hidden="true" />
              </button>
              <button type="button" className="seg-btn" aria-pressed={view === 'grid'} aria-label="Grid" title="Grid" onClick={() => setParam('view', 'grid')}>
                <SquaresFour size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>
        <div className="panel-body flush">
          {fleet.isPending ? (
            <div className="systems-loading" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <div className="skeleton-row" key={index}>
                  <span className="skeleton" style={{ width: 120 }} />
                  <span className="skeleton" style={{ width: 140 }} />
                  <span className="skeleton" style={{ width: 140 }} />
                  <span className="skeleton" style={{ width: 140 }} />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Empty>
              {nodes.length === 0 ? (
                <>
                  No system is registered yet. <Link className="link" to="/settings/nodes">Add the first agent</Link>.
                </>
              ) : (
                <>
                  No system matches “{query}”.{' '}
                  <button type="button" className="link" onClick={() => setParam('q', null)}>
                    Clear the filter
                  </button>{' '}
                  to see all {nodes.length}.
                </>
              )}
            </Empty>
          ) : view === 'grid' ? (
            <SystemsGrid rows={rows} />
          ) : (
            <>
              <SystemsTable rows={rows} showGpu={showGpu} hubVersion={settings.data?.version.version} sort={sort} dir={dir} onSort={onSort} />
              <SystemsGrid rows={rows} fallback />
            </>
          )}
        </div>
      </section>

      <div className="row">
        <div className="span-6">
          <Panel
            title="Apps"
            desc="Actions the agents allow; each run asks first."
            meta={
              <Link className="text-link" to="/apps">
                {fleetActions.length ? `All ${fleetActions.length}` : 'Apps'}
              </Link>
            }
          >
            {fleetActions.length === 0 ? (
              <p className="note">No action configured. Add them to the agent config on each host.</p>
            ) : (
              <div className="chip-list">
                {fleetActions.slice(0, 8).map((action) => (
                  <button
                    type="button"
                    className="chip-btn"
                    key={`${action.node_id}-${action.id}`}
                    onClick={() => {
                      setSelected(action);
                      setOpen(true);
                    }}
                  >
                    <Play size={12} weight="fill" aria-hidden="true" />
                    <span>{action.name}</span>
                    <span className="quiet">{action.node_name}</span>
                    {action.last_ok === false ? <span className="status-dot" data-tone="negative" role="img" aria-label="Last run failed" /> : null}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

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
