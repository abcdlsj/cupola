import { useMemo } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { ChartCard } from '../../components/ChartCard';
import { Panel } from '../../components/Panel';
import { Meter } from '../../components/Meter';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import type { ChartSeries } from '../../components/SeriesChart';
import { Empty } from '../../components/States';
import { Kv } from '../../components/Kv';
import { useSeries } from '../../data/queries';
import type { NodeView, SeriesPoint } from '../../data/types';
import { seriesColor } from '../../lib/chart';
import { days, netRate, percent, rate, size } from '../../lib/format';
import { percentCeiling } from './NodeLists';
import { useRange } from './RangeControl';

function useSnapshot() {
  return useOutletContext<NodeView>();
}

function useMetric(nodeId: string, metric: string, range: string) {
  const query = useSeries(nodeId, metric, range);
  const points = useMemo(() => query.data?.points ?? [], [query.data]);
  return { points, pending: query.isPending };
}

function peak(...lists: SeriesPoint[][]): number {
  let max = 0;
  for (const list of lists) for (const point of list) if (point.max > max) max = point.max;
  return max;
}

function WaitingForSnapshot() {
  return (
    <Panel title="Waiting for data">
      <Empty>The hub has no snapshot for this system yet. The first poll runs within a few seconds.</Empty>
    </Panel>
  );
}

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
  if (!snap) return <WaitingForSnapshot />;
  const cores = snap.cpu.per_core;
  return (
    <>
      <div className="chart-grid chart-grid-wide">
        <ChartCard
          title="CPU utilisation and pressure"
          desc="Pressure is the share of time runnable tasks waited for a CPU; the dashed line is the 80 % alert."
          now={percent(snap.cpu.percent, 1)}
          series={chart}
          unit="percent"
          threshold={80}
          legend={[percent(snap.cpu.percent, 1), percent(snap.pressure.cpu.some, 1)]}
          pending={cpu.pending || pressure.pending}
          height={220}
        />
        <Panel title="Breakdown" desc="Where the CPU time went in the last sample.">
          <Kv
            rows={[
              { label: 'User', value: percent(snap.cpu.user, 1) },
              { label: 'System', value: percent(snap.cpu.system, 1) },
              { label: 'I/O wait', value: percent(snap.cpu.iowait, 1) },
              { label: 'Steal', value: percent(snap.cpu.steal, 1) },
              { label: 'Load 1 / 5 / 15', value: `${snap.cpu.load1.toFixed(2)} / ${snap.cpu.load5.toFixed(2)} / ${snap.cpu.load15.toFixed(2)}` },
              { label: 'Processes', value: String(snap.cpu.procs) },
              { label: 'Clock', value: snap.cpu.mhz ? `${(snap.cpu.mhz / 1000).toFixed(2)} GHz` : '—' },
            ]}
          />
        </Panel>
      </div>
      <Panel title="Per core" desc={`${cores.length} threads · ${snap.node.cpu_model || 'unknown model'}`}>
        {cores.length === 0 ? (
          <p className="note">This agent did not report per-core usage.</p>
        ) : (
          <ul className="core-grid">
            {cores.map((value, index) => (
              <li className="core-row" key={index}>
                <span className="core-label fig">{index}</span>
                <Meter value={value} label={`Thread ${index}`} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

export function MemoryPage() {
  const view = useSnapshot();
  const { nodeId = '' } = useParams();
  const [range] = useRange();
  const snap = view.snapshot;
  const mem = useMetric(nodeId, 'mem', range);
  const chart = useMemo<ChartSeries[]>(() => [{ label: 'Memory', points: mem.points, color: seriesColor(0) }], [mem.points]);
  if (!snap) return <WaitingForSnapshot />;
  const top = [...snap.processes].sort((a, b) => b.rss_bytes - a.rss_bytes).slice(0, 8);
  const swapPct = snap.memory.swap_total ? (snap.memory.swap_used / snap.memory.swap_total) * 100 : null;
  return (
    <>
      <div className="chart-grid chart-grid-wide">
        <ChartCard
          title="Memory usage"
          desc={`Used share of ${size(snap.memory.total)} over the window.`}
          now={percent(snap.memory.used_percent, 1)}
          series={chart}
          unit="percent"
          pending={mem.pending}
          height={220}
        />
        <Panel title="Breakdown" desc="The last sample.">
          <Kv
            rows={[
              { label: 'Total', value: size(snap.memory.total) },
              { label: 'Used', value: size(snap.memory.used) },
              { label: 'Available', value: size(snap.memory.available) },
              { label: 'Cached', value: size(snap.memory.cached) },
              { label: 'Buffers', value: size(snap.memory.buffers) },
              { label: 'Swap', value: snap.memory.swap_total ? `${size(snap.memory.swap_used)} of ${size(snap.memory.swap_total)}` : 'none' },
              { label: 'Pressure', value: percent(snap.pressure.mem.some, 1) },
            ]}
          />
          {swapPct != null ? (
            <div className="breakdown-meter">
              <span className="quiet">Swap used</span>
              <Meter value={swapPct} label="Swap used" />
            </div>
          ) : null}
        </Panel>
      </div>
      <Panel title="Largest residents" desc={`${top.length} of ${snap.processes.length} sampled processes, by resident memory.`} flush>
        <Table label="Largest resident processes">
          <THead>
            <Th>Process</Th>
            <Th num>PID</Th>
            <Th>User</Th>
            <Th>Memory</Th>
            <Th num>CPU</Th>
          </THead>
          <TBody>
            {top.map((proc) => (
              <tr key={proc.pid}>
                <Td cell="primary">
                  <span className="row-name">{proc.name}</span>
                </Td>
                <Td num cell="field" label="PID">
                  {proc.pid}
                </Td>
                <Td cell="field" label="User">
                  {proc.user}
                </Td>
                <Td cell="key" className="meter-cell">
                  <Meter
                    value={snap.memory.total ? (proc.rss_bytes / snap.memory.total) * 100 : null}
                    text={size(proc.rss_bytes)}
                    tone="neutral"
                    label={`${proc.name} resident memory, bar is its share of ${size(snap.memory.total)}`}
                  />
                </Td>
                <Td num cell="field" label="CPU">
                  {percent(proc.cpu_percent, 1)}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </>
  );
}

export function StoragePage() {
  const view = useSnapshot();
  const { nodeId = '' } = useParams();
  const [range] = useRange();
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
  if (!snap) return <WaitingForSnapshot />;
  const readNow = snap.disks.reduce((sum, disk) => sum + disk.read_bps, 0);
  const writeNow = snap.disks.reduce((sum, disk) => sum + disk.write_bps, 0);
  return (
    <>
      <div className="chart-grid">
        <ChartCard
          title="Disk I/O"
          desc="Bytes per second across the sampled block devices."
          now={rate(readNow + writeNow)}
          series={chart}
          unit="rate"
          legend={[rate(readNow), rate(writeNow)]}
          pending={read.pending || write.pending}
        />
        <ChartCard
          title="I/O pressure"
          desc="Share of time some task waited on storage."
          now={percent(snap.pressure.io.some, 1)}
          series={pressure}
          unit="percent"
          maxValue={percentCeiling(peak(io.points))}
          pending={io.pending}
        />
      </div>
      <Panel title="Filesystems" desc={`${snap.disks.length} mounted. Fill prediction covers the root filesystem.`} flush>
        <Table label="Filesystems">
          <THead>
            <Th>Mount</Th>
            <Th>Device</Th>
            <Th>Used</Th>
            <Th num>Size</Th>
            <Th num>Inodes</Th>
            <Th num>Read</Th>
            <Th num>Write</Th>
            <Th num>Full in</Th>
          </THead>
          <TBody>
            {snap.disks.map((disk) => (
              <tr key={disk.device + disk.mount}>
                <Td cell="primary">
                  <span className="row-name">{disk.mount}</span>
                  <span className="cell-sub">{disk.fstype}{disk.read_only ? ' · read-only' : ''}</span>
                </Td>
                <Td cell="field" label="Device">
                  <span className="fig">{disk.device}</span>
                </Td>
                <Td cell="key" className="meter-cell">
                  <Meter value={disk.used_pct} label={`${disk.mount} used`} />
                </Td>
                <Td num cell="field" label="Size">
                  {size(disk.used)} of {size(disk.total)}
                </Td>
                <Td num cell="field" label="Inodes">
                  {percent(disk.inode_pct)}
                </Td>
                <Td num cell="field" label="Read">
                  {rate(disk.read_bps)}
                </Td>
                <Td num cell="field" label="Write">
                  {rate(disk.write_bps)}
                </Td>
                <Td num cell="field" label="Full in">
                  {disk.mount === '/' && view.health.days_to_full ? days(view.health.days_to_full) : '—'}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Panel>
      {snap.smart.length > 0 ? (
        <Panel title="Drive health" desc="SMART and NVMe self-reports." flush>
          <Table label="Drive health">
            <THead>
              <Th>Device</Th>
              <Th>Health</Th>
              <Th>Wear</Th>
              <Th num>Temp</Th>
              <Th num>Power-on</Th>
              <Th num>Reallocated</Th>
            </THead>
            <TBody>
              {snap.smart.map((drive) => (
                <tr key={drive.device}>
                  <Td cell="primary">
                    <span className="row-name">{drive.device}</span>
                    <span className="cell-sub">{drive.model || drive.type}</span>
                  </Td>
                  <Td cell="key">
                    <span className="status" data-tone={drive.error ? 'neutral' : /pass|ok/i.test(drive.health) ? 'positive' : 'negative'}>
                      <span className="status-dot" data-tone={drive.error ? 'neutral' : /pass|ok/i.test(drive.health) ? 'positive' : 'negative'} aria-hidden="true" />
                      {drive.error ? 'unreadable' : drive.health || '—'}
                    </span>
                  </Td>
                  <Td cell="field" label="Wear" className="meter-cell">
                    <Meter value={drive.wear_percent} label={`${drive.device} wear`} />
                  </Td>
                  <Td num cell="field" label="Temp">
                    {drive.temperature_c ? `${Math.round(drive.temperature_c)} °C` : '—'}
                  </Td>
                  <Td num cell="field" label="Power-on">
                    {drive.power_on_hours ? `${drive.power_on_hours} h` : '—'}
                  </Td>
                  <Td num cell="field" label="Reallocated">
                    {drive.reallocated}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Panel>
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
  if (!snap) return <WaitingForSnapshot />;
  const ifaces = snap.network.filter((iface) => iface.iface !== 'lo');
  const sum = (key: 'rx_bps' | 'tx_bps') => ifaces.reduce((total, iface) => total + iface[key], 0);
  return (
    <>
      <div className="chart-grid chart-grid-wide">
        <ChartCard
          title="Bandwidth"
          desc={`Bits per second over ${ifaces.length} ${ifaces.length === 1 ? 'interface' : 'interfaces'}, loopback excluded.`}
          now={netRate(sum('rx_bps') + sum('tx_bps'))}
          series={chart}
          unit="net"
          legend={[netRate(sum('rx_bps')), netRate(sum('tx_bps'))]}
          pending={rx.pending || tx.pending}
          height={220}
        />
        <Panel title="Connections" desc="Kernel tables in the last sample.">
          <Kv
            rows={[
              { label: 'Conntrack entries', value: String(snap.fd.conntrack || 0) },
              { label: 'Open files', value: `${snap.fd.allocated} of ${snap.fd.max}` },
              { label: 'Listening ports', value: String(snap.ports.length) },
              { label: 'Interfaces up', value: `${snap.network.filter((iface) => iface.up).length} of ${snap.network.length}` },
            ]}
          />
        </Panel>
      </div>
      <Panel title="Interfaces" desc="Live rates from the latest snapshot." flush>
        <Table label="Interfaces">
          <THead>
            <Th>Interface</Th>
            <Th num>In</Th>
            <Th num>Out</Th>
            <Th num>Speed</Th>
            <Th num>Errors</Th>
            <Th num>Drops</Th>
            <Th>Driver</Th>
          </THead>
          <TBody>
            {snap.network.map((iface) => (
              <tr key={iface.iface}>
                <Td cell="primary">
                  <span className="row-name">
                    <span className="status-dot" data-tone={iface.up ? 'positive' : 'neutral'} role="img" aria-label={iface.up ? 'up' : 'down'} />
                    {iface.iface}
                  </span>
                </Td>
                <Td num cell="key">
                  {netRate(iface.rx_bps)}
                </Td>
                <Td num cell="field" label="Out">
                  {netRate(iface.tx_bps)}
                </Td>
                <Td num cell="field" label="Speed">
                  {iface.speed_mbps ? `${iface.speed_mbps} Mbit/s` : '—'}
                </Td>
                <Td num cell="field" label="Errors">
                  {iface.rx_errors + iface.tx_errors}
                </Td>
                <Td num cell="field" label="Drops">
                  {iface.rx_drops + iface.tx_drops}
                </Td>
                <Td cell="field" label="Driver">
                  {iface.driver || '—'}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </>
  );
}
