import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { PageHeader, Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { StatusPill } from '../../components/StatusPill';
import { Empty, ErrorPanel, PageSkeleton } from '../../components/States';
import { useFleet } from '../../data/queries';
import { percent, relative, size, uptime } from '../../lib/format';

export function NodesPage() {
  const fleet = useFleet();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const now = Date.now();

  if (fleet.isPending) return <PageSkeleton title="Nodes" />;
  if (fleet.isError || !fleet.data) {
    return (
      <>
        <PageHeader title="Nodes" finding="The fleet list did not load." />
        <ErrorPanel what="Couldn't load the fleet snapshot." onRetry={() => void fleet.refetch()} />
      </>
    );
  }

  const all = fleet.data.nodes;
  const needle = query.trim().toLowerCase();
  const nodes = all.filter((view) =>
    needle
      ? [view.node.name, view.node.os, view.node.kernel, view.node.arch, ...view.node.labels].join(' ').toLowerCase().includes(needle)
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
        finding={`${nodes.length} of ${all.length} boxes. Filter by name, OS, kernel, architecture or label.`}
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
</>
        }
      />
      <Panel title="Fleet" meta={`${nodes.length} boxes`} flush>
        {nodes.length === 0 ? (
          <Empty>
            {all.length === 0 ? (
              <>No node yet. <Link className="link" to="/settings/nodes">Add the first agent</Link>.</>
            ) : (
              <>No node matches “{query}”. Clear the filter to see all {all.length}.</>
            )}
          </Empty>
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
              <Th num>Last seen</Th>
            </THead>
            <TBody>
              {nodes.map((view) => {
                const node = view.node;
                return (
                  <tr key={node.id}>
                    <Td cell="primary">
                      <Link to={`/nodes/${node.id}`} className="row-name">
                        {node.name}
                        <StatusPill status={view.health.status} />
                      </Link>
                      <span className="cell-sub">{[...node.labels, node.arch].filter(Boolean).join(' · ') || 'no labels'}</span>
                    </Td>
                    <Td cell="field" label="OS">
                      {node.os || view.snapshot?.node.platform || '—'}
                    </Td>
                    <Td num cell="field" label="Uptime">
                      {uptime(view.health.uptime_sec)}
                    </Td>
                    <Td num cell="field" label="Load">
                      {view.health.load1.toFixed(2)}
                    </Td>
                    <Td num cell="key">{view.health.status === 'offline' ? '—' : percent(view.health.cpu_pct)}</Td>
        
                    <Td num cell="field" label="Disk">
                      {percent(view.health.root_disk_pct)}
                      <span className="cell-sub">
                        {view.health.root_disk_total ? `${size(view.health.root_disk_used)} of ${size(view.health.root_disk_total)}` : 'no disk'}
                      </span>
                    </Td>
                    <Td num cell="field" label="Seen">
                      {relative(node.last_seen, now)}
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
