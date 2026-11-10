import { useMemo, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { ChartCard } from '../../components/ChartCard';
import type { ChartSeries } from '../../components/SeriesChart';
import { Empty } from '../../components/States';
import { useContainerHistory } from '../../data/queries';
import type { NodeView, ProcessInfo, SeriesPoint } from '../../data/types';
import { seriesColor } from '../../lib/chart';
import { days, netRate, percent, rate, relative, size } from '../../lib/format';
import { Band, KpiCell, KpiStrip, levelOf, Meter, Section, useIsPhone } from '../../ui/kit';
import { emptyNote, peak, Rows, Stat, useMetric, useSnapshot, WaitingForSnapshot } from './MetricPages';
import { historyChart, peakOf, percentCeiling } from './NodeLists';
import { rangeLabel, useRange } from './RangeControl';

const DOCKER_SERIES = 4;
const CHART_GRID = { minWidth: 320, max: 3, repeat: 'fit' } as const;

function last(points: SeriesPoint[] | undefined): number | null {
  return points && points.length ? points[points.length - 1].avg : null;
}

/** A meter row in a card: name and context on the left, the bar and a figure on the right. */
function MeterRow({ name, sub, meter, figure }: { name: string; sub?: string; meter: ReactNode; figure?: string }) {
  return (
    <HStack gap={3} vAlign="center" hAlign="between" paddingBlock={2}>
      <VStack gap={0}>
        <Text type="code" maxLines={1}>
          {name}
        </Text>
        {sub ? (
          <Text type="supporting" maxLines={1}>
            {sub}
          </Text>
        ) : null}
      </VStack>
      <HStack gap={3} vAlign="center">
        {meter}
        {figure ? (
          <Text type="code" color="secondary" hasTabularNumbers textWrap="nowrap">
            {figure}
          </Text>
        ) : null}
      </HStack>
    </HStack>
  );
}

type ProcRow = { pid: number; proc: ProcessInfo };

function TopProcesses({ view, nodeId }: { view: NodeView; nodeId: string }) {
  const phone = useIsPhone();
  const snap = view.snapshot!;
  const cores = Math.max(1, snap.node.cores);
  const rows: ProcRow[] = [...snap.processes]
    .sort((a, b) => b.cpu_percent - a.cpu_percent)
    .slice(0, 8)
    .map((proc) => ({ pid: proc.pid, proc }));
  const now = Date.now();
  const name = (proc: ProcessInfo) => <Link href={`/nodes/${nodeId}/processes/${proc.pid}`}>{proc.name}</Link>;
  const cpu = (proc: ProcessInfo, width?: number) => (
    <Meter
      value={Math.min(100, proc.cpu_percent / cores)}
      text={percent(proc.cpu_percent, 1)}
      tone="neutral"
      width={width}
      label={`${proc.name} CPU, bar is its share of all ${snap.node.cores} threads`}
    />
  );
  const mono = (value: string | number) => (
    <Text type="code" hasTabularNumbers textWrap="nowrap">
      {value}
    </Text>
  );
  const columns: TableColumn<ProcRow>[] = [
    {
      key: 'name',
      header: 'Process',
      width: proportional(1, { minWidth: 180 }),
      renderCell: ({ proc }) => <Text maxLines={1}>{name(proc)}</Text>,
    },
    { key: 'pid', header: 'PID', width: pixel(88), align: 'end', renderCell: ({ proc }) => mono(proc.pid) },
    {
      key: 'user',
      header: 'User',
      width: pixel(120),
      renderCell: ({ proc }) => (
        <Text type="supporting" maxLines={1}>
          {proc.user}
        </Text>
      ),
    },
    { key: 'cpu', header: 'CPU', width: pixel(180), renderCell: ({ proc }) => cpu(proc) },
    { key: 'memory', header: 'Memory', width: pixel(104), align: 'end', renderCell: ({ proc }) => mono(size(proc.rss_bytes)) },
    { key: 'threads', header: 'Threads', width: pixel(88), align: 'end', renderCell: ({ proc }) => mono(proc.threads) },
    {
      key: 'started',
      header: 'Started',
      width: pixel(112),
      align: 'end',
      renderCell: ({ proc }) => mono(relative(proc.started_at, now)),
    },
  ];

  return (
    <Band
      title="Top processes"
      desc="By CPU in the last snapshot; arguments are redacted"
      actions={<Link href={`/nodes/${nodeId}/processes`}>{`All ${snap.cpu.procs || snap.processes.length}`}</Link>}
    >
      {rows.length === 0 ? (
        <Empty>No process sample in the last snapshot.</Empty>
      ) : phone ? (
        <Rows>{
          rows.map(({ proc }) => (
            <VStack key={proc.pid} gap={1.5} paddingBlock={3}>
              <HStack gap={2} vAlign="center" hAlign="between">
                <HStack gap={1.5} vAlign="center">
                  {name(proc)}
                  <Text type="supporting">{proc.user}</Text>
                </HStack>
                <Text type="code" color="secondary" hasTabularNumbers>
                  {proc.pid}
                </Text>
              </HStack>
              {cpu(proc, 140)}
              <HStack gap={4} wrap="wrap">
                <Stat label="Memory">{size(proc.rss_bytes)}</Stat>
                <Stat label="Threads">{proc.threads}</Stat>
                <Stat label="Started">{relative(proc.started_at, now)}</Stat>
              </HStack>
            </VStack>
          ))}
        </Rows>
      ) : (
        <Table data={rows} columns={columns} idKey="pid" density="compact" dividers="rows" hasHover />
      )}
    </Band>
  );
}

export function NodeOverview() {
  const view = useSnapshot();
  const { nodeId = '' } = useParams();
  const [range] = useRange();
  const snap = view.snapshot;

  const cpu = useMetric(nodeId, 'cpu', range);
  const mem = useMetric(nodeId, 'mem', range);
  const load = useMetric(nodeId, 'load', range);
  const psiCpu = useMetric(nodeId, 'psi_cpu', range);
  const psiIo = useMetric(nodeId, 'psi_io', range);
  const diskR = useMetric(nodeId, 'disk_r', range);
  const diskW = useMetric(nodeId, 'disk_w', range);
  const netRx = useMetric(nodeId, 'net_rx', range);
  const netTx = useMetric(nodeId, 'net_tx', range);
  const hasContainers = (snap?.containers.length ?? 0) > 0;
  const history = useContainerHistory(hasContainers ? nodeId : '', range, []);

  const charts = useMemo(() => {
    const one = (label: string, points: SeriesPoint[], index: number): ChartSeries => ({ label, points, color: seriesColor(index) });
    const containers = [...(history.data?.containers ?? [])].sort((a, b) => peakOf(b.points, 'cpu') - peakOf(a.points, 'cpu')).slice(0, DOCKER_SERIES);
    return {
      cpu: [one('CPU', cpu.points, 0)],
      mem: [one('Memory', mem.points, 0)],
      load: [one('1 min', load.points, 0)],
      psi: [one('CPU', psiCpu.points, 0), one('I/O', psiIo.points, 2)],
      disk: [one('Read', diskR.points, 0), one('Write', diskW.points, 1)],
      net: [one('Received', netRx.points, 0), one('Sent', netTx.points, 1)],
      dockerCpu: historyChart(containers, 'cpu'),
      dockerMem: historyChart(containers, 'mem'),
      dockerCpuMax: percentCeiling(peakOf(containers.flatMap((entry) => entry.points), 'cpu')),
    };
  }, [cpu.points, mem.points, load.points, psiCpu.points, psiIo.points, diskR.points, diskW.points, netRx.points, netTx.points, history.data]);

  if (!snap) return <WaitingForSnapshot view={view} />;

  const offline = view.health.status === 'offline';
  const empty = emptyNote(view);
  const ifaces = snap.network.filter((iface) => iface.iface !== 'lo');
  const rxNow = ifaces.reduce((sum, iface) => sum + iface.rx_bps, 0);
  const txNow = ifaces.reduce((sum, iface) => sum + iface.tx_bps, 0);
  const readNow = snap.disks.reduce((sum, disk) => sum + disk.read_bps, 0);
  const writeNow = snap.disks.reduce((sum, disk) => sum + disk.write_bps, 0);
  const psiMax = percentCeiling(peak(psiCpu.points, psiIo.points));
  const temps = snap.sensors.filter((sensor) => sensor.kind === 'temperature').sort((a, b) => b.value - a.value);
  const gpus = snap.gpus ?? [];
  const containerCpu = snap.containers.reduce((sum, container) => sum + container.cpu_percent, 0);
  const containerMem = snap.containers.reduce((sum, container) => sum + container.mem_bytes, 0);
  const rootFull = view.health.days_to_full;
  const root = snap.disks.find((disk) => disk.mount === '/');
  const hottest = temps[0];
  const tone = (value: number | null | undefined) => (offline ? 'neutral' : levelOf(value));

  return (
    <>
      <KpiStrip>
        <KpiCell
          label="CPU"
          value={snap.cpu.percent}
          unit="%"
          digits={1}
          state={tone(snap.cpu.percent)}
          note={`load ${snap.cpu.load1.toFixed(2)}`}
        />
        <KpiCell
          label="Memory"
          value={snap.memory.used_percent}
          unit="%"
          digits={1}
          state={tone(snap.memory.used_percent)}
          note={`${size(snap.memory.used)} of ${size(snap.memory.total)}`}
        />
        <KpiCell
          label="Root disk"
          value={root ? root.used_pct : null}
          unit="%"
          digits={1}
          state={tone(root?.used_pct)}
          note={rootFull ? `full in ${days(rootFull)}` : `${snap.disks.length} ${snap.disks.length === 1 ? 'filesystem' : 'filesystems'}`}
        />
        <KpiCell
          label="Temperature"
          value={hottest ? Math.round(hottest.value) : null}
          unit="°C"
          state={hottest ? tone(hottest.value) : undefined}
          note={hottest ? hottest.label || hottest.chip : 'no sensor'}
        />
        <KpiCell
          label="Network"
          value={netRate(rxNow + txNow).split(' ')[0]}
          unit={netRate(rxNow + txNow).split(' ')[1]}
          note={`in ${netRate(rxNow)} · out ${netRate(txNow)}`}
        />
      </KpiStrip>

      <Band title="Activity" desc={`${rangeLabel(range)} · CPU, memory, load, pressure, disk and network`}>
        <Grid columns={CHART_GRID} gap={3}>
          <ChartCard
            title="CPU usage"
            desc={`Average across ${snap.node.cores} threads; the dashed line is the 80 % alert.`}
            now={percent(snap.cpu.percent, 1)}
            series={charts.cpu}
            unit="percent"
            threshold={80}
            pending={cpu.pending}
            empty={empty}
          />
          <ChartCard
            title="Memory usage"
            desc={`${size(snap.memory.used)} used of ${size(snap.memory.total)}; ${size(snap.memory.cached + snap.memory.buffers)} cache and buffers.`}
            now={percent(snap.memory.used_percent, 1)}
            series={charts.mem}
            unit="percent"
            pending={mem.pending}
            empty={empty}
          />
          <ChartCard
            title="Load average"
            desc={`Run-queue length; the dashed line is one task per thread (${snap.node.cores}).`}
            now={`${snap.cpu.load1.toFixed(2)} · ${snap.cpu.load5.toFixed(2)} · ${snap.cpu.load15.toFixed(2)}`}
            series={charts.load}
            unit="load"
            threshold={snap.node.cores || undefined}
            maxValue={Math.max(snap.node.cores || 1, peak(load.points)) * 1.1}
            pending={load.pending}
            empty={empty}
          />
          <ChartCard
            title="Pressure stall"
            desc="Share of time some task waited on the CPU or on I/O."
            now={percent(Math.max(snap.pressure.cpu.some, snap.pressure.io.some), 1)}
            series={charts.psi}
            unit="percent"
            maxValue={psiMax}
            legend={[percent(last(psiCpu.points) ?? snap.pressure.cpu.some, 1), percent(last(psiIo.points) ?? snap.pressure.io.some, 1)]}
            pending={psiCpu.pending || psiIo.pending}
            empty={empty}
          />
          <ChartCard
            title="Disk I/O"
            desc={`Throughput across ${snap.disks.length} mounted ${snap.disks.length === 1 ? 'filesystem' : 'filesystems'}.`}
            now={rate(readNow + writeNow)}
            series={charts.disk}
            unit="rate"
            legend={[rate(readNow), rate(writeNow)]}
            pending={diskR.pending || diskW.pending}
            empty={empty}
          />
          <ChartCard
            title="Bandwidth"
            desc={`All interfaces except loopback (${ifaces.length}).`}
            now={netRate(rxNow + txNow)}
            series={charts.net}
            unit="net"
            legend={[netRate(rxNow), netRate(txNow)]}
            pending={netRx.pending || netTx.pending}
            empty={empty}
          />
        </Grid>
      </Band>

      {hasContainers ? (
        <Band
          title="Containers"
          desc={`${snap.containers.length} running · ${rangeLabel(range)}`}
          actions={<Link href={`/nodes/${nodeId}/containers${range === '1h' ? '' : `?range=${range}`}`}>All containers</Link>}
        >
          <Grid columns={CHART_GRID} gap={3}>
            <ChartCard
              title="Docker CPU usage"
              desc={
                charts.dockerCpu.length === 1
                  ? 'The busiest container in this window.'
                  : `The ${Math.min(DOCKER_SERIES, charts.dockerCpu.length) || 'busiest'} busiest containers in this window.`
              }
              now={percent(containerCpu, 1)}
              series={charts.dockerCpu}
              unit="percent"
              maxValue={charts.dockerCpuMax}
              pending={history.isPending}
              empty={empty ?? 'No sample in this window yet. Container history is written once a minute.'}
            />
            <ChartCard
              title="Docker memory usage"
              desc={`Resident memory of the same containers; ${snap.containers.length} running in total.`}
              now={size(containerMem)}
              series={charts.dockerMem}
              unit="bytes"
              pending={history.isPending}
              empty={empty ?? 'No sample in this window yet. Container history is written once a minute.'}
            />
          </Grid>
        </Band>
      ) : null}

      <Band title="Disks and sensors" desc="Current readings from the last snapshot">
        <Grid columns={CHART_GRID} gap={3}>
          <Section
            title="Disk usage"
            desc={rootFull ? `Root fills in about ${days(rootFull)} at the current rate.` : 'Used space per mounted filesystem.'}
            actions={<Link href={`/nodes/${nodeId}/storage${range === '1h' ? '' : `?range=${range}`}`}>Storage</Link>}
          >
            {snap.disks.length === 0 ? (
              <Empty>No filesystem reported.</Empty>
            ) : (
              <Rows>{
                snap.disks.slice(0, 6).map((disk) => (
                  <MeterRow
                    key={disk.device + disk.mount}
                    name={disk.mount}
                    sub={`${size(disk.used)} of ${size(disk.total)} · ${disk.fstype}`}
                    meter={<Meter value={disk.used_pct} label={`${disk.mount} used`} />}
                  />
                ))}
              </Rows>
            )}
          </Section>
          <Section title="Temperatures" desc={gpus.length ? 'Hottest sensors and GPUs, current reading.' : 'Hottest sensors, current reading.'}>
            {temps.length === 0 && gpus.length === 0 ? (
              <Empty>This agent reports no temperature sensor.</Empty>
            ) : (
              <Rows>{[
                ...temps.slice(0, 5).map((sensor) => (
                  <MeterRow
                    key={`${sensor.chip}-${sensor.label}`}
                    name={sensor.label || sensor.chip}
                    sub={sensor.label ? sensor.chip : undefined}
                    meter={<Meter value={sensor.value} text={`${Math.round(sensor.value)} °C`} label={`${sensor.label || sensor.chip} temperature`} />}
                  />
                )),
                ...gpus.map((gpu) => (
                  <MeterRow
                    key={`gpu-${gpu.index}`}
                    name={`GPU ${gpu.index}`}
                    sub={gpu.name}
                    meter={<Meter value={gpu.util_percent} label={`GPU ${gpu.index} utilisation`} />}
                    figure={`${Math.round(gpu.temp_c)} °C`}
                  />
                )),
              ]}</Rows>
            )}
          </Section>
        </Grid>
      </Band>

      <TopProcesses view={view} nodeId={nodeId} />
    </>
  );
}
