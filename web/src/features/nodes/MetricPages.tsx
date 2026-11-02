import { Fig } from '../../components/Fig';
import { useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { SeriesChart, type ChartSeries } from '../../components/SeriesChart';
import { Empty } from '../../components/States';
import { Kv } from '../../components/Kv';
import { useSeries } from '../../data/queries';
import type { NodeView, SeriesPoint } from '../../data/types';
import { seriesColor } from '../../lib/chart';
import { days, netRate, percent, rate, size } from '../../lib/format';
import { RangeControl } from './RangeControl';

/** "Loading a window" is one quiet line; the chart frame never collapses. */
const NO_WINDOW = 'No sample in this window yet.';

function windowNote(pending: boolean, points: SeriesPoint[], empty: string, filled: string): string {
  if (pending && points.length === 0) return 'Loading this window from the hub…';
  if (points.length === 0) return empty;
  return filled;
}

function useSnapshot() {
  const view = useOutletContext<NodeView>();
  return view;
}

export function CpuPage() {
  const view = useSnapshot();
  const { nodeId = '' } = useParams();
  const snap = view.snapshot;
  const [range, setRange] = useState('1h');
  const series = useSeries(nodeId, 'cpu', range);
  const pressure = useSeries(nodeId, 'psi_cpu', range);
  const points = useMemo(() => series.data?.points ?? [], [series.data]);
  const pressurePoints = useMemo(() => pressure.data?.points ?? [], [pressure.data]);
  const chart = useMemo<ChartSeries[]>(
    () => [
      { label: 'Utilisation', points, color: seriesColor(0) },
      { label: 'Pressure', points: pressurePoints, color: seriesColor(1) },
    ],
    [points, pressurePoints],
  );
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  const cores = snap.cpu.per_core;
  return (
    <>
      <Panel title="CPU" meta={<RangeControl value={range} onChange={setRange} />} flush>
        <div className="cpu-split">
          <div className="cpu-split-main">
            <SeriesChart series={chart} unit="percent" threshold={80} label="CPU utilisation and pressure" height={232} />
            <p className="cpu-note">
              <span className="legend-inline">
                <span className="legend-swatch" style={{ background: seriesColor(0) }} aria-hidden="true" />
                Utilisation
              </span>
              <span className="legend-inline">
                <span className="legend-swatch" style={{ background: seriesColor(1) }} aria-hidden="true" />
                Pressure
              </span>
              {' · '}
              {windowNote(
                series.isPending || pressure.isPending,
                points,
                NO_WINDOW,
                'Time tasks waited on the CPU; the dashed line is the 80% alert threshold.',
              )}
            </p>
          </div>
          <div className="cpu-split-side">
            <h3 className="split-title">Breakdown</h3>
            <Kv
              rows={[
                { label: 'User', value: percent(snap.cpu.user, 1) },
                { label: 'System', value: percent(snap.cpu.system, 1) },
                { label: 'Iowait', value: percent(snap.cpu.iowait, 1) },
                { label: 'Steal', value: percent(snap.cpu.steal, 1) },
                { label: 'Load 1 / 5 / 15', value: `${snap.cpu.load1.toFixed(2)} / ${snap.cpu.load5.toFixed(2)} / ${snap.cpu.load15.toFixed(2)}` },
                { label: 'Processes', value: String(snap.cpu.procs) },
                { label: 'CPU pressure', value: percent(snap.pressure.cpu.some, 1) },
              ]}
            />
          </div>
        </div>
      </Panel>
      <Panel title="Per core" meta={`${cores.length} cores · ${snap.node.cpu_model || 'unknown model'}`} flush>
        {cores.length === 0 ? (
          <Empty>This agent did not report per-core usage.</Empty>
        ) : (
          <div className="bar-list">
            {cores.map((value, index) => (
              <div className="bar-row" key={index}>
                <span className="bar-label fig">core {index}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
                </span>
                <span className="bar-value fig">{percent(value)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

export function MemoryPage() {
  const view = useSnapshot();
  const { nodeId = '' } = useParams();
  const snap = view.snapshot;
  const [range, setRange] = useState('1h');
  const series = useSeries(nodeId, 'mem', range);
  const points = useMemo(() => series.data?.points ?? [], [series.data]);
  const chart = useMemo<ChartSeries[]>(
    () => [{ label: 'Memory', points, color: seriesColor(1) }],
    [points],
  );
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  const top = [...snap.processes].sort((a, b) => b.rss_bytes - a.rss_bytes).slice(0, 6);
  return (
    <>
      <Panel title="Memory" meta={<RangeControl value={range} onChange={setRange} />} flush>
        <div className="cpu-split">
          <div className="cpu-split-main">
            <SeriesChart series={chart} unit="percent" label="Memory used" height={232} />
            <p className="cpu-note">{windowNote(series.isPending, points, NO_WINDOW, 'Used percentage over the window.')}</p>
          </div>
          <div className="cpu-split-side">
            <h3 className="split-title">Breakdown</h3>
            <Kv
              rows={[
                { label: 'Total', value: size(snap.memory.total) },
                { label: 'Used', value: size(snap.memory.used) },
                { label: 'Available', value: size(snap.memory.available) },
                { label: 'Cached', value: size(snap.memory.cached) },
                { label: 'Buffers', value: size(snap.memory.buffers) },
                { label: 'Swap used', value: `${size(snap.memory.swap_used)} of ${size(snap.memory.swap_total)}` },
                { label: 'Memory pressure', value: percent(snap.pressure.mem.some, 1) },
              ]}
            />
          </div>
        </div>
      </Panel>
      <Panel title="Largest residents" meta={`${top.length} of ${snap.processes.length} shown`} flush>
        <Table label="Largest resident processes">
          <THead>
            <Th>Process</Th>
            <Th num>PID</Th>
            <Th>User</Th>
            <Th num>Memory</Th>
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
                <Td num cell="key">
                  {size(proc.rss_bytes)}
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
  const snap = view.snapshot;
  const [range, setRange] = useState('1h');
  const read = useSeries(nodeId, 'disk_r', range);
  const write = useSeries(nodeId, 'disk_w', range);
  const points = useMemo(() => read.data?.points ?? [], [read.data]);
  const chart = useMemo<ChartSeries[]>(
    () => [
      { label: 'Read', points, color: seriesColor(0) },
      { label: 'Write', points: write.data?.points ?? [], color: seriesColor(1) },
    ],
    [points, write.data],
  );
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  return (
    <>
      <Panel title="Disk throughput" meta={<RangeControl value={range} onChange={setRange} />} flush>
        <div className="cpu-split-main">
          <SeriesChart series={chart} unit="rate" label="Disk read and write throughput" height={210} />
          <p className="cpu-note">
            <span className="legend-inline">
              <span className="legend-swatch" style={{ background: seriesColor(0) }} aria-hidden="true" />
              Read
            </span>
            <span className="legend-inline">
              <span className="legend-swatch" style={{ background: seriesColor(1) }} aria-hidden="true" />
              Write
            </span>
            {' · '}
            {windowNote(
              read.isPending || write.isPending,
              points,
              NO_WINDOW,
              'Bytes per second across the sampled block devices. Mounted usage, inodes and fill prediction are in the table below.',
            )}
          </p>
        </div>
      </Panel>
      <Panel title="Filesystems" meta={`${snap.disks.length} mounted`} flush>
        <Table label="Filesystems">
          <THead>
            <Th>Mount</Th>
            <Th>Device</Th>
            <Th>FS</Th>
            <Th num>Used</Th>
            <Th num>Inodes</Th>
            <Th num>Read</Th>
            <Th num>Write</Th>
            <Th num>Full in</Th>
          </THead>
          <TBody>
            {snap.disks.map((disk) => (
              <tr key={disk.device}>
                <Td cell="primary">
                  <span className="row-name">{disk.mount}</span>
                </Td>
                <Td cell="field" label="Device">
                  {disk.device}
                </Td>
                <Td cell="field" label="FS">
                  {disk.fstype}
                </Td>
                <Td num cell="key">
                  {percent(disk.used_pct)}
                  <span className="cell-sub">
                    {size(disk.used)} of {size(disk.total)}
                  </span>
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
    </>
  );
}

export function NetworkPage() {
  const view = useSnapshot();
  const { nodeId = '' } = useParams();
  const snap = view.snapshot;
  const [range, setRange] = useState('1h');
  const rx = useSeries(nodeId, 'net_rx', range);
  const tx = useSeries(nodeId, 'net_tx', range);
  const points = useMemo(() => rx.data?.points ?? [], [rx.data]);
  const chart = useMemo<ChartSeries[]>(
    () => [
      { label: 'In', points, color: seriesColor(0) },
      { label: 'Out', points: tx.data?.points ?? [], color: seriesColor(1) },
    ],
    [points, tx.data],
  );
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  const sum = (key: 'rx_bps' | 'tx_bps') =>
    snap.network.filter((iface) => iface.iface !== 'lo').reduce((total, iface) => total + iface[key], 0);
  return (
    <>
      <div className="kpi-row" data-count="3">
        <div className="kpi-cell">
          <div className="kpi-label">Receive</div>
          <div className="kpi-value"><Fig>{netRate(sum('rx_bps'))}</Fig></div>
          <div className="kpi-sub">all interfaces, loopback excluded</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Transmit</div>
          <div className="kpi-value"><Fig>{netRate(sum('tx_bps'))}</Fig></div>
          <div className="kpi-sub">all interfaces</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Connections</div>
          <div className="kpi-value"><Fig>{snap.fd.conntrack || 0}</Fig></div>
          <div className="kpi-sub">conntrack entries</div>
        </div>
      </div>
      <Panel title="Throughput" meta={<RangeControl value={range} onChange={setRange} />} flush>
        <div className="cpu-split-main">
          <SeriesChart series={chart} unit="net" label="Network throughput" height={210} />
          <p className="cpu-note">
            <span className="legend-inline">
              <span className="legend-swatch" style={{ background: seriesColor(0) }} aria-hidden="true" />
              In
            </span>
            <span className="legend-inline">
              <span className="legend-swatch" style={{ background: seriesColor(1) }} aria-hidden="true" />
              Out
            </span>
            {' · '}
            {windowNote(
              rx.isPending || tx.isPending,
              points,
              NO_WINDOW,
              'Bits per second, summed over the interfaces the hub sampled.',
            )}
          </p>
        </div>
      </Panel>
      <Panel title="Interfaces" meta={`${snap.network.length} interfaces`} flush>
        <Table label="Interfaces">
          <THead>
            <Th>Interface</Th>
            <Th>State</Th>
            <Th num>Speed</Th>
            <Th num>In</Th>
            <Th num>Out</Th>
            <Th num>Errors</Th>
            <Th num>Drops</Th>
            <Th>Driver</Th>
          </THead>
          <TBody>
            {snap.network.map((iface) => (
              <tr key={iface.iface}>
                <Td cell="primary">
                  <span className="row-name">{iface.iface}</span>
                </Td>
                <Td cell="field" label="State">
                  {iface.up ? 'up' : 'down'}
                </Td>
                <Td num cell="field" label="Speed">
                  {iface.speed_mbps ? `${iface.speed_mbps} Mbit/s` : '—'}
                </Td>
                <Td num cell="key">
                  {netRate(iface.rx_bps)}
                </Td>
                <Td num cell="field" label="Out">
                  {netRate(iface.tx_bps)}
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
        <div className="panel-foot">
          <span className="note">
            Live rates from the latest snapshot. The hub answers history for CPU, memory, load and pressure only, so this page has no
            throughput curve until the series route serves the net_rx and net_tx columns the store already keeps.
          </span>
        </div>
      </Panel>
    </>
  );
}
