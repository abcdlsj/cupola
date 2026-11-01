import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { CpuChart } from '../../components/CpuChart';
import { ErrorPanel, PageSkeleton } from '../../components/States';
import { useFleet } from '../../data/queries';
import { diskUsedPct, daysToFull, rootDisk } from '../../data/derive';
import { cpuSeries, rangeById, RANGES } from '../../data/series';
import {
  clock,
  capacity,
  duration,
  eventTime,
  percent,
  rate,
  relative,
  size,
  uptime,
} from '../../lib/format';

export function NodeOverview() {
  const { nodeId } = useParams();
  const [params, setParams] = useSearchParams();
  const fleet = useFleet();
  const range = rangeById(params.get('range'));

  const node = fleet.data?.nodes.find((entry) => entry.id === nodeId);

  const series = useMemo(
    () => (node ? cpuSeries(node, range, fleet.data?.generatedAt ?? Date.now()) : null),
    [node, range, fleet.data?.generatedAt],
  );

  if (fleet.isPending || !fleet.data) return <PageSkeleton title="Node overview" />;
  if (fleet.isError) {
    return <ErrorPanel what="Couldn't load the node." onRetry={() => void fleet.refetch()} />;
  }
  if (!node || !series) {
    return <p className="empty">This node is no longer in the fleet.</p>;
  }

  const now = fleet.data.generatedAt;
  const disk = rootDisk(node);
  const memPct = node.memTotalGb > 0 ? (node.memUsedGb / node.memTotalGb) * 100 : 0;
  const offline = node.status === 'offline';

  const values = series.points.map((point) => point[1]);
  const peakValue = values.length ? Math.max(...values) : 0;
  const peakAt = series.points[values.indexOf(peakValue)]?.[0];
  const restart = fleet.data.events.find(
    (event) => event.nodeId === node.id && event.kind === 'container',
  );
  const restartedContainer = node.containers.find((container) => container.restartsLastHour > 0);

  const markers = restart
    ? [{ at: restart.at, label: `${restartedContainer?.name ?? 'container'} restart` }]
    : [];

  const setRange = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('range', id);
    setParams(next, { replace: true });
  };

  const samples = [
    ...node.sensors.map((sensor) => ({
      label: sensor.label,
      value: `${sensor.value} ${sensor.unit}`,
    })),
    { label: 'Pressure CPU', value: `${node.pressure.cpuSome.toFixed(1)}%` },
    { label: 'Pressure memory', value: `${node.pressure.memSome.toFixed(1)}%` },
    { label: 'Pressure I/O', value: `${node.pressure.ioSome.toFixed(1)}%` },
    { label: 'Swap used', value: `${node.swapUsedGb.toFixed(1)} of ${capacity(node.swapTotalGb)}` },
  ];

  return (
    <>
      <div className="kpi-row" data-count="5">
        <div className="kpi-cell">
          <div className="kpi-label">CPU</div>
          <div className="kpi-value">{offline ? '—' : percent(node.cpuPct)}</div>
          <div className="kpi-sub">
            {offline ? `last sample ${relative(node.lastSeenAt, now)}` : `load ${node.load[0].toFixed(2)} · ${node.cores} cores`}
          </div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Memory</div>
          <div className="kpi-value">{size(node.memUsedGb)}</div>
          <div className="kpi-sub">
            of {capacity(node.memTotalGb)} · {percent(memPct)}
          </div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Root disk</div>
          <div className="kpi-value">{disk ? percent(diskUsedPct(disk.usedGb, disk.sizeGb)) : '—'}</div>
          <div className="kpi-sub">{disk ? `${size(disk.usedGb)} of ${size(disk.sizeGb)}` : 'no disk mounted'}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Network</div>
          <div className="kpi-value">{offline ? '—' : rate(node.net.rxKbps)}</div>
          <div className="kpi-sub">rx · {offline ? 'no carrier' : `${rate(node.net.txKbps)} tx`}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Uptime</div>
          <div className="kpi-value">{offline ? '—' : uptime(node.uptimeSec)}</div>
          <div className="kpi-sub">
            {offline ? relative(node.lastSeenAt, now) : `booted ${eventTime(node.bootAt, now)}`}
          </div>
        </div>
      </div>

      <Panel
        title="CPU"
        meta={
          <div className="range" role="group" aria-label="Time range">
            {RANGES.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className="range-btn"
                aria-pressed={entry.id === range.id}
                onClick={() => setRange(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        }
        flush
      >
        <div className="cpu-split">
          <div className="cpu-split-main">
            <CpuChart
              points={series.points}
              now={now}
              marker={markers[0]}
              label={`CPU utilisation on ${node.name}, ${range.label} window`}
            />
            <p className="cpu-note">
              {series.truncated
                ? `The agent stopped reporting at ${clock(node.lastSeenAt)} UTC; the line ends at the last sample.`
                : values.length
                  ? `Peak ${percent(peakValue, 1)} at ${clock(peakAt * 1000)} UTC${restart ? ` · ${markers[0]?.label} at ${clock(restart.at)} UTC` : ''}.`
                  : 'No samples in this window.'}
              {markers.length ? '' : ''}
            </p>
          </div>
          <div className="cpu-split-side">
            <h3 className="split-title">Sensors and pressure</h3>
            <dl className="kv">
              {samples.map((sample) => (
                <div className="kv-row" key={sample.label}>
                  <dt>{sample.label}</dt>
                  <dd>{sample.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Panel>

      <Panel title="Disks" meta={`${node.disks.length} mounted`} flush>
        <Table label="Disks">
          <THead>
            <Th>Mount</Th>
            <Th>Device</Th>
            <Th>Filesystem</Th>
            <Th num>Used</Th>
            <Th num>Inodes</Th>
            <Th num>Read</Th>
            <Th num>Write</Th>
            <Th num>Full in</Th>
          </THead>
          <TBody>
            {node.disks.map((entry) => {
              const full = daysToFull(entry.usedGb, entry.sizeGb, entry.growthPctPerDay);
              return (
                <tr key={entry.device}>
                  <Td cell="primary">
                    <span className="row-name">{entry.mount}</span>
                  </Td>
                  <Td cell="field" label="Device">
                    {entry.device}
                  </Td>
                  <Td cell="field" label="FS">
                    {entry.fstype}
                  </Td>
                  <Td num cell="key">
                    {percent(diskUsedPct(entry.usedGb, entry.sizeGb))}
                    <span className="cell-unit">
                      {' '}
                      {size(entry.usedGb)} of {size(entry.sizeGb)}
                    </span>
                  </Td>
                  <Td num cell="field" label="Inodes">
                    {percent(entry.inodePct)}
                  </Td>
                  <Td num cell="field" label="Read">
                    {entry.readMbps.toFixed(1)} MB/s
                  </Td>
                  <Td num cell="field" label="Write">
                    {entry.writeMbps.toFixed(1)} MB/s
                  </Td>
                  <Td num cell="field" label="Full in">
                    {full === null ? '—' : full > 365 ? 'over a year' : duration(full * 86400)}
                  </Td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </Panel>

      <Panel
        title="Top processes"
        meta={`${node.processes.length} shown · arguments redacted`}
        flush
      >
        {node.processes.length === 0 ? (
          <p className="empty">
            No process sample. The agent stopped reporting {relative(node.lastSeenAt, now)}.
          </p>
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
              <Th>Command</Th>
            </THead>
            <TBody>
              {node.processes.map((process) => (
                <tr key={process.pid}>
                  <Td cell="primary">
                    <span className="row-name">{process.name}</span>
                  </Td>
                  <Td num cell="field" label="PID">
                    {process.pid}
                  </Td>
                  <Td cell="field" label="User">
                    {process.user}
                  </Td>
                  <Td num cell="key">
                    {percent(process.cpuPct, 1)}
                  </Td>
                  <Td num cell="field" label="Memory">
                    {size(process.rssMb / 1024)}
                  </Td>
                  <Td num cell="field" label="Threads">
                    {process.threads}
                  </Td>
                  <Td num cell="field" label="Started">
                    {relative(process.startedAt, now)}
                  </Td>
                  <Td cell="field" label="Cmd">
                    <span className="cmd">{process.command}</span>
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
