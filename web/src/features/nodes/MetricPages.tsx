import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { SeriesChart } from '../../components/SeriesChart';
import { Empty } from '../../components/States';
import { Kv } from '../../components/Kv';
import { useSeries } from '../../data/queries';
import type { NodeView } from '../../data/types';
import { days, netRate, percent, rate, size } from '../../lib/format';
import { RangeControl } from './RangeControl';

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
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  const cores = snap.cpu.per_core;
  return (
    <>
      <Panel title="CPU" meta={<RangeControl value={range} onChange={setRange} />} flush>
        <div className="cpu-split">
          <div className="cpu-split-main">
            <SeriesChart points={series.data?.points ?? []} unit="percent" threshold={80} label="CPU utilisation" height={232} />
            <p className="cpu-note">Utilisation per interval; the dashed line is the 80% alert threshold.</p>
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
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  const top = [...snap.processes].sort((a, b) => b.rss_bytes - a.rss_bytes).slice(0, 6);
  return (
    <>
      <Panel title="Memory" meta={<RangeControl value={range} onChange={setRange} />} flush>
        <div className="cpu-split">
          <div className="cpu-split-main">
            <SeriesChart points={series.data?.points ?? []} unit="percent" label="Memory used" height={232} />
            <p className="cpu-note">Used percentage over the window.</p>
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
  const [range, setRange] = useState('24h');
  const [metric, setMetric] = useState<'disk_r' | 'disk_w'>('disk_r');
  const series = useSeries(nodeId, metric, range);
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  return (
    <>
      <Panel
        title="Disk throughput"
        meta={
          <>
            <div className="range" role="group" aria-label="Direction">
              <button type="button" className="range-btn" aria-pressed={metric === 'disk_r'} onClick={() => setMetric('disk_r')}>
                Read
              </button>
              <button type="button" className="range-btn" aria-pressed={metric === 'disk_w'} onClick={() => setMetric('disk_w')}>
                Write
              </button>
            </div>
            <RangeControl value={range} onChange={setRange} />
          </>
        }
        flush
      >
        <div className="cpu-split-main">
          <SeriesChart points={series.data?.points ?? []} unit="rate" label={`Disk ${metric === 'disk_r' ? 'read' : 'write'} throughput`} height={210} />
          <p className="cpu-note">Bytes per second, averaged per step. The dashed file-system fill prediction is in the table.</p>
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
  const [metric, setMetric] = useState<'net_rx' | 'net_tx'>('net_rx');
  const series = useSeries(nodeId, metric, range);
  if (!snap) return <Empty>Waiting for the first snapshot.</Empty>;
  const sum = (key: 'rx_bps' | 'tx_bps') =>
    snap.network.filter((iface) => iface.iface !== 'lo').reduce((total, iface) => total + iface[key], 0);
  return (
    <>
      <div className="kpi-row" data-count="3">
        <div className="kpi-cell">
          <div className="kpi-label">Receive</div>
          <div className="kpi-value">{netRate(sum('rx_bps'))}</div>
          <div className="kpi-sub">all interfaces, loopback excluded</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Transmit</div>
          <div className="kpi-value">{netRate(sum('tx_bps'))}</div>
          <div className="kpi-sub">all interfaces</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Connections</div>
          <div className="kpi-value">{snap.fd.conntrack || 0}</div>
          <div className="kpi-sub">conntrack entries</div>
        </div>
      </div>
      <Panel
        title="Throughput"
        meta={
          <>
            <div className="range" role="group" aria-label="Direction">
              <button type="button" className="range-btn" aria-pressed={metric === 'net_rx'} onClick={() => setMetric('net_rx')}>
                In
              </button>
              <button type="button" className="range-btn" aria-pressed={metric === 'net_tx'} onClick={() => setMetric('net_tx')}>
                Out
              </button>
            </div>
            <RangeControl value={range} onChange={setRange} />
          </>
        }
        flush
      >
        <div className="cpu-split-main">
          <SeriesChart points={series.data?.points ?? []} unit="net" label="Network throughput" height={210} />
          <p className="cpu-note">Bits per second across interfaces get summed by the hub's sample.</p>
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
      </Panel>
    </>
  );
}
