// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useMemo, useState, type ReactNode } from 'react';
import { useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { ChartCard } from '../../components/ChartCard';
import type { ChartSeries } from '../../components/SeriesChart';
import { Empty, ErrorPanel, LoadingRows } from '../../components/States';
import { MissingThing } from '../../components/NotFoundPage';
import { UnitPill, UnitState, UnitTable } from '../../components/UnitTable';
import { RunActionDialog } from '../apps/RunActionDialog';
import { ActionMark, ActionRows, LastRun, RunsTable, actionKind } from '../apps/AppsPage';
import { useActions, useContainerHistory, useRuns } from '../../data/queries';
import type { Action, Container, ContainerSeries, DockerImage, NodeView, ProcessInfo } from '../../data/types';
import { seriesColor } from '../../lib/chart';
import { useRange } from './RangeControl';
import { duration, eventTime, percent, relative, size } from '../../lib/format';
import { EventsList } from '../events/EventsList';
import { Band, Facts, Figure, Meter, Section, useIsPhone } from '../../ui/kit';
import {
  Badge,
  Button,
  EmptyState,
  Grid,
  HStack,
  Link,
  List,
  ListItem,
  StatusDot,
  Table,
  Text,
  VStack,
  type TableColumn,
} from '../../ui/primitives';
import { SearchInput } from '../../ui/SearchInput';

function useSnap() {
  return useOutletContext<NodeView>();
}

const WAITING = 'Waiting for the first snapshot.';

function enc(value: string | number): string {
  return encodeURIComponent(String(value));
}

/** A grey dash where a value is missing, mono text otherwise. */
function Mono({ value, lines }: { value: ReactNode; lines?: number }) {
  if (value == null || value === '') {
    return <span className="code is-missing">—</span>;
  }
  return <span className={lines ? 'code clamp-1' : 'code nowrap'}>{value}</span>;
}

/**
 * A detail route inside a node: a link back to the list, the object's name as
 * the h2 (the node name above it is the h1), one context line and controls.
 */
function DetailHead({
  back,
  backLabel,
  title,
  desc,
  actions,
  leading,
}: {
  back: string;
  backLabel: string;
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <HStack gap={1}>
        <Link href={back}>{backLabel}</Link>
      </HStack>
      <HStack hAlign="between" vAlign="center" gap={3} wrap>
        <HStack gap={2} vAlign="center">
          {leading}
          <VStack gap={0.5}>
            <h2 style={{ fontSize: 'var(--fs-head)' }}>{title}</h2>
            {desc ? <span className="muted small">{desc}</span> : null}
          </VStack>
        </HStack>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </HStack>
    </div>
  );
}

function Gone({ what, back, backLabel }: { what: string; back: string; backLabel: string }) {
  return (
    <Band first>
      <MissingThing what={what} back={back} backLabel={backLabel} />
    </Band>
  );
}

/* ------------------------------------------------------------------ processes */

interface ProcRow extends Record<string, unknown> {
  pid: number;
  proc: ProcessInfo;
}

export function ProcessesPage() {
  const view = useSnap();
  const phone = useIsPhone();
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
  if (!snap) return <Empty>{WAITING}</Empty>;

  const cores = Math.max(1, snap.node.cores);
  const total = snap.memory.total;
  const now = Date.now();
  const href = (proc: ProcessInfo) => `/nodes/${enc(nodeId)}/processes/${proc.pid}`;
  const cpuShare = (proc: ProcessInfo) => Math.min(100, proc.cpu_percent / cores);
  const memShare = (proc: ProcessInfo) => (total > 0 ? (proc.rss_bytes / total) * 100 : null);

  const filter = (
    <SearchInput
      label="Filter processes"
      value={query}
      placeholder="Filter by name, user or command…"
      width={phone ? '100%' : 300}
      onChange={setQuery}
    />
  );

  const columns: Array<TableColumn<ProcRow>> = [
    {
      key: 'pid',
      header: 'PID',
      width: '80px',
      align: 'end',
      renderCell: ({ proc }) => <Mono value={proc.pid} />,
    },
    {
      key: 'name',
      header: 'Name',
      width: '180px',
      renderCell: ({ proc }) => (
        <VStack gap={0}>
          <Link href={href(proc)} maxLines={1}>
            {proc.name}
          </Link>
          <Text type="supporting" maxLines={1}>
            {proc.user}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'command',
      header: 'Command line',
      width: '100%',
      renderCell: ({ proc }) => (
        <Text type="code" size="sm" color="secondary" maxLines={1}>
          {proc.command || proc.name}
        </Text>
      ),
    },
    {
      key: 'cpu',
      header: 'CPU',
      width: '140px',
      renderCell: ({ proc }) => (
        <Meter
          value={cpuShare(proc)}
          text={percent(proc.cpu_percent, 1)}
          tone="neutral"
          width={56}
          label={`${proc.name} CPU, bar is its share of all ${cores} threads`}
        />
      ),
    },
    {
      key: 'memory',
      header: 'Memory',
      width: '130px',
      renderCell: ({ proc }) => (
        <Meter
          value={memShare(proc)}
          text={percent(memShare(proc) ?? Number.NaN, 1)}
          tone="neutral"
          width={56}
          label={`${proc.name} share of memory`}
        />
      ),
    },
    {
      key: 'rss',
      header: 'RSS',
      width: '96px',
      align: 'end',
      renderCell: ({ proc }) => <Mono value={size(proc.rss_bytes)} />,
    },
    {
      key: 'threads',
      header: 'Threads',
      width: '84px',
      align: 'end',
      renderCell: ({ proc }) => <Mono value={proc.threads} />,
    },
    {
      key: 'started',
      header: 'Started',
      width: '104px',
      align: 'end',
      renderCell: ({ proc }) => <span className="code nowrap">{proc.started_at ? relative(proc.started_at, now) : '—'}</span>,
    },
  ];

  return (
    <Band
      title="Processes"
      desc={`${procs.length} of ${snap.cpu.procs || snap.processes.length} by CPU · the agent samples the busiest · arguments redacted`}
      actions={filter}
      first
    >
      {procs.length === 0 ? (
        <EmptyState
          title={query ? `No process matches “${query}”` : 'No process sampled'}
          description={query ? 'Clear the filter to see every sampled process.' : 'The agent has not reported processes yet.'}
          actions={query ? <Button label="Clear filter" size="sm" onClick={() => setQuery('')} /> : undefined}
        />
      ) : phone ? (
        <List label="Processes">
          {procs.map((proc) => (
            <ListItem
              key={proc.pid}
              href={href(proc)}
              label={proc.name}
              description={`pid ${proc.pid} · ${proc.user} · ${size(proc.rss_bytes)} · ${proc.threads} threads · ${proc.command || proc.name}`}
              endContent={<Figure value={proc.cpu_percent} unit="%" />}
            />
          ))}
        </List>
      ) : (
        <Table data={procs.map((proc) => ({ pid: proc.pid, proc }))} columns={columns} idKey="pid" label="Processes" hasHover />
      )}
    </Band>
  );
}

export function ProcessDetailPage() {
  const view = useSnap();
  const { nodeId = '', pid = '' } = useParams();
  const back = `/nodes/${enc(nodeId)}/processes`;
  if (!view.snapshot) return <Empty>{WAITING}</Empty>;
  const procs = view.snapshot.processes;
  const proc: ProcessInfo | undefined = procs.find((entry) => String(entry.pid) === pid);
  if (!proc)
    return <Gone what={`Process ${pid} is not in the latest snapshot`} back={back} backLabel="Back to processes" />;
  const parent = procs.find((entry) => entry.pid === proc.ppid);
  const cores = Math.max(1, view.snapshot.node.cores);
  const total = view.snapshot.memory.total;
  return (
    <>
      <DetailHead
        back={back}
        backLabel="Processes"
        title={proc.name}
        desc={[`pid ${proc.pid}`, proc.user, proc.state].filter(Boolean).join(' · ')}
      />
      <Grid columns={{ minWidth: 340, repeat: 'fit' }}>
        <Section title="Process">
          <Facts
            rows={[
              { label: 'PID', value: String(proc.pid) },
              {
                label: 'Parent PID',
                value: parent ? (
                  <Link href={`${back}/${parent.pid}`} type="code">
                    {`${proc.ppid} · ${parent.name}`}
                  </Link>
                ) : (
                  String(proc.ppid)
                ),
              },
              { label: 'User', value: proc.user },
              { label: 'State', value: proc.state },
              {
                label: 'CPU',
                value: (
                  <Meter
                    value={Math.min(100, proc.cpu_percent / cores)}
                    text={percent(proc.cpu_percent, 1)}
                    tone="neutral"
                    label={`CPU, bar is the share of all ${cores} threads`}
                  />
                ),
              },
              {
                label: 'Memory',
                value: (
                  <Meter
                    value={total > 0 ? (proc.rss_bytes / total) * 100 : null}
                    text={size(proc.rss_bytes)}
                    tone="neutral"
                    label="Resident memory, bar is the share of all memory"
                  />
                ),
              },
              { label: 'Threads', value: String(proc.threads) },
              {
                label: 'Started',
                value: proc.started_at ? eventTime(proc.started_at, Date.now()) : '',
              },
            ]}
          />
        </Section>
        <VStack gap={3}>
          <Section title="Context">
            <Facts
              rows={[
                { label: 'TTY', value: proc.tty ? <Mono value={proc.tty} lines={1} /> : '' },
                { label: 'Working directory', value: proc.cwd ? <Mono value={proc.cwd} lines={1} /> : '' },
                { label: 'Cgroup', value: proc.cgroup ? <Mono value={proc.cgroup} lines={1} /> : '' },
                { label: 'Container', value: proc.container ? <Mono value={proc.container} lines={1} /> : '' },
              ]}
            />
          </Section>
          <Section title="Command line" desc="Arguments are redacted by the agent">
            <span className="code break-all">{proc.command || proc.name}</span>
          </Section>
        </VStack>
      </Grid>
      <Text type="supporting">Read-only: Cupola never kills a process in v1.</Text>
    </>
  );
}

/* ------------------------------------------------------------------- services */

export function ServicesPage() {
  const view = useSnap();
  const { nodeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const state = params.get('filter') ?? 'all';
  const snap = view.snapshot;
  if (!snap) return <Empty>{WAITING}</Empty>;
  const all = snap.services;
  const services = all.filter((service) => state === 'all' || service.active_state === state);
  const failed = all.filter((service) => service.active_state === 'failed').length;
  const setState = (next: string) => {
    const search = new URLSearchParams(params);
    if (next && next !== 'all') search.set('filter', next);
    else search.delete('filter');
    setParams(search, { replace: true });
  };
  return (
    <Band
      title="Services"
      desc={`${services.length} of ${all.length} systemd units · ${failed} failed`}
      actions={all.length > 0 ? <UnitState units={all} value={state} onChange={setState} /> : undefined}
      first
    >
      {all.length === 0 ? (
        <EmptyState
          title="No systemd service reported"
          description="The agent found no systemd on this host, or the collector is off."
        />
      ) : (
        <UnitTable rows={services} nodeId={nodeId} showNode={false} showSubState />
      )}
    </Band>
  );
}

export function ServiceDetailPage() {
  const view = useSnap();
  const { nodeId = '', unit = '' } = useParams();
  const back = `/nodes/${enc(nodeId)}/services`;
  if (!view.snapshot) return <Empty>{WAITING}</Empty>;
  const name = decodeURIComponent(unit);
  const service = view.snapshot.services.find((entry) => entry.name === name);
  if (!service) return <Gone what={`${name} is not in the latest snapshot`} back={back} backLabel="Back to services" />;
  return (
    <>
      <DetailHead back={back} backLabel="Services" title={service.name} desc={service.description} />
      <Grid columns={{ minWidth: 340, repeat: 'fit' }}>
        <Section title="Unit">
          <Facts
            rows={[
              { label: 'Active state', value: <UnitPill state={service.active_state} /> },
              { label: 'Sub state', value: service.sub_state },
              { label: 'Load state', value: service.load_state },
              { label: 'Enabled', value: service.enabled },
              { label: 'Restarts', value: String(service.restarts) },
              { label: 'Description', value: service.description ? <Text maxLines={2}>{service.description}</Text> : '' },
            ]}
          />
        </Section>
      </Grid>
      <Text type="supporting">Read-only: Cupola does not restart units in v1.</Text>
    </>
  );
}

/* ----------------------------------------------------------------- containers */

const IMAGE_ROWS = 8;
/** Four distinct data hues is what the token set offers; the table has the rest. */
const CHART_CONTAINERS = 4;
const HISTORY_EMPTY = 'No sample in this window yet. History is written once a minute.';

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

function containerTone(state: string): 'success' | 'warning' | 'neutral' {
  if (state === 'running') return 'success';
  if (state === 'restarting' || state === 'exited') return 'warning';
  return 'neutral';
}

function ContainerState({ state }: { state: string }) {
  return (
    <HStack gap={1.5} vAlign="center">
      <StatusDot variant={containerTone(state)} label={state} />
      <Text type="supporting" textWrap="nowrap">
        {state}
      </Text>
    </HStack>
  );
}

/**
 * Docker images ranked by size. The bar is the image's own size against the
 * largest (every layer it is built from, so shared layers count once per
 * image); the band figure is the bytes those images actually hold on disk,
 * where each layer counts once.
 */
function Images({ images }: { images: DockerImage[] }) {
  const ranked = [...images].sort((a, b) => b.size - a.size);
  const top = ranked.slice(0, IMAGE_ROWS);
  const rest = ranked.slice(IMAGE_ROWS);
  const largest = top[0]?.size || 1;
  const onDisk = images.reduce((sum, image) => sum + Math.max(0, image.size - image.shared_size), 0);
  const restBytes = rest.reduce((sum, image) => sum + image.size, 0);
  const row = (key: string, label: ReactNode, sub: string | null, bar: number | null, value: string) => (
    <HStack key={key} gap={3} vAlign="center" hAlign="between" paddingBlock={2}>
      <VStack gap={0}>
        {label}
        {sub ? (
          <Text type="supporting" maxLines={1}>
            {sub}
          </Text>
        ) : null}
      </VStack>
      <HStack gap={3} vAlign="center">
        {bar != null ? (
          <Meter value={bar} label={`${key} size against the largest image`} tone="neutral" width={160} showValue={false} />
        ) : null}
        <span className="code nowrap" style={{ width: 72, textAlign: 'right' }}>
          {value}
        </span>
      </HStack>
    </HStack>
  );
  return (
    <Band title="Images" desc={`${images.length} images · ${size(onDisk)} on disk · largest first`}>
      {images.length === 0 ? (
        <EmptyState
          title="No image reported"
          description="The image list is empty or the Docker socket is not readable by the agent."
        />
      ) : (
        <div className="rows">
          {top.map((image) =>
            row(
              image.id,
              <span className="code clamp-1">{image.repo_tag}</span>,
              `${image.containers} ${image.containers === 1 ? 'container' : 'containers'} · ${image.id.replace(/^sha256:/, '').slice(0, 12)}${image.dangling ? ' · dangling' : ''}`,
              Math.max(2, (image.size / largest) * 100),
              size(image.size),
            ),
          )}
          {rest.length > 0
            ? row('rest', <span className="muted small">{rest.length} more</span>, null, null, size(restBytes))
            : null}
        </div>
      )}
    </Band>
  );
}

interface BoxRow extends Record<string, unknown> {
  id: string;
  box: Container;
}

function ContainersTable({ nodeId, containers, cores }: { nodeId: string; containers: Container[]; cores: number }) {
  const phone = useIsPhone();
  const href = (box: Container) => `/nodes/${enc(nodeId)}/containers/${enc(box.id)}`;
  const up = (box: Container) => (box.uptime_sec ? duration(box.uptime_sec) : '—');
  if (phone) {
    return (
      <List label="Containers">
        {containers.map((box) => (
          <ListItem
            key={box.id}
            href={href(box)}
            startContent={<StatusDot variant={containerTone(box.state)} label={box.state} />}
            label={box.name}
            description={`${box.image} · ${box.state} · ${size(box.mem_bytes)} · up ${up(box)} · ${box.restarts} restarts`}
            endContent={<Figure value={box.cpu_percent} unit="%" />}
          />
        ))}
      </List>
    );
  }
  const columns: Array<TableColumn<BoxRow>> = [
    {
      key: 'name',
      header: 'Container',
      width: '100%',
      renderCell: ({ box }) => (
        <HStack gap={2} vAlign="center">
          <StatusDot variant={containerTone(box.state)} label={box.state} />
          <Link href={href(box)} maxLines={1}>
            {box.name}
          </Link>
        </HStack>
      ),
    },
    {
      key: 'image',
      header: 'Image',
      width: '220px',
      renderCell: ({ box }) => (
        <Text type="code" size="sm" color="secondary" maxLines={1}>
          {box.image}
        </Text>
      ),
    },
    {
      key: 'state',
      header: 'State',
      width: '110px',
      renderCell: ({ box }) => (
        <Text type="supporting" textWrap="nowrap">
          {box.state}
        </Text>
      ),
    },
    {
      key: 'cpu',
      header: 'CPU',
      width: '140px',
      renderCell: ({ box }) => (
        <Meter
          value={Math.min(100, box.cpu_percent / cores)}
          text={percent(box.cpu_percent, 1)}
          tone="neutral"
          width={56}
          label={`${box.name} CPU, bar is its share of all ${cores} threads`}
        />
      ),
    },
    {
      key: 'memory',
      header: 'Memory',
      width: '100px',
      align: 'end',
      renderCell: ({ box }) => <Mono value={size(box.mem_bytes)} />,
    },
    {
      key: 'restarts',
      header: 'Restarts',
      width: '90px',
      align: 'end',
      renderCell: ({ box }) => <Mono value={box.restarts} />,
    },
    {
      key: 'up',
      header: 'Up',
      width: '90px',
      align: 'end',
      renderCell: ({ box }) => <Mono value={box.uptime_sec ? duration(box.uptime_sec) : ''} />,
    },
  ];
  return <Table data={containers.map((box) => ({ id: box.id, box }))} columns={columns} idKey="id" label="Containers" hasHover />;
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
  if (!snap) return <Empty>{WAITING}</Empty>;
  const cpu = historyChart(containers, 'cpu');
  const memory = historyChart(containers, 'mem');
  const cpuMax = percentCeiling(
    peakOf(
      containers.flatMap((entry) => entry.points),
      'cpu',
    ),
  );
  const running = snap.containers.filter((box) => box.state === 'running').length;
  return (
    <>
      <Band
        title="Containers"
        desc={`${snap.containers.length} ${snap.containers.length === 1 ? 'container' : 'containers'} · ${running} running · Docker over the unix socket`}
        first
      >
        <Grid columns={{ minWidth: 320, max: 3, repeat: 'fit' }}>
          <ChartCard
            title="Container CPU"
            desc={cpu.length > 1 ? `The ${cpu.length} busiest containers in this window` : 'The busiest container in this window'}
            now={percent(
              snap.containers.reduce((sum, container) => sum + container.cpu_percent, 0),
              1,
            )}
            series={cpu}
            unit="percent"
            maxValue={cpuMax}
            pending={history.isPending}
            empty={HISTORY_EMPTY}
          />
          <ChartCard
            title="Container memory"
            desc="Resident memory of the same containers"
            now={size(snap.containers.reduce((sum, container) => sum + container.mem_bytes, 0))}
            series={memory}
            unit="bytes"
            pending={history.isPending}
            empty={HISTORY_EMPTY}
          />
        </Grid>
        {snap.containers.length === 0 ? (
          <EmptyState
            title="No container reported"
            description="No container runs here, or the Docker socket is not readable by the agent."
          />
        ) : (
          <ContainersTable nodeId={nodeId} containers={snap.containers} cores={Math.max(1, snap.node.cores)} />
        )}
      </Band>
      <Images images={snap.images ?? []} />
    </>
  );
}

export function ContainerDetailPage() {
  const view = useSnap();
  const { nodeId = '', containerId = '' } = useParams();
  const [range] = useRange();
  const container = view.snapshot?.containers.find((entry) => entry.id === containerId);
  const history = useContainerHistory(nodeId, range, container ? [container.id] : []);
  const back = `/nodes/${enc(nodeId)}/containers`;
  if (!view.snapshot) return <Empty>{WAITING}</Empty>;
  if (!container)
    return <Gone what="This container is not in the latest snapshot" back={back} backLabel="Back to containers" />;
  const series = history.data?.containers ?? [];
  const memShare = container.mem_limit > 0 ? (container.mem_bytes / container.mem_limit) * 100 : null;
  return (
    <>
      <DetailHead
        back={back}
        backLabel="Containers"
        title={container.name}
        desc={`${container.image} · ${container.status || container.state}`}
        leading={<StatusDot variant={containerTone(container.state)} label={container.state} tooltip={container.state} />}
      />
      <Grid columns={{ minWidth: 320, repeat: 'fit' }}>
        <ChartCard
          title="CPU"
          desc={`${container.name} over the window`}
          now={percent(container.cpu_percent, 1)}
          series={historyChart(series, 'cpu')}
          unit="percent"
          maxValue={percentCeiling(
            peakOf(
              series.flatMap((entry) => entry.points),
              'cpu',
            ),
          )}
          pending={history.isPending}
          empty={HISTORY_EMPTY}
        />
        <ChartCard
          title="Memory"
          desc={container.mem_limit ? `Resident memory against a ${size(container.mem_limit)} limit` : 'Resident memory; no limit set'}
          now={size(container.mem_bytes)}
          series={historyChart(series, 'mem')}
          unit="bytes"
          pending={history.isPending}
          empty={HISTORY_EMPTY}
        />
      </Grid>
      <Section title="Container">
        <Facts
          rows={[
            { label: 'ID', value: <Mono value={container.id} lines={1} /> },
            { label: 'Image', value: <Mono value={container.image} lines={1} /> },
            { label: 'State', value: <ContainerState state={container.state} /> },
            { label: 'Status', value: container.status },
            { label: 'CPU', value: percent(container.cpu_percent, 1) },
            {
              label: 'Memory',
              value:
                memShare != null ? (
                  <Meter
                    value={memShare}
                    text={`${size(container.mem_bytes)} of ${size(container.mem_limit)}`}
                    label="Memory against the limit"
                  />
                ) : (
                  `${size(container.mem_bytes)} · no limit`
                ),
            },
            { label: 'Restarts', value: String(container.restarts) },
            { label: 'Uptime', value: container.uptime_sec ? duration(container.uptime_sec) : '' },
            { label: 'Ports', value: container.ports.length ? <Mono value={container.ports.join(', ')} lines={2} /> : '' },
          ]}
        />
      </Section>
    </>
  );
}

/* ----------------------------------------------------------------------- apps */

export function AppsTab() {
  const view = useSnap();
  const { nodeId = '' } = useParams();
  const query = useActions(nodeId);
  const [selected, setSelected] = useState<Action | null>(null);
  const [open, setOpen] = useState(false);
  const runs = useRuns(nodeId);
  const actions = query.data?.actions ?? [];
  const own = (runs.data ?? []).filter((run) => actions.some((action) => action.id === run.action_id));
  return (
    <>
      <Band title="Apps" desc="Actions live in the agent config and are run by the hub" first>
        {query.isPending ? (
          <LoadingRows rows={3} columns={3} />
        ) : query.isError ? (
          <ErrorPanel what="Could not load this agent's actions." onRetry={() => void query.refetch()} />
        ) : actions.length === 0 ? (
          <EmptyState
            title="No action is configured on this agent"
            description="Actions live in the agent config (0600) only; the hub cannot create them."
          />
        ) : (
          <ActionRows
            actions={actions}
            nodeId={nodeId}
            nodeName={view.node.name}
            onRun={(action) => {
              setSelected(action);
              setOpen(true);
            }}
          />
        )}
      </Band>
      <Band title="Recent runs" desc={`${own.length} recorded`}>
        <RunsTable runs={own} />
      </Band>
      <RunActionDialog action={selected} nodeId={nodeId} nodeName={view.node.name} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AppDetailPage() {
  const view = useSnap();
  const { nodeId = '', actionId = '' } = useParams();
  const actions = useActions(nodeId);
  const runs = useRuns(nodeId);
  const [open, setOpen] = useState(false);
  const back = `/nodes/${enc(nodeId)}/apps`;
  if (actions.isPending) return <LoadingRows rows={4} columns={2} />;
  if (actions.isError)
    return <ErrorPanel what="Could not load this agent's actions." onRetry={() => void actions.refetch()} />;
  const action = actions.data?.actions.find((entry) => entry.id === actionId);
  if (!action) return <Gone what={`No action has the id “${actionId}”`} back={back} backLabel="Back to apps" />;
  const own = (runs.data ?? []).filter((run) => run.action_id === actionId);
  return (
    <>
      <DetailHead
        back={back}
        backLabel="Apps"
        leading={<ActionMark action={action} size={24} />}
        title={action.name}
        desc={action.description}
        actions={
          <Button
            label={`Run ${action.name}`}
            variant={action.danger ? 'danger' : 'primary'}
            onClick={() => setOpen(true)}
          />
        }
      />
      <Grid columns={{ minWidth: 340, repeat: 'fit' }}>
        <Section title="Action">
          <Facts
            rows={[
              { label: 'Type', value: actionKind(action) },
              { label: 'API', value: action.allow_api ? 'Token-callable' : 'Not callable through the API' },
              {
                label: 'Confirmation',
                value: action.danger ? <Badge variant="error" label="Requires typing the name" /> : 'One click',
              },
              { label: 'Last result', value: <LastRun action={action} /> },
              { label: 'Last run', value: action.last_run_at ? relative(action.last_run_at, Date.now()) : '' },
            ]}
          />
        </Section>
        <Section title="How it runs">
          <Text type="supporting">
            {action.type === 'wol'
              ? 'Wake-on-LAN packet sent by the agent.'
              : 'Fixed script from the agent config: no shell, no arguments, scrubbed environment.'}
          </Text>
          <Text type="supporting">One run at a time, 60 s timeout, output truncated to 8 KiB. Every result is an event.</Text>
        </Section>
      </Grid>
      <Band title="Runs" desc={`${own.length} recorded`}>
        <RunsTable runs={own} showAction={false} />
      </Band>
      <RunActionDialog action={action} nodeId={nodeId} nodeName={view.node.name} open={open} onOpenChange={setOpen} />
    </>
  );
}

/* --------------------------------------------------------------------- events */

export function NodeEventsPage() {
  const view = useSnap();
  return <EventsList nodeId={view.node.id} title={`Events on ${view.node.name}`} />;
}
