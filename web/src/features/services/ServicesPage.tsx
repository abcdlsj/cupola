import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorPanel, LoadingPage } from '../../components/States';
import { Pager } from '../../components/Pager';
import { UnitState, UnitTable } from '../../components/UnitTable';
import { useFleetServices } from '../../data/queries';
import type { FleetService } from '../../data/types';
import { pageOf, usePageSize } from '../../lib/usePageSize';
import { useIsPhone } from '../../ui/kit';
import { SearchInput } from '../../ui/SearchInput';

/** Failed first, then by system, then by unit name. */
export function sortUnits(list: FleetService[]): FleetService[] {
  return [...list].sort(
    (a, b) =>
      (a.active_state === 'failed' ? 0 : 1) - (b.active_state === 'failed' ? 0 : 1) ||
      a.node_name.localeCompare(b.node_name) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Every systemd unit on every node in one Beszel card. Filter, state and page
 * live in the URL (?q= ?state= ?page=).
 */
export function FleetServicesPage() {
  const services = useFleetServices();
  const phone = useIsPhone();
  const pageSize = usePageSize();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const state = params.get('state') ?? 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const units = useMemo(() => sortUnits(services.data ?? []), [services.data]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  if (services.isPending) return <LoadingPage title="Services" />;
  if (services.isError) {
    return <ErrorPanel what="Could not load services." onRetry={() => services.refetch()} />;
  }

  const q = query.trim().toLowerCase();
  const filtered = units
    .filter((unit) => state === 'all' || unit.active_state === state)
    .filter(
      (unit) =>
        !q ||
        unit.name.toLowerCase().includes(q) ||
        unit.description.toLowerCase().includes(q) ||
        unit.node_name.toLowerCase().includes(q),
    );
  const pg = pageOf(filtered.length, pageSize, page - 1);
  const rows = filtered.slice(pg.index * pageSize, pg.index * pageSize + pageSize);
  const nodes = new Set(units.map((unit) => unit.node_id)).size;

  return (
    <section className="beszel-card" aria-label="Services">
      <header className="beszel-card-head">
        <div className="beszel-card-title-group">
          <h1>Systemd Services</h1>
          <p>{`Across ${nodes} ${nodes === 1 ? 'system' : 'systems'}`}</p>
        </div>
        <div className="beszel-card-controls">
          <UnitState
            units={units}
            value={state}
            onChange={(next) => update({ state: next === 'all' ? null : next, page: null })}
          />
          <SearchInput
            label="Filter units"
            placeholder="Filter units…"
            value={query}
            width={phone ? '100%' : 240}
            onChange={(value) => update({ q: value || null, page: null })}
          />
        </div>
      </header>
      <UnitTable
        rows={rows}
        showSubState
        footer={
          pg.pages > 1 ? (
            <Pager
              page={pg.index}
              pages={pg.pages}
              from={pg.from}
              to={pg.to}
              total={filtered.length}
              onChange={(next) => update({ page: next > 0 ? String(next + 1) : null })}
            />
          ) : undefined
        }
      />
    </section>
  );
}
