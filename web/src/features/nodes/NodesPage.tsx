import { MagnifyingGlass } from '@phosphor-icons/react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { CopyLinkButton } from '../../components/CopyLinkButton';
import { StatusPill } from '../../components/StatusPill';
import { ErrorPanel, PageSkeleton } from '../../components/States';
import { useFleet } from '../../data/queries';
import { diskUsedPct } from '../../data/derive';
import { capacity, percent, relative, size, uptime } from '../../lib/format';

export function NodesPage() {
  const fleet = useFleet();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';

  if (fleet.isPending) return <PageSkeleton title="Nodes" />;
  if (fleet.isError || !fleet.data) {
    return (
      <>
        <PageHeader title="Nodes" finding="The fleet list did not load." />
        <ErrorPanel what="Couldn't load the fleet snapshot." onRetry={() => void fleet.refetch()} />
      </>
    );
  }

  const snapshot = fleet.data;
  const now = snapshot.generatedAt;
  const needle = query.trim().toLowerCase();
  const nodes = snapshot.nodes.filter((node) =>
    needle
      ? [node.name, node.os, node.kernel, node.ip, node.location, ...node.labels]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      : true,
  );

  const onFilter = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Nodes"
        finding={`${nodes.length} of ${snapshot.nodes.length} boxes. Filter by name, OS, address or label.`}
        actions={
          <>
            <label className="filter">
              <span className="sr-only">Filter nodes</span>
              <MagnifyingGlass size={15} aria-hidden="true" />
              <input
                className="input input-search"
                value={query}
                onChange={(event) => onFilter(event.target.value)}
                placeholder="Filter nodes"
                type="search"
              />
            </label>
            <CopyLinkButton />
          </>
        }
      />

      <Panel title="Fleet" meta={`${nodes.length} boxes`} flush>
        {nodes.length === 0 ? (
          <p className="empty">No node matches “{query}”. Clear the filter to see all {snapshot.nodes.length}.</p>
        ) : (
          <Table label="Nodes">
            <THead>
              <Th>Node</Th>
              <Th>OS</Th>
              <Th num>Uptime</Th>
              <Th num>Load 1 m</Th>
              <Th num>CPU</Th>
              <Th num>Memory</Th>
              <Th num>Root disk</Th>
              <Th>Last seen</Th>
            </THead>
            <TBody>
              {nodes.map((node) => {
                const disk = node.disks.find((entry) => entry.mount === '/') ?? node.disks[0];
                return (
                  <tr key={node.id}>
                    <Td cell="primary">
                      <Link to={`/nodes/${node.id}`} className="row-name">
                        {node.name}
                        <StatusPill status={node.status} />
                      </Link>
                      <span className="cell-sub">
                        {node.ip} · {node.location}
                      </span>
                    </Td>
                    <Td cell="field" label="OS">
                      {node.os}
                      <span className="cell-sub">{node.kernel}</span>
                    </Td>
                    <Td num cell="field" label="Uptime">
                      {uptime(node.uptimeSec)}
                    </Td>
                    <Td num cell="field" label="Load">
                      {node.load[0].toFixed(2)}
                    </Td>
                    <Td num cell="key">
                      {node.status === 'offline' ? '—' : percent(node.cpuPct)}
                    </Td>
                    <Td num cell="field" label="Memory">
                      {size(node.memUsedGb)}
                      <span className="cell-sub">of {capacity(node.memTotalGb)}</span>
                    </Td>
                    <Td num cell="field" label="Disk">
                      {disk ? percent(diskUsedPct(disk.usedGb, disk.sizeGb)) : '—'}
                      <span className="cell-sub">
                        {disk ? `${size(disk.usedGb)} of ${size(disk.sizeGb)}` : 'no disk'}
                      </span>
                    </Td>
                    <Td cell="field" label="Seen">
                      {relative(node.lastSeenAt, now)}
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
