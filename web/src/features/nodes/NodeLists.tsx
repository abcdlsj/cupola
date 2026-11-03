import { Fragment, useMemo, useState } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowsClockwise,
  Database,
  FunnelSimple,
  DownloadSimple,
  HardDrive,
  Power,
  ShieldCheck,
  Terminal,
  WifiHigh,
} from '@phosphor-icons/react';
import { Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { AgentMark } from '../../components/AgentMark';
import { Empty } from '../../components/States';
import { Kv } from '../../components/Kv';
import { RunActionDialog } from '../apps/RunActionDialog';
import { useActions, useContainerHistory, useNode, useRuns } from '../../data/queries';
import { agentTypeInfo } from '../../data/registry';
import type { Action, AgentSession, ContainerSeries, DockerImage, NodeView, ProcessInfo } from '../../data/types';
import type { ChartSeries } from '../../components/SeriesChart';
import { seriesColor } from '../../lib/chart';
import { useRange } from './RangeControl';
import { ChartCard } from '../../components/ChartCard';
import { Meter } from '../../components/Meter';
import { duration, eventTime, percent, relative, size } from '../../lib/format';
import { EventsList } from '../events/EventsList';

const ACTION_ICONS: Record<string, typeof Power> = {
  wake: Power,
  backup: Database,
  restart: ArrowsClockwise,
  update: DownloadSimple,
  terminal: Terminal,
  shield: ShieldCheck,
  disk: HardDrive,
  network: WifiHigh,
};

function useSnap() {
  return useOutletContext<NodeView>();
}

function NotFound({ what, to }: { what: string; to: string }) {
  return (
    <Panel title="Not found">
      <Empty>
        {what} is no longer in the latest snapshot. <Link className="link" to={to}>Back to the list</Link>.
      </Empty>
    </Panel>
  );
}

export function ProcessesPage() {
  const view = useSnap();
  const { nodeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };
  const snap = view.snapshot;
  const procs = useMemo(() => {
    if (!snap) return [];
    const needle = query.trim().toLowerCase();
    return [...snap.processes]
      .filter((proc) => (needle ? `${proc.name} ${proc.user} ${proc.command}`.toLowerCase().includes(needle) : true))
      .sort((a, b) => b.cpu_percent - a.cpu_percent);
  }, [snap, query]);
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  return (
    <Panel
      title="Processes"
      desc={`${procs.length} of ${snap.cpu.procs || snap.processes.length} by CPU. The agent samples the busiest; arguments are redacted.`}
      meta={
        <label className="filter">
          <span className="sr-only">Filter processes</span>
          <FunnelSimple size={15} aria-hidden="true" />
          <input className="input input-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter…" />
        </label>
      }
      flush
    >
      {procs.length === 0 ? (
        <Empty>No process matches “{query}”.</Empty>
      ) : (
        <Table label="Processes">
          <THead>
            <Th>Process</Th>
            <Th num>PID</Th>
            <Th>User</Th>
            <Th>CPU</Th>
            <Th num>Memory</Th>
            <Th num>Threads</Th>
            <Th num>Started</Th>
          </THead>
          <TBody>
            {procs.map((proc) => (
              <tr key={proc.pid}>
                <Td cell="primary">
                  <Link className="row-name" to={`/nodes/${nodeId}/processes/${proc.pid}`}>
                    {proc.name}
                  </Link>
                  <span className="cell-sub">{proc.command}</span>
                </Td>
                <Td num cell="field" label="PID">
                  {proc.pid}
                </Td>
                <Td cell="field" label="User">
                  {proc.user}
                </Td>
                <Td cell="key" className="meter-cell">
                  <Meter
                    value={Math.min(100, proc.cpu_percent / Math.max(1, snap.node.cores))}
                    text={percent(proc.cpu_percent, 1)}
                    tone="neutral"
                    label={`${proc.name} CPU, bar is its share of all ${snap.node.cores} threads`}
                  />
                </Td>
                <Td num cell="field" label="Memory">
                  {size(proc.rss_bytes)}
                </Td>
                <Td num cell="field" label="Threads">
                  {proc.threads}
                </Td>
                <Td num cell="field" label="Started">
                  {relative(proc.started_at, Date.now())}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}

export function ProcessDetailPage() {
  const view = useSnap();
  const { nodeId = '', pid = '' } = useParams();
  const proc: ProcessInfo | undefined = view.snapshot?.processes.find((entry) => String(entry.pid) === pid);
  if (!proc) return <NotFound what={`Process ${pid}`} to={`/nodes/${nodeId}/processes`} />;
  return (
    <Panel title={proc.name} flush>
      <div className="panel-body">
        <Kv
          rows={[
            { label: 'PID', value: proc.pid },
            { label: 'Parent PID', value: proc.ppid },
            { label: 'User', value: proc.user },
            { label: 'State', value: proc.state },
            { label: 'CPU', value: percent(proc.cpu_percent, 1) },
            { label: 'Memory', value: size(proc.rss_bytes) },
            { label: 'Threads', value: proc.threads },
            { label: 'Started', value: eventTime(proc.started_at, Date.now()) },
            { label: 'TTY', value: proc.tty || '—' },
            { label: 'Working directory', value: proc.cwd || '—' },
            { label: 'Cgroup', value: proc.cgroup || '—' },
            { label: 'Container', value: proc.container || '—' },
            { label: 'Command', value: <span className="fig">{proc.command}</span> },
          ]}
        />
        <p className="note" style={{ marginTop: 12 }}>
          Arguments are redacted by the agent. Read-only: Cupola never kills a process in v1.
        </p>
      </div>
    </Panel>
  );
}

export function AgentsTab() {
  const view = useSnap();
  const { nodeId = '' } = useParams();
  const snap = view.snapshot;
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  const groups = new Map<string, AgentSession[]>();
  for (const session of snap.agents) {
    const list = groups.get(session.type) ?? [];
    list.push(session);
    groups.set(session.type, list);
  }
  return (
    <Panel title="AI agent sessions" meta={`${snap.agents.length} sessions · ${groups.size} tools`} flush>
      {snap.agents.length === 0 ? (
        <Empty>Cupola matches process names and working directories against a small registry of coding agents and model servers. Nothing matched.</Empty>
      ) : (
        <Table label="AI agent sessions">
          <THead>
            <Th>Project</Th>
            <Th>Type</Th>
            <Th num>PID</Th>
            <Th num>Runtime</Th>
            <Th num>CPU</Th>
            <Th num>Memory</Th>
            <Th>TTY</Th>
          </THead>
          <TBody>
            {[...groups.entries()].map(([type, sessions]) => (
              <Fragment key={type}>
                <tr className="roster-group-row">
                  <td colSpan={7} data-cell="figures">
                    <div className="roster-group">
                      <AgentMark type={type} strong />
                      <span className="roster-group-name">{agentTypeInfo(type).label}</span>
                      <span className="roster-group-cat">{agentTypeInfo(type).category}</span>
                      <span className="roster-group-figures">
                        <span>
                          <b>{sessions.length}</b> {sessions.length === 1 ? 'session' : 'sessions'}
                        </span>
                        <span>
                          <b>{percent(sessions.reduce((sum, item) => sum + item.cpu_percent, 0), 1)}</b> CPU
                        </span>
                        <span>
                          <b>{size(sessions.reduce((sum, item) => sum + item.rss_bytes, 0))}</b> RAM
                        </span>
                      </span>
                    </div>
                  </td>
                </tr>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <Td cell="primary">
                      <Link className="row-name" to={`/nodes/${nodeId}/agents/${session.id}`}>
                        {session.project || session.label}
                      </Link>
                    </Td>
                    <Td cell="field" label="Type">
                      <span className="agent-cell">
                        <AgentMark type={session.type} />
                        {session.label}
                      </span>
                    </Td>
                    <Td num cell="field" label="PID">
                      {session.pid}
                    </Td>
                    <Td num cell="field" label="Runtime">
                      {duration((Date.now() - session.started_at) / 1000)}
                    </Td>
                    <Td num cell="key">
                      {percent(session.cpu_percent, 1)}
                    </Td>
                    <Td num cell="field" label="Memory">
                      {size(session.rss_bytes)}
                    </Td>
                    <Td cell="field" label="TTY">
                      {session.tty || '—'}
                    </Td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </TBody>
        </Table>
      )}
      <div className="panel-foot">
        <span className="note">Arguments are redacted. Cupola reads the process name, working directory and tty; it never reads prompts, files or environment variables.</span>
      </div>
    </Panel>
  );
}

export function AgentDetailPage() {
  const view = useSnap();
  const { nodeId = '', sessionId = '' } = useParams();
  const session = view.snapshot?.agents.find((entry) => entry.id === sessionId);
  if (!session) return <NotFound what="This session" to={`/nodes/${nodeId}/agents`} />;
  return (
    <Panel title={session.label} flush>
      <div className="panel-body">
        <Kv
          rows={[
            { label: 'Type', value: <span className="agent-cell"><AgentMark type={session.type} /> {session.label}</span> },
            { label: 'Project', value: session.project || '—' },
            { label: 'PID', value: <Link className="link" to={`/nodes/${nodeId}/processes/${session.pid}`}>{session.pid}</Link> },
            { label: 'Parent', value: session.parent || '—' },
            { label: 'Runtime', value: duration((Date.now() - session.started_at) / 1000) },
            { label: 'CPU', value: percent(session.cpu_percent, 1) },
            { label: 'Memory', value: size(session.rss_bytes) },
            { label: 'TTY', value: session.tty || '—' },
            { label: 'Working directory', value: session.cwd || '—' },
            { label: 'Command', value: <span className="fig">{session.command}</span> },
            { label: 'Container', value: session.container || '—' },
          ]}
        />
      </div>
    </Panel>
  );
}

export function ServicesPage() {
  const view = useSnap();
  const { nodeId = '' } = useParams();
  const [failedOnly, setFailedOnly] = useState(false);
  const snap = view.snapshot;
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  const services = snap.services.filter((service) => (failedOnly ? service.active_state === 'failed' : true));
  return (
    <Panel
      title="Services"
      meta={
        <>
          <label className="check">
            <input type="checkbox" checked={failedOnly} onChange={(event) => setFailedOnly(event.target.checked)} />
            Failed only
          </label>
          <span>{services.length} of {snap.services.length} units</span>
        </>
      }
      flush
    >
      {services.length === 0 ? (
        <Empty>{failedOnly ? 'No failed unit.' : 'The agent reported no systemd units.'}</Empty>
      ) : (
        <Table label="systemd units">
          <THead>
            <Th>Unit</Th>
            <Th>State</Th>
            <Th>Sub</Th>
            <Th>Enabled</Th>
            <Th num>Restarts</Th>
          </THead>
          <TBody>
            {services.map((service) => (
              <tr key={service.name}>
                <Td cell="primary">
                  <Link className="row-name" to={`/nodes/${nodeId}/services/${encodeURIComponent(service.name)}`}>
                    {service.name}
                  </Link>
                  <span className="cell-sub">{service.description}</span>
                </Td>
                <Td cell="field" label="State">
                  <span className="pill" data-tone={service.active_state === 'failed' ? 'negative' : service.active_state === 'active' ? 'positive' : 'neutral'}>
                    {service.active_state}
                  </span>
                </Td>
                <Td cell="field" label="Sub">
                  {service.sub_state}
                </Td>
                <Td cell="field" label="Enabled">
                  {service.enabled}
                </Td>
                <Td num cell="key">
                  {service.restarts}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}

export function ServiceDetailPage() {
  const view = useSnap();
  const { nodeId = '', unit = '' } = useParams();
  const name = decodeURIComponent(unit);
  const service = view.snapshot?.services.find((entry) => entry.name === name);
  if (!service) return <NotFound what={name} to={`/nodes/${nodeId}/services`} />;
  return (
    <Panel title={service.name} flush>
      <div className="panel-body">
        <Kv
          rows={[
            { label: 'Description', value: service.description },
            { label: 'Load state', value: service.load_state },
            { label: 'Active state', value: service.active_state },
            { label: 'Sub state', value: service.sub_state },
            { label: 'Enabled', value: service.enabled },
            { label: 'Restarts', value: service.restarts },
          ]}
        />
        <p className="note" style={{ marginTop: 12 }}>Read-only: Cupola does not restart units in v1.</p>
      </div>
    </Panel>
  );
}

const IMAGE_ROWS = 8;
/** Four distinct data hues is what the token set offers; the table has the rest. */
const CHART_CONTAINERS = 4;

/** Turns container history rows into the chart's series, one colour each. */
export function historyChart(containers: ContainerSeries[], pick: 'cpu' | 'mem'): ChartSeries[] {
  return containers.map((container, index) => ({
    label: container.name || container.id,
    color: seriesColor(index),
    points: container.points.map((point) => ({
      ts: point.ts,
      min: point[pick],
      avg: point[pick],
      max: point[pick],
    })),
  }));
}

export function peakOf(points: Array<{ cpu: number; mem: number }>, key: 'cpu' | 'mem'): number {
  let peak = 0;
  for (const point of points) if (point[key] > peak) peak = point[key];
  return peak;
}

/** Container CPU rarely reaches 100%: scale to the window instead of a flat axis. */
export function percentCeiling(peak: number): number {
  if (peak <= 0) return 10;
  const step = peak * 1.25 <= 12 ? 1 : peak * 1.25 <= 30 ? 5 : 10;
  return Math.min(100, Math.max(10, Math.ceil((peak * 1.25) / step) * step));
}

/**
 * Docker images ranked by size. The bar is the image's own size (every layer it
 * is built from, so shared layers count once per image); the header figure is
 * the bytes those images actually hold on disk, where each layer counts once.
 */
function ImageChart({ images }: { images: DockerImage[] }) {
  const ranked = [...images].sort((a, b) => b.size - a.size);
  const top = ranked.slice(0, IMAGE_ROWS);
  const rest = ranked.slice(IMAGE_ROWS);
  const largest = top[0]?.size || 1;
  const onDisk = images.reduce((sum, image) => sum + Math.max(0, image.size - image.shared_size), 0);
  const restBytes = rest.reduce((sum, image) => sum + image.size, 0);
  return (
    <Panel title="Images" meta={`${images.length} images · ${size(onDisk)} on disk`} flush>
      {images.length === 0 ? (
        <Empty>The image list is empty or the Docker socket is not readable by the agent.</Empty>
      ) : (
        <div className="bar-list image-bars">
          {top.map((image) => (
            <div className="bar-row image-row" key={image.id}>
              <span className="bar-label image-label" title={`${image.repo_tag} · ${image.containers} containers · ${image.id}`}>
                {image.repo_tag}
              </span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${Math.max(2, (image.size / largest) * 100)}%` }} />
              </span>
              <span className="bar-value fig">{size(image.size)}</span>
            </div>
          ))}
          {rest.length > 0 ? (
            <div className="bar-row image-row" key="rest">
              <span className="bar-label image-label">{rest.length} more</span>
              <span className="bar-track" />
              <span className="bar-value fig">{size(restBytes)}</span>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

export function ContainersPage() {
  const view = useSnap();
  const { nodeId = '' } = useParams();
  const snap = view.snapshot;
  const [range] = useRange();
  // The chart follows the window, not the live snapshot: a container that
  // restarted, or is gone now, still has history worth seeing.
  const history = useContainerHistory(nodeId, range, []);
  const containers = useMemo(
    () =>
      [...(history.data?.containers ?? [])]
        .sort((a, b) => peakOf(b.points, 'cpu') - peakOf(a.points, 'cpu'))
        .slice(0, CHART_CONTAINERS),
    [history.data],
  );
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  const cpu = historyChart(containers, 'cpu');
  const memory = historyChart(containers, 'mem');
  const cpuMax = percentCeiling(peakOf(containers.flatMap((entry) => entry.points), 'cpu'));
  const empty = 'No sample in this window yet. History is written once a minute.';
  return (
    <>
      <div className="chart-grid">
        <ChartCard
          title="Container CPU"
          desc={`The ${cpu.length || ''} busiest containers in this window.`.replace('The  ', 'The ')}
          now={percent(snap.containers.reduce((sum, container) => sum + container.cpu_percent, 0), 1)}
          series={cpu}
          unit="percent"
          maxValue={cpuMax}
          pending={history.isPending}
          empty={empty}
        />
        <ChartCard
          title="Container memory"
          desc="Resident memory of the same containers."
          now={size(snap.containers.reduce((sum, container) => sum + container.mem_bytes, 0))}
          series={memory}
          unit="bytes"
          pending={history.isPending}
          empty={empty}
        />
      </div>
      <ImageChart images={snap.images ?? []} />
      <Panel title="Containers" meta={`${snap.containers.length} ${snap.containers.length === 1 ? 'container' : 'containers'}`} flush>
        {snap.containers.length === 0 ? (
          <Empty>No container or the Docker socket is not readable by the agent.</Empty>
        ) : (
          <Table label="Containers">
            <THead>
              <Th>Container</Th>
              <Th>Image</Th>
              <Th>State</Th>
              <Th num>CPU</Th>
              <Th num>Memory</Th>
              <Th num>Restarts</Th>
              <Th num>Up</Th>
            </THead>
            <TBody>
              {snap.containers.map((container) => (
                <tr key={container.id}>
                  <Td cell="primary">
                    <Link className="row-name" to={`/nodes/${nodeId}/containers/${container.id}`}>
                      {container.name}
                    </Link>
                  </Td>
                  <Td cell="field" label="Image">
                    {container.image}
                  </Td>
                  <Td cell="field" label="State">
                    <span className="status" data-tone={container.state === 'running' ? 'positive' : container.state === 'restarting' || container.state === 'exited' ? 'warning' : 'neutral'}>
                      <span className="status-dot" data-tone={container.state === 'running' ? 'positive' : container.state === 'restarting' || container.state === 'exited' ? 'warning' : 'neutral'} aria-hidden="true" />
                      {container.state}
                    </span>
                  </Td>
                  <Td num cell="key">
                    {percent(container.cpu_percent, 1)}
                  </Td>
                  <Td num cell="field" label="Memory">
                    {size(container.mem_bytes)}
                  </Td>
                  <Td num cell="field" label="Restarts">
                    {container.restarts}
                  </Td>
                  <Td num cell="field" label="Up">
                    {container.uptime_sec ? duration(container.uptime_sec) : '—'}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </>
  );
}

export function ContainerDetailPage() {
  const view = useSnap();
  const { nodeId = '', containerId = '' } = useParams();
  const [range] = useRange();
  const container = view.snapshot?.containers.find((entry) => entry.id === containerId);
  const history = useContainerHistory(nodeId, range, container ? [container.id] : []);
  if (!container) return <NotFound what="This container" to={`/nodes/${nodeId}/containers`} />;
  const series = history.data?.containers ?? [];
  return (
    <>
    <div className="chart-grid">
      <ChartCard
        title="CPU"
        desc={`${container.name} over the window.`}
        now={percent(container.cpu_percent, 1)}
        series={historyChart(series, 'cpu')}
        unit="percent"
        maxValue={percentCeiling(peakOf(series.flatMap((entry) => entry.points), 'cpu'))}
        pending={history.isPending}
        empty="No sample in this window yet. History is written once a minute."
      />
      <ChartCard
        title="Memory"
        desc={container.mem_limit ? `Resident memory against a ${size(container.mem_limit)} limit.` : 'Resident memory; no limit set.'}
        now={size(container.mem_bytes)}
        series={historyChart(series, 'mem')}
        unit="bytes"
        pending={history.isPending}
        empty="No sample in this window yet. History is written once a minute."
      />
    </div>
    <Panel title={container.name} flush>
      <div className="panel-body">
        <Kv
          rows={[
            { label: 'ID', value: <span className="fig">{container.id}</span> },
            { label: 'Image', value: container.image },
            { label: 'State', value: container.state },
            { label: 'Status', value: container.status },
            { label: 'CPU', value: percent(container.cpu_percent, 1) },
            { label: 'Memory', value: `${size(container.mem_bytes)} of ${size(container.mem_limit)}` },
            { label: 'Restarts', value: container.restarts },
            { label: 'Uptime', value: container.uptime_sec ? duration(container.uptime_sec) : '—' },
            { label: 'Ports', value: container.ports.join(', ') || '—' },
          ]}
        />
      </div>
    </Panel>
    </>
  );
}

export function AppsTab() {
  const view = useSnap();
  const { nodeId = '' } = useParams();
  const query = useActions(nodeId);
  const [selected, setSelected] = useState<Action | null>(null);
  const [open, setOpen] = useState(false);
  const runs = useRuns(nodeId);
  const actions = query.data?.actions ?? [];
  return (
    <>
      <div className="app-grid" data-columns={actions.length % 3 === 0 ? '3' : '2'}>
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action.icon] ?? Terminal;
          return (
            <button
              type="button"
              className="app-tile"
              key={action.id}
              onClick={() => {
                setSelected(action);
                setOpen(true);
              }}
            >
              <span className="app-cell-top">
                <Icon size={18} className="app-tile-icon" aria-hidden="true" />
                <span className="app-cell-name">{action.name}</span>
                <span className="app-tile-pill">
                  {action.last_ok == null ? (
                    <span className="pill" data-tone="neutral">Never run</span>
                  ) : (
                    <span className="pill" data-tone={action.last_ok ? 'positive' : 'negative'}>{action.last_ok ? 'OK' : 'Failed'}</span>
                  )}
                </span>
              </span>
              <span className="app-cell-desc">{action.description}</span>
              <span className="app-cell-meta">
                {action.last_run_at ? relative(action.last_run_at, Date.now()) : 'never run'} · {action.type === 'wol' ? 'Wake-on-LAN' : 'Script'}
              </span>
            </button>
          );
        })}
      </div>
      {actions.length === 0 ? (
        <div className="panel">
          <Empty>No action is configured on this agent. Actions live in the agent config (0600) only.</Empty>
        </div>
      ) : null}
      <Panel title="Recent runs" meta={`${runs.data?.length ?? 0} recorded`} flush>
        <RunsTable runs={runs.data?.filter((run) => actions.some((action) => action.id === run.action_id)) ?? []} onRun={(run) => {
          const action = actions.find((entry) => entry.id === run.action_id);
          if (action) {
            setSelected(action);
            setOpen(true);
          }
        }} />
      </Panel>
      <RunActionDialog action={selected} nodeId={nodeId} nodeName={view.node.name} open={open} onOpenChange={setOpen} />
    </>
  );
}

function RunsTable({ runs, onRun }: { runs: import('../../data/types').ActionRun[]; onRun: (run: import('../../data/types').ActionRun) => void }) {
  if (runs.length === 0) return <Empty>No run recorded yet.</Empty>;
  return (
    <Table label="Recent action runs">
      <THead>
        <Th>Action</Th>
        <Th num>Started</Th>
        <Th>Actor</Th>
        <Th num>Duration</Th>
        <Th>Result</Th>
      </THead>
      <TBody>
        {runs.map((run) => (
          <tr key={run.id}>
            <Td cell="primary">
              <button type="button" className="row-link" onClick={() => onRun(run)}>
                {run.action_name || run.action_id}
              </button>
            </Td>
            <Td num cell="field" label="Started">
              {relative(run.ts, Date.now())}
            </Td>
            <Td cell="field" label="Actor">
              {run.actor} · {run.source}
            </Td>
            <Td num cell="field" label="Duration">
              {(run.duration_ms / 1000).toFixed(1)} s
            </Td>
            <Td cell="key">
              <span className="pill" data-tone={run.ok ? 'positive' : 'negative'}>
                {run.ok ? 'Exited 0' : `Exited ${run.exit_code}`}
              </span>
            </Td>
          </tr>
        ))}
      </TBody>
    </Table>
  );
}

export function AppDetailPage() {
  const { nodeId = '', actionId = '' } = useParams();
  const query = useNode(nodeId);
  const actions = useActions(nodeId);
  const runs = useRuns(nodeId);
  const [open, setOpen] = useState(false);
  const action = actions.data?.actions.find((entry) => entry.id === actionId);
  if (!query.data) return <Empty>Loading…</Empty>;
  if (!action) return <NotFound what={`Action ${actionId}`} to={`/nodes/${nodeId}/apps`} />;
  const Icon = ACTION_ICONS[action.icon] ?? Terminal;
  return (
    <>
      <Panel title={action.name} flush>
        <div className="panel-body">
          <div className="app-detail-head">
            <Icon size={22} aria-hidden="true" />
            <div>
              <p className="app-detail-desc">{action.description}</p>
              <p className="note">
                {action.type === 'wol' ? 'Wake-on-LAN packet from the agent.' : 'Fixed script from the agent config: no shell, no arguments, scrubbed environment.'}{' '}
                {action.allow_api ? 'Token-callable.' : 'Not callable through the API.'} {action.danger ? 'Requires typing the name.' : ''}
              </p>
            </div>
          </div>
          <div className="dialog-foot" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
              Run {action.name}
            </button>
          </div>
        </div>
      </Panel>
      <Panel title="Runs" meta={`${runs.data?.filter((run) => run.action_id === actionId).length ?? 0} recorded`} flush>
        <RunsTable
          runs={(runs.data ?? []).filter((run) => run.action_id === actionId)}
          onRun={() => setOpen(true)}
        />
      </Panel>
      <RunActionDialog action={action} nodeId={nodeId} nodeName={query.data.node.name} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function NodeEventsPage() {
  const view = useSnap();
  return <EventsList nodeId={view.node.id} title={`Events on ${view.node.name}`} />;
}
