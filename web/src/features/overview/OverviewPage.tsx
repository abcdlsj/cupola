import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FunnelSimple } from '@phosphor-icons/react';
import { Panel } from '../../components/Panel';
import { Pager } from '../../components/Pager';
import { SystemCard } from '../../components/SystemCard';
import { Empty, ErrorPanel, PageSkeleton } from '../../components/States';
import { UnitState, UnitTable } from '../../components/UnitTable';
import { useFleet, useFleetServices } from '../../data/queries';
import { nodeFigures } from '../../lib/fleet';
import { pageOf, usePageSize } from '../../lib/usePageSize';

export function OverviewPage() {
  const fleet = useFleet();
  const services = useFleetServices();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const pageSize = usePageSize();
  const [page, setPage] = useState(0);

  const query = params.get('q') ?? '';
  const units = useMemo(() => {
    const list = services.data ?? [];
    return [...list].sort(
      (a, b) =>
        (a.active_state === 'failed' ? 0 : 1) - (b.active_state === 'failed' ? 0 : 1) ||
        a.node_name.localeCompare(b.node_name) ||
        a.name.localeCompare(b.name),
    );
  }, [services.data]);

  if (fleet.isPending) return <PageSkeleton title="Systems" />;
  if (fleet.isError) {
    return <ErrorPanel what="Could not load the fleet." onRetry={() => fleet.refetch()} />;
  }

  const nodes = fleet.data?.nodes ?? [];
  const shown = nodes.filter(
    (view) => !query || view.node.name.toLowerCase().includes(query.toLowerCase()),
  );
  const strained = nodes.filter((view) => view.health.status !== 'healthy').length;
  const failed = units.filter((unit) => unit.active_state === 'failed').length;
  const worst = [...nodes]
    .filter((view) => view.health.status !== 'offline')
    .sort((a, b) => b.health.root_disk_pct - a.health.root_disk_pct)[0];

  const pg = pageOf(units.length, pageSize, page);
  const rows = units.slice(pg.index * pageSize, pg.index * pageSize + pageSize);

  const finding = [
    `${nodes.length} ${nodes.length === 1 ? 'system' : 'systems'}`,
    strained ? `${strained} need attention` : 'all healthy',
    worst && worst.health.root_disk_pct >= 75
      ? `${worst.node.name} is at ${Math.round(worst.health.root_disk_pct)} % disk`
      : null,
    failed ? `${failed} ${failed === 1 ? 'unit' : 'units'} failed` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="panel" aria-labelledby="systems-title">
      <Panel
        title="Systems"
        level={1}
        desc={finding}
        id="systems-title"
        meta={
          <>
            <label className="filter">
              <FunnelSimple size={14} aria-hidden="true" />
              <input
                className="input"
                placeholder="Filter systems…"
                value={query}
                onChange={(event) => {
                  const next = new URLSearchParams(params);
                  if (event.target.value) next.set('q', event.target.value);
                  else next.delete('q');
                  setParams(next, { replace: true });
                }}
                aria-label="Filter systems"
              />
            </label>
            <Link className="btn" to="/settings/nodes">
              Settings
            </Link>
          </>
        }
      >
        {shown.length === 0 ? (
          <Empty>No system matches “{query}”.</Empty>
        ) : (
          <div className="sysgrid">
            {shown.map((view) => {
              const fig = nodeFigures(view);
              return (
                <SystemCard
                  key={view.node.id}
                  view={view}
                  fig={{
                    online: fig.online,
                    cpu: fig.cpu,
                    mem: fig.mem,
                    disk: fig.disk,
                    load: fig.load,
                    cores: fig.cores,
                    temp: fig.temp,
                    uptime: view.health.uptime_sec,
                  }}
                />
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="Services"
        desc={`${units.length} units across ${nodes.length} systems · ${failed} failed`}
        id="services-title"
        flush
        meta={
          <>
            <UnitState units={units} />
            <Link className="btn" to="/services">
              View all
            </Link>
          </>
        }
      >
        <UnitTable
          rows={rows}
          onOpen={(unit) => navigate(`/nodes/${'node_id' in unit ? unit.node_id : ''}/services`)}
        />
        <Pager
          page={pg.index}
          pages={pg.pages}
          from={pg.from}
          to={pg.to}
          total={units.length}
          onChange={setPage}
        />
      </Panel>
    </section>
  );
}
