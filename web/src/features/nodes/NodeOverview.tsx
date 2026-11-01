import { useMemo, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { SeriesChart, type ChartSeries } from '../../components/SeriesChart';
import { Empty } from '../../components/States';
import { useSeries } from '../../data/queries';
import type { NodeView } from '../../data/types';
import { seriesColor } from '../../lib/chart';
import { days, netRate, percent, rate, relative, size, uptime } from '../../lib/format';
import { RangeControl } from './RangeControl';

export function NodeOverview() {
  const view = useOutletContext<NodeView>();
  const { nodeId = '' } = useParams();
  const snap = view.snapshot;
  const [range, setRange] = useState('1h');
  const series = useSeries(nodeId, 'cpu', range);
  const points = useMemo(() => series.data?.points ?? [], [series.data]);
  const chart = useMemo<ChartSeries[]>(() => [{ label: 'CPU', points, color: seriesColor(0) }], [points]);
  const peak = useMemo(() => {
    const data = series.data?.points ?? [];
    return data.length ? data.reduce((a, b) => (b.max > a.max ? b : a)) : null;
  }, [series.data]);
  const rootDisk = snap?.disks.find((disk) => disk.mount === '/') ?? snap?.disks[0];
  const netRx = snap?.network.filter((iface) => iface.iface !== 'lo').reduce((sum, iface) => sum + iface.rx_bps, 0) ?? 0;
  const netTx = snap?.network.filter((iface) => iface.iface !== 'lo').reduce((sum, iface) => sum + iface.tx_bps, 0) ?? 0;

  if (!snap) {
    return (
      <Panel title="Snapshot">
        <Empty>The hub has no snapshot for this node yet. The first poll runs within a few seconds.</Empty>
      </Panel>
    );
  }

  const sensors = [
    ...snap.sensors.filter((sensor) => sensor.kind === 'temperature').map((sensor) => ({ label: sensor.label, value: `${sensor.value.toFixed(0)} ${sensor.unit}` })),
    { label: 'Pressure CPU', value: percent(snap.pressure.cpu.some, 1) },
    { label: 'Pressure memory', value: percent(snap.pressure.mem.some, 1) },
    { label: 'Pressure I/O', value: percent(snap.pressure.io.some, 1) },
    { label: 'Swap used', value: `${size(snap.memory.swap_used)} of ${size(snap.memory.swap_total)}` },
  ];

  return (
    <>
      <div className="kpi-row" data-count="5">
        <div className="kpi-cell">
          <div className="kpi-label">CPU</div>
          <div className="kpi-value">{percent(snap.cpu.percent)}</div>
          <div className="kpi-sub">
            load {snap.cpu.load1.toFixed(2)} · {snap.node.cores} cores
          </div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Memory</div>
          <div className="kpi-value">{size(snap.memory.used)}</div>
          <div className="kpi-sub">
            of {size(snap.memory.total)} · {percent(snap.memory.used_percent)}
          </div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Root disk</div>
          <div className="kpi-value">{rootDisk ? percent(rootDisk.used_pct) : '—'}</div>
          <div className="kpi-sub">
            {rootDisk ? `${size(rootDisk.used)} of ${size(rootDisk.total)}` : 'no disk mounted'}
          </div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Network</div>
          <div className="kpi-value">{netRate(netRx)}</div>
          <div className="kpi-sub">rx · {netRate(netTx)} tx</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Uptime</div>
          <div className="kpi-value">{uptime(snap.node.uptime_sec)}</div>
          <div className="kpi-sub">
            {view.health.days_to_full ? `root full in ${days(view.health.days_to_full)}` : 'no disk growth trend'}
          </div>
        </div>
      </div>

      <Panel title="CPU" meta={<RangeControl value={range} onChange={setRange} />} flush>
        <div className="cpu-split">
          <div className="cpu-split-main">
            {points.length > 0 ? (
              <SeriesChart series={chart} unit="percent" threshold={80} label={`CPU on ${view.node.name}`} height={232} />
            ) : (
              <Empty>
                {series.isPending
                  ? 'Loading this window from the hub…'
                  : 'No sample in this window. The hub reads live samples for 1 h; longer windows need rollups it has not built yet.'}
              </Empty>
            )}
            <p className="cpu-note">
              {peak && series.data
                ? `Peak ${percent(peak.max, 1)} · window ${series.data.range} · step ${series.data.step_sec}s`
                : 'Waiting for the first samples.'}
            </p>
          </div>
          <div className="cpu-split-side">
            <h3 className="split-title">Sensors and pressure</h3>
            <dl className="kv">
              {sensors.map((sensor) => (
                <div className="kv-row" key={sensor.label}>
                  <dt>{sensor.label}</dt>
                  <dd>{sensor.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Panel>

      <Panel title="Disks" meta={`${snap.disks.length} mounted`} flush>
        <Table label="Disks">
          <THead>
            <Th>Mount</Th>
            <Th>Device</Th>
            <Th>Filesystem</Th>
            <Th num>Used</Th>
            <Th num>Inodes</Th>
            <Th num>Read</Th>
            <Th num>Write</Th>
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
              </tr>
            ))}
          </TBody>
        </Table>
      </Panel>

      <Panel
        title="Top processes"
        meta={
          <>
            <span>{snap.processes.length} shown · arguments redacted</span>
            <Link className="text-link" to={`/nodes/${nodeId}/processes`}>
              All processes
            </Link>
          </>
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
              <Th num>CPU</Th>
              <Th num>Memory</Th>
              <Th num>Threads</Th>
              <Th num>Started</Th>
            </THead>
            <TBody>
              {snap.processes.slice(0, 8).map((proc) => (
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
                  <Td num cell="key">
                    {percent(proc.cpu_percent, 1)}
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
