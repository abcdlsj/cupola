import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HStack } from '@astryxdesign/core/HStack';
import { Pagination } from '@astryxdesign/core/Pagination';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { ErrorPanel, LoadingPage } from '../../components/States';
import { UnitState, UnitTable } from '../../components/UnitTable';
import { useFleetServices } from '../../data/queries';
import type { FleetService } from '../../data/types';
import { pageOf, usePageSize } from '../../lib/usePageSize';
import { Band, PageHead, useIsPhone } from '../../ui/kit';

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
 * Every systemd unit on every node in one list. The home screen shows the first
 * page; this screen is where an operator filters the whole fleet. Filter, state
 * and page live in the URL (?q= ?state= ?page=).
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

  const failed = units.filter((unit) => unit.active_state === 'failed').length;
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

  const controls = (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <UnitState
        units={units}
        value={state}
        onChange={(next) => update({ state: next === 'all' ? null : next, page: null })}
      />
      <VStack width={phone ? '100%' : 240}>
        <TextInput
          label="Filter units"
          isLabelHidden
          type="search"
          enterKeyHint="search"
          size={phone ? 'md' : 'sm'}
          value={query}
          hasClear
          onChange={(value) => update({ q: value || null, page: null })}
          placeholder="Filter units…"
        />
      </VStack>
    </HStack>
  );

  return (
    <>
      <PageHead
        title="Services"
        desc={`${units.length} ${units.length === 1 ? 'unit' : 'units'} on ${nodes} ${nodes === 1 ? 'system' : 'systems'} · ${failed} failed · failed first, then by system`}
        actions={phone ? undefined : controls}
      />
      <Band first>
        {phone ? controls : null}
        <UnitTable rows={rows} showSubState />
        {pg.pages > 1 ? (
          <HStack hAlign="end">
            <Pagination
              label="Units pages"
              page={pg.index + 1}
              pageSize={pageSize}
              totalItems={filtered.length}
              variant={phone ? 'compact' : 'count'}
              size={phone ? 'md' : 'sm'}
              onChange={(next) => update({ page: next > 1 ? String(next) : null })}
            />
          </HStack>
        ) : null}
      </Band>
    </>
  );
}
