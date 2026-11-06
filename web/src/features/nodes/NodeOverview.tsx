import { useMemo } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ChartCard } from '../../components/ChartCard';
import { Panel } from '../../components/Panel';
import { Fig } from '../../components/Fig';
import { Meter } from '../../components/Meter';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import type { ChartSeries } from '../../components/SeriesChart';
import { Empty } from '../../components/States';
import { useContainerHistory, useSeries } from '../../data/queries';
import type { NodeView, SeriesPoint } from '../../data/types';
import { seriesColor } from '../../lib/chart';
import { days, netRate, percent, rate, relative, size } from '../../lib/format';
import { historyChart, peakOf, percentCeiling } from './NodeLists';
import { useRange } from './RangeControl';

const DOCKER_SERIES = 4;

function last(points: SeriesPoint[] | undefined): number | null {
  return points && points.length ? points[points.length - 1].avg : null;
}

function peak(...lists: Array<SeriesPoint[] | undefined>): number {
  let max = 0;
  for (const list of lists) for (const point of list ?? []) if (point.max > max) max = point.max;
  return max;
}

/** One history series for this node and window. */
function useMetric(nodeId: string, metric: string, range: string) {
  const query = useSeries(nodeId, metric, range);
  const points = useMemo(() => query.data?.points ?? [], [query.data]);
  return { points, pending: query.isPending };
}

export function NodeOverview() {
  const view = useOutletContext<NodeView>();
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

  if (!snap) {
    return (
      <Panel title="Waiting for data">
        <Empty>The hub has no snapshot for this system yet. The first poll runs within a few seconds.</Empty>
      </Panel>
    );
  }

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

  return (
    <>
      <div className="chart-grid">
        <ChartCard
          title="CPU usage"
          desc={`Average across ${snap.node.cores} threads; the dashed line is the 80 % alert.`}
          now={percent(snap.cpu.percent, 1)}
          series={charts.cpu}
          unit="percent"
          threshold={80}
          pending={cpu.pending}
        />
        <ChartCard
          title="Memory usage"
          desc={`${size(snap.memory.used)} used of ${size(snap.memory.total)}; ${size(snap.memory.cached + snap.memory.buffers)} cache and buffers.`}
          now={percent(snap.memory.used_percent, 1)}
          series={charts.mem}
          unit="percent"
          pending={mem.pending}
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
        />
        <ChartCard
          title="Disk I/O"
          desc={`Throughput across ${snap.disks.length} mounted ${snap.disks.length === 1 ? 'filesystem' : 'filesystems'}.`}
          now={rate(readNow + writeNow)}
          series={charts.disk}
          unit="rate"
          legend={[rate(readNow), rate(writeNow)]}
          pending={diskR.pending || diskW.pending}
        />
        <ChartCard
          title="Bandwidth"
          desc={`All interfaces except loopback (${ifaces.length}).`}
          now={netRate(rxNow + txNow)}
          series={charts.net}
          unit="net"
          legend={[netRate(rxNow), netRate(txNow)]}
          pending={netRx.pending || netTx.pending}
        />
        {hasContainers ? (
          <>
            <ChartCard
              title="Docker CPU usage"
              desc={`The ${Math.min(DOCKER_SERIES, charts.dockerCpu.length) || 'busiest'} busiest containers in this window.`}
              now={percent(containerCpu, 1)}
              series={charts.dockerCpu}
              unit="percent"
              maxValue={charts.dockerCpuMax}
              pending={history.isPending}
              empty="No sample in this window yet. Container history is written once a minute."
            />
            <ChartCard
              title="Docker memory usage"
              desc={`Resident memory of the same containers; ${snap.containers.length} running in total.`}
              now={size(containerMem)}
              series={charts.dockerMem}
              unit="bytes"
              pending={history.isPending}
              empty="No sample in this window yet. Container history is written once a minute."
            />
          </>
        ) : null}

        <Panel
          title="Disk usage"
          desc={rootFull ? `Root fills in about ${days(rootFull)} at the current rate.` : 'Used space per mounted filesystem.'}
          meta={
            <Link className="text-link" to={`/nodes/${nodeId}/storage`}>
              Storage
            </Link>
          }
        >
          {snap.disks.length === 0 ? (
            <p className="note">No filesystem reported.</p>
          ) : (
            <ul className="meter-list">
              {snap.disks.slice(0, 6).map((disk) => (
                <li className="meter-list-row" key={disk.device + disk.mount}>
                  <span className="meter-list-name" title={`${disk.device} · ${disk.fstype}`}>
                    {disk.mount}
                  </span>
                  <Meter value={disk.used_pct} label={`${disk.mount} used`} />
                  <span className="meter-list-figure">
                    <Fig>
                      {size(disk.used)} of {size(disk.total)}
                    </Fig>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Temperatures" desc={gpus.length ? 'Hottest sensors and GPUs, current reading.' : 'Hottest sensors, current reading.'}>
          {temps.length === 0 && gpus.length === 0 ? (
            <p className="note">This agent reports no temperature sensor.</p>
          ) : (
            <ul className="meter-list">
              {temps.slice(0, 5).map((sensor) => (
                <li className="meter-list-row" key={`${sensor.chip}-${sensor.label}`}>
                  <span className="meter-list-name" title={sensor.chip}>
                    {sensor.label || sensor.chip}
                  </span>
                  <span className="meter" data-level={sensor.value >= 90 ? 'crit' : sensor.value >= 75 ? 'warn' : 'ok'}>
                    <span className="meter-value">{Math.round(sensor.value)} °C</span>
                    <span className="meter-track" aria-hidden="true">
                      <span className="meter-fill" style={{ width: `${Math.min(100, Math.max(0, sensor.value))}%` }} />
                    </span>
                  </span>
                  <span className="meter-list-figure">{sensor.chip}</span>
                </li>
              ))}
              {gpus.map((gpu) => (
                <li className="meter-list-row" key={`gpu-${gpu.index}`}>
                  <span className="meter-list-name" title={gpu.name}>
                    GPU {gpu.index}
                  </span>
                  <Meter value={gpu.util_percent} label={`GPU ${gpu.index} utilisation`} />
                  <span className="meter-list-figure">
                    <Fig>{`${Math.round(gpu.temp_c)} °C`}</Fig>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Top processes"
        desc="By CPU in the last snapshot; arguments are redacted."
        meta={
          <Link className="text-link" to={`/nodes/${nodeId}/processes`}>
            All {snap.cpu.procs || snap.processes.length}
          </Link>
        }
        flush
      >
        {snap.processes.length === 0 ? (
          <Empty>No process sample in the last snapshot.</Empty>
        ) : (
          <Table label="Top processes">
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
              {[...snap.processes]
                .sort((a, b) => b.cpu_percent - a.cpu_percent)
                .slice(0, 8)
                .map((proc) => (
                  <tr key={proc.pid}>
                    <Td cell="primary">
                      <Link className="row-name" to={`/nodes/${nodeId}/processes/${proc.pid}`}>
                        {proc.name}
                      </Link>
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
    </>
  );
}
