import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FunnelSimple } from '@phosphor-icons/react';
import { Panel } from '../../components/Panel';
import { Pager } from '../../components/Pager';
import { ErrorPanel, PageSkeleton } from '../../components/States';
import { UnitState, UnitTable } from '../../components/UnitTable';
import { useFleetServices } from '../../data/queries';
import { pageOf, usePageSize } from '../../lib/usePageSize';

/**
 * Every systemd unit on every node in one list. The home screen shows the first
 * page; this screen is where an operator sorts and filters the whole fleet.
 */
export function FleetServicesPage() {
  const services = useFleetServices();
  const navigate = useNavigate();
  const pageSize = usePageSize();
  const [page, setPage] = useState(0);
  const [state, setState] = useState('all');
  const [query, setQuery] = useState('');

  const units = useMemo(() => {
    const list = services.data ?? [];
    return [...list].sort(
      (a, b) =>
        (a.active_state === 'failed' ? 0 : 1) - (b.active_state === 'failed' ? 0 : 1) ||
        a.node_name.localeCompare(b.node_name) ||
        a.name.localeCompare(b.name),
    );
  }, [services.data]);

  if (services.isPending) return <PageSkeleton title="Services" />;
  if (services.isError) {
    return <ErrorPanel what="Could not load services." onRetry={() => services.refetch()} />;
  }

  const failed = units.filter((unit) => unit.active_state === 'failed').length;
  const filtered = units
    .filter((unit) => state === 'all' || unit.active_state === state)
    .filter((unit) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        unit.name.toLowerCase().includes(q) ||
        unit.description.toLowerCase().includes(q) ||
        unit.node_name.toLowerCase().includes(q)
      );
    });
  const pg = pageOf(filtered.length, pageSize, page);
  const rows = filtered.slice(pg.index * pageSize, pg.index * pageSize + pageSize);
  const nodes = new Set(units.map((unit) => unit.node_id)).size;

  return (
    <Panel
      title="Services"
      level={1}
      id="services-title"
      desc={`${units.length} services on ${nodes} systems · ${failed} failed · sorted by state, then system`}
      flush
      meta={
        <>
          <UnitState
            units={units}
            value={state}
            onChange={(next) => {
              setState(next);
              setPage(0);
            }}
          />
          <label className="filter">
            <FunnelSimple size={14} aria-hidden="true" />
            <input
              className="input"
              placeholder="Filter units…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              aria-label="Filter units"
            />
          </label>
        </>
      }
    >
      <UnitTable
        rows={rows}
        showSubState
        onOpen={(unit) => navigate(`/nodes/${'node_id' in unit ? unit.node_id : ''}/services`)}
      />
      <Pager
        page={pg.index}
        pages={pg.pages}
        from={pg.from}
        to={pg.to}
        total={filtered.length}
        onChange={setPage}
      />
    </Panel>
  );
}
