import { Children, useMemo, type ReactNode } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { ChartCard } from '../../components/ChartCard';
import type { ChartSeries } from '../../components/SeriesChart';
import { Empty } from '../../components/States';
import { useSeries } from '../../data/queries';
import type { NodeView, ProcessInfo, SeriesPoint, SMARTDevice } from '../../data/types';
import { seriesColor } from '../../lib/chart';
import { days, duration, netRate, percent, rate, size } from '../../lib/format';
import { Band, Facts, Meter, Section, Stat, useIsPhone } from '../../ui/kit';
import { Grid, HStack, Link, StatusDot, Table, Text, VStack, type TableColumn } from '../../ui/primitives';
import { percentCeiling } from './NodeLists';
import { rangeLabel, useRange } from './RangeControl';

export { Stat };

export function useSnapshot() {
  return useOutletContext<NodeView>();
}

/** One history series for this node and window. */
export function useMetric(nodeId: string, metric: string, range: string) {
  const query = useSeries(nodeId, metric, range);
  const points = useMemo(() => query.data?.points ?? [], [query.data]);
  return { points, pending: query.isPending };
}

export function peak(...lists: Array<SeriesPoint[] | undefined>): number {
  let max = 0;
  for (const list of lists) for (const point of list ?? []) if (point.max > max) max = point.max;
  return max;
}

/**
 * What an empty chart frame says. An offline node keeps its frames and says
 * how long it has been silent; a live one is waiting for its next sample.
 */
export function emptyNote(view: NodeView): string | undefined {
  if (view.health.status !== 'offline') return undefined;
  if (!view.node.last_seen) return `${view.node.name} has never reported.`;
  return `${view.node.name} has not reported for ${duration((Date.now() - view.node.last_seen) / 1000)}.`;
}

export function WaitingForSnapshot({ view }: { view: NodeView }) {
  return (
    <Band title="Waiting for data" first>
      <Empty>
        {emptyNote(view) ?? 'The hub has no snapshot for this system yet. The first poll runs within a few seconds.'}
      </Empty>
    </Band>
  );
}

/** Rows of a list, hairlines between. */
export function Rows({ children }: { children: ReactNode }) {
  return <div className="rows">{Children.toArray(children)}</div>;
}

const CHART_GRID = { minWidth: 320, max: 3, repeat: 'fit' } as const;

export function CpuPage() {
  const view = useSnapshot();
  const { nodeId = '' } = useParams();
  const [range] = useRange();
  const snap = view.snapshot;
  const cpu = useMetric(nodeId, 'cpu', range);
  const pressure = useMetric(nodeId, 'psi_cpu', range);
  const chart = useMemo<ChartSeries[]>(
    () => [
      { label: 'Utilisation', points: cpu.points, color: seriesColor(0) },
      { label: 'Pressure', points: pressure.points, color: seriesColor(2) },
    ],
    [cpu.points, pressure.points],
  );
  if (!snap) return <WaitingForSnapshot view={view} />;
  const cores = snap.cpu.per_core;
  return (
    <>
      <Band title="Utilisation" desc={`${rangeLabel(range)} · ${snap.node.cores} threads`} first>
        <Grid columns={CHART_GRID}>
          <ChartCard
            title="CPU utilisation and pressure"
            desc="Pressure is the share of time runnable tasks waited for a CPU; the dashed line is the 80 % alert."
            now={percent(snap.cpu.percent, 1)}
            series={chart}
            unit="percent"
            threshold={80}
            legend={[percent(snap.cpu.percent, 1), percent(snap.pressure.cpu.some, 1)]}
            pending={cpu.pending || pressure.pending}
            empty={emptyNote(view)}
            height={220}
          />
          <Section title="Breakdown" desc="Where the CPU time went in the last sample.">
            <Facts
              rows={[
                { label: 'User', value: percent(snap.cpu.user, 1) },
                { label: 'System', value: percent(snap.cpu.system, 1) },
                { label: 'I/O wait', value: percent(snap.cpu.iowait, 1) },
                { label: 'Steal', value: percent(snap.cpu.steal, 1) },
                {
                  label: 'Load 1 / 5 / 15',
                  value: `${snap.cpu.load1.toFixed(2)} / ${snap.cpu.load5.toFixed(2)} / ${snap.cpu.load15.toFixed(2)}`,
                },
                { label: 'Processes', value: String(snap.cpu.procs) },
                { label: 'Clock', value: snap.cpu.mhz ? `${(snap.cpu.mhz / 1000).toFixed(2)} GHz` : null },
              ]}
            />
          </Section>
        </Grid>
      </Band>
      <Band title="Per core" desc={`${cores.length} threads · ${snap.node.cpu_model || 'unknown model'}`}>
        {cores.length === 0 ? (
          <Empty>This agent did not report per-core usage.</Empty>
        ) : (
          <Grid columns={{ minWidth: 240, repeat: 'fill' }} gap={0} columnGap={6}>
            {cores.map((value, index) => (
              <HStack key={index} gap={3} vAlign="center" paddingBlock={1.5}>
                <span className="code muted" style={{ width: 28 }}>
                  {index}
                </span>
                <Meter value={value} label={`Thread ${index}`} tone="neutral" width={140} />
              </HStack>
            ))}
          </Grid>
        )}
      </Band>
    </>
  );
}

type ResidentRow = { pid: number; proc: ProcessInfo };

export function MemoryPage() {
  const view = useSnapshot();
  const { nodeId = '' } = useParams();
  const [range] = useRange();
  const phone = useIsPhone();
  const snap = view.snapshot;
  const mem = useMetric(nodeId, 'mem', range);
  const chart = useMemo<ChartSeries[]>(() => [{ label: 'Memory', points: mem.points, color: seriesColor(0) }], [mem.points]);
  if (!snap) return <WaitingForSnapshot view={view} />;
  const total = snap.memory.total;
  const top: ResidentRow[] = [...snap.processes]
    .sort((a, b) => b.rss_bytes - a.rss_bytes)
    .slice(0, 8)
    .map((proc) => ({ pid: proc.pid, proc }));
  const swapPct = snap.memory.swap_total ? (snap.memory.swap_used / snap.memory.swap_total) * 100 : null;
  const share = (proc: ProcessInfo) => (total ? (proc.rss_bytes / total) * 100 : null);
  const procLink = (proc: ProcessInfo) => <Link href={`/nodes/${nodeId}/processes/${proc.pid}`}>{proc.name}</Link>;
  const columns: Array<TableColumn<ResidentRow>> = [
    {
      key: 'name',
      header: 'Process',
      width: '100%',
      renderCell: ({ proc }) => (
        <VStack gap={0}>
          <Text maxLines={1}>{procLink(proc)}</Text>
          <Text type="supporting" maxLines={1}>
            {proc.user}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'pid',
      header: 'PID',
      width: '96px',
      align: 'end',
      renderCell: ({ proc }) => <Text type="code">{proc.pid}</Text>,
    },
    {
      key: 'memory',
      header: 'Memory',
      width: '220px',
      renderCell: ({ proc }) => (
        <Meter
          value={share(proc)}
          text={size(proc.rss_bytes)}
          tone="neutral"
          label={`${proc.name} resident memory, bar is its share of ${size(total)}`}
        />
      ),
    },
    {
      key: 'cpu',
      header: 'CPU',
      width: '96px',
      align: 'end',
      renderCell: ({ proc }) => <Text type="code">{percent(proc.cpu_percent, 1)}</Text>,
    },
  ];
  return (
    <>
      <Band title="Usage" desc={`${rangeLabel(range)} · ${size(total)} installed`} first>
        <Grid columns={CHART_GRID}>
          <ChartCard
            title="Memory usage"
            desc={`Used share of ${size(total)} over the window.`}
            now={percent(snap.memory.used_percent, 1)}
            series={chart}
            unit="percent"
            pending={mem.pending}
            empty={emptyNote(view)}
            height={220}
          />
          <Section title="Breakdown" desc="The last sample.">
            <VStack gap={3}>
              <Facts
                rows={[
                  { label: 'Total', value: size(total) },
                  { label: 'Used', value: size(snap.memory.used) },
                  { label: 'Available', value: size(snap.memory.available) },
                  { label: 'Cached', value: size(snap.memory.cached) },
                  { label: 'Buffers', value: size(snap.memory.buffers) },
                  {
                    label: 'Swap',
                    value: snap.memory.swap_total ? `${size(snap.memory.swap_used)} of ${size(snap.memory.swap_total)}` : 'none',
                  },
                  { label: 'Pressure', value: percent(snap.pressure.mem.some, 1) },
                ]}
              />
              {swapPct != null ? (
                <HStack gap={3} vAlign="center" hAlign="between">
                  <span className="muted small">Swap used</span>
                  <Meter value={swapPct} label="Swap used" width={140} />
                </HStack>
              ) : null}
            </VStack>
          </Section>
        </Grid>
      </Band>
      <Band title="Largest residents" desc={`${top.length} of ${snap.processes.length} sampled processes, by resident memory`}>
        {top.length === 0 ? (
          <Empty>No process sample in the last snapshot.</Empty>
        ) : phone ? (
          <Rows>
            {top.map(({ proc }) => (
              <VStack key={proc.pid} gap={1.5} paddingBlock={3}>
                <HStack gap={2} vAlign="center" hAlign="between">
                  <HStack gap={1.5} vAlign="center">
                    {procLink(proc)}
                    <Text type="supporting">{proc.user}</Text>
                  </HStack>
                  <Text type="code" color="secondary">
                    {proc.pid}
                  </Text>
                </HStack>
                <HStack gap={4} vAlign="center" wrap>
                  <Meter value={share(proc)} text={size(proc.rss_bytes)} tone="neutral" label={`${proc.name} resident memory`} width={140} />
                  <Stat label="CPU">{percent(proc.cpu_percent, 1)}</Stat>
                </HStack>
              </VStack>
            ))}
          </Rows>
        ) : (
          <Table data={top} columns={columns} idKey="pid" label="Largest residents" hasHover />
        )}
      </Band>
    </>
  );
}

function healthTone(drive: SMARTDevice) {
  if (drive.error) return 'neutral' as const;
  return /pass|ok/i.test(drive.health) ? ('success' as const) : ('error' as const);
}

export function StoragePage() {
  const view = useSnapshot();
  const { nodeId = '' } = useParams();
  const [range] = useRange();
  const phone = useIsPhone();
  const snap = view.snapshot;
  const read = useMetric(nodeId, 'disk_r', range);
  const write = useMetric(nodeId, 'disk_w', range);
  const io = useMetric(nodeId, 'psi_io', range);
  const chart = useMemo<ChartSeries[]>(
    () => [
      { label: 'Read', points: read.points, color: seriesColor(0) },
      { label: 'Write', points: write.points, color: seriesColor(1) },
    ],
    [read.points, write.points],
  );
  const pressure = useMemo<ChartSeries[]>(() => [{ label: 'I/O pressure', points: io.points, color: seriesColor(0) }], [io.points]);
  if (!snap) return <WaitingForSnapshot view={view} />;
  const readNow = snap.disks.reduce((sum, disk) => sum + disk.read_bps, 0);
  const writeNow = snap.disks.reduce((sum, disk) => sum + disk.write_bps, 0);
  const empty = emptyNote(view);
  return (
    <>
      <Band title="Throughput" desc={`${rangeLabel(range)} · all sampled block devices`} first>
        <Grid columns={CHART_GRID}>
          <ChartCard
            title="Disk I/O"
            desc="Bytes per second across the sampled block devices."
            now={rate(readNow + writeNow)}
            series={chart}
            unit="rate"
            legend={[rate(readNow), rate(writeNow)]}
            pending={read.pending || write.pending}
            empty={empty}
          />
          <ChartCard
            title="I/O pressure"
            desc="Share of time some task waited on storage."
            now={percent(snap.pressure.io.some, 1)}
            series={pressure}
            unit="percent"
            maxValue={percentCeiling(peak(io.points))}
            pending={io.pending}
            empty={empty}
          />
        </Grid>
      </Band>
      <Band title="Filesystems" desc={`${snap.disks.length} mounted · fill prediction covers the root filesystem`}>
        {snap.disks.length === 0 ? (
          <Empty>No filesystem reported.</Empty>
        ) : (
          <Rows>
            {snap.disks.map((disk) => (
              <VStack key={disk.device + disk.mount} gap={2} paddingBlock={3}>
                <HStack gap={3} vAlign="center" hAlign="between">
                  <VStack gap={0.5}>
                    <span className="code">{disk.mount}</span>
                    <span className="muted small">
                      {disk.device} · {disk.fstype}
                      {disk.read_only ? ' · read-only' : ''}
                    </span>
                  </VStack>
                  <Meter value={disk.used_pct} label={`${disk.mount} used`} width={phone ? 120 : 220} />
                </HStack>
                <HStack gap={5} vAlign="center" wrap>
                  <Stat label="Used">{`${size(disk.used)} of ${size(disk.total)}`}</Stat>
                  <Stat label="Inodes">
                    <Meter value={disk.inode_pct} label={`${disk.mount} inodes used`} width={64} />
                  </Stat>
                  <Stat label="Read">{rate(disk.read_bps)}</Stat>
                  <Stat label="Write">{rate(disk.write_bps)}</Stat>
                  {disk.mount === '/' && view.health.days_to_full ? (
                    <Stat label="Full in">{days(view.health.days_to_full)}</Stat>
                  ) : null}
                </HStack>
              </VStack>
            ))}
          </Rows>
        )}
      </Band>
      {snap.smart.length > 0 ? (
        <Band title="Drive health" desc="SMART and NVMe self-reports">
          <Grid columns={{ minWidth: 300, repeat: 'fill' }}>
            {snap.smart.map((drive) => (
              <section className="panel" key={drive.device} style={{ padding: 16 }}>
                <VStack gap={3}>
                  <HStack gap={2} vAlign="center" hAlign="between">
                    <VStack gap={0.5}>
                      <span className="code">{drive.device}</span>
                      <span className="muted small">{drive.model || drive.type}</span>
                    </VStack>
                    <HStack gap={1.5} vAlign="center">
                      <StatusDot variant={healthTone(drive)} label={drive.error ? 'unreadable' : drive.health || 'unknown'} />
                      <span className="muted small">{drive.error ? 'unreadable' : drive.health || '—'}</span>
                    </HStack>
                  </HStack>
                  <Facts
                    rows={[
                      { label: 'Wear', value: <Meter value={drive.wear_percent} label={`${drive.device} wear`} width={96} /> },
                      { label: 'Temperature', value: drive.temperature_c ? `${Math.round(drive.temperature_c)} °C` : null },
                      { label: 'Power-on', value: drive.power_on_hours ? `${drive.power_on_hours} h` : null },
                      { label: 'Reallocated', value: String(drive.reallocated) },
                    ]}
                  />
                </VStack>
              </section>
            ))}
          </Grid>
        </Band>
      ) : null}
    </>
  );
}

export function NetworkPage() {
  const view = useSnapshot();
  const { nodeId = '' } = useParams();
  const [range] = useRange();
  const snap = view.snapshot;
  const rx = useMetric(nodeId, 'net_rx', range);
  const tx = useMetric(nodeId, 'net_tx', range);
  const chart = useMemo<ChartSeries[]>(
    () => [
      { label: 'Received', points: rx.points, color: seriesColor(0) },
      { label: 'Sent', points: tx.points, color: seriesColor(1) },
    ],
    [rx.points, tx.points],
  );
  if (!snap) return <WaitingForSnapshot view={view} />;
  const ifaces = snap.network.filter((iface) => iface.iface !== 'lo');
  const sum = (key: 'rx_bps' | 'tx_bps') => ifaces.reduce((total, iface) => total + iface[key], 0);
  return (
    <>
      <Band title="Traffic" desc={`${rangeLabel(range)} · loopback excluded`} first>
        <Grid columns={CHART_GRID}>
          <ChartCard
            title="Bandwidth"
            desc={`Bits per second over ${ifaces.length} ${ifaces.length === 1 ? 'interface' : 'interfaces'}, loopback excluded.`}
            now={netRate(sum('rx_bps') + sum('tx_bps'))}
            series={chart}
            unit="net"
            legend={[netRate(sum('rx_bps')), netRate(sum('tx_bps'))]}
            pending={rx.pending || tx.pending}
            empty={emptyNote(view)}
            height={220}
          />
          <Section title="Connections" desc="Kernel tables in the last sample.">
            <Facts
              rows={[
                { label: 'Conntrack entries', value: String(snap.fd.conntrack || 0) },
                {
                  label: 'Open files',
                  // the kernel reports "no limit" as a 63-bit integer
                  value: `${snap.fd.allocated} of ${snap.fd.max >= 2 ** 53 ? 'no limit' : snap.fd.max}`,
                },
                { label: 'Listening ports', value: String(snap.ports.length) },
                { label: 'Interfaces up', value: `${snap.network.filter((iface) => iface.up).length} of ${snap.network.length}` },
              ]}
            />
          </Section>
        </Grid>
      </Band>
      <Band title="Interfaces" desc={`${snap.network.length} reported · live rates from the latest snapshot`}>
        {snap.network.length === 0 ? (
          <Empty>No interface reported.</Empty>
        ) : (
          <Grid columns={{ minWidth: 260, repeat: 'fill' }}>
            {snap.network.map((iface) => (
              <section className="panel" key={iface.iface} style={{ padding: 16 }}>
                <VStack gap={3}>
                  <HStack gap={2} vAlign="center" hAlign="between">
                    <HStack gap={1.5} vAlign="center">
                      <StatusDot variant={iface.up ? 'success' : 'neutral'} label={iface.up ? 'up' : 'down'} tooltip={iface.up ? 'up' : 'down'} />
                      <span className="code">{iface.iface}</span>
                    </HStack>
                    <span className="code muted">{iface.speed_mbps ? `${iface.speed_mbps} Mbit/s` : '—'}</span>
                  </HStack>
                  <HStack gap={5} wrap>
                    <VStack gap={0.5}>
                      <span className="muted small">In</span>
                      <span className="code">{netRate(iface.rx_bps)}</span>
                    </VStack>
                    <VStack gap={0.5}>
                      <span className="muted small">Out</span>
                      <span className="code">{netRate(iface.tx_bps)}</span>
                    </VStack>
                  </HStack>
                  <HStack gap={4} wrap>
                    <Stat label="Errors">{iface.rx_errors + iface.tx_errors}</Stat>
                    <Stat label="Drops">{iface.rx_drops + iface.tx_drops}</Stat>
                    <Stat label="Driver">{iface.driver || '—'}</Stat>
                  </HStack>
                </VStack>
              </section>
            ))}
          </Grid>
        )}
      </Band>
    </>
  );
}
