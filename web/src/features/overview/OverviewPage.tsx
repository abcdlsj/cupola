// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useMemo } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { useSearchParams } from 'react-router-dom';
import { ErrorPanel, LoadingPage } from '../../components/States';
import { StatusDot } from '../../components/StatusPill';
import { Pager } from '../../components/Pager';
import { UnitTable } from '../../components/UnitTable';
import { useFleet, useFleetServices } from '../../data/queries';
import type { NodeView } from '../../data/types';
import { nodeFigures, type NodeFigures } from '../../lib/fleet';
import { relative, uptime } from '../../lib/format';
import { pageOf, usePageSize } from '../../lib/usePageSize';
import { Band, Figure, levelOf, Meter, PageHead, useIsPhone } from '../../ui/kit';
import {
  Button,
  EmptyState,
  HStack,
  Link,
  StatusDot as Dot,
  Table,
  Text,
  VStack,
  type TableColumn,
} from '../../ui/primitives';
import { SearchInput } from '../../ui/SearchInput';
import { sortUnits } from '../services/ServicesPage';

interface SystemRow extends Record<string, unknown> {
  id: string;
  view: NodeView;
  fig: NodeFigures;
}

function nodeHref(id: string): string {
  return `/nodes/${encodeURIComponent(id)}`;
}

/** The first node label, else the push transport. */
function roleOf(view: NodeView): string {
  return view.node.labels[0] ?? (view.node.mode === 'push' ? 'push' : '');
}

function metaOf(view: NodeView, fig: NodeFigures): string {
  return [view.node.os || null, fig.cores ? `${fig.cores} cores` : null].filter(Boolean).join(' · ');
}

function loadPct(fig: NodeFigures): number | null {
  return fig.load && fig.cores ? (fig.load[0] / fig.cores) * 100 : null;
}

function SystemName({ view }: { view: NodeView }) {
  const role = roleOf(view);
  return (
    <HStack gap={2} vAlign="center">
      <Link href={nodeHref(view.node.id)} maxLines={1} className="node-link">
        {view.node.name}
      </Link>
      {role ? <span className="role-tag">{role}</span> : null}
    </HStack>
  );
}

const columns: Array<TableColumn<SystemRow>> = [
  {
    key: 'name',
    header: 'System',
    width: '28%',
    renderCell: ({ view, fig }) => (
      <HStack gap={2.5} vAlign="center">
        <StatusDot status={view.health.status} />
        <VStack gap={0.5} style={{ minWidth: 0 }}>
          <SystemName view={view} />
          <Text type="supporting" maxLines={1}>
            {metaOf(view, fig) || 'no data yet'}
          </Text>
        </VStack>
      </HStack>
    ),
  },
  {
    key: 'cpu',
    header: 'CPU',
    width: '13%',
    renderCell: ({ view, fig }) => <Meter value={fig.cpu} label={`${view.node.name} CPU`} width={64} />,
  },
  {
    key: 'memory',
    header: 'Memory',
    width: '13%',
    renderCell: ({ view, fig }) => <Meter value={fig.mem} label={`${view.node.name} memory`} width={64} />,
  },
  {
    key: 'disk',
    header: 'Disk',
    width: '13%',
    renderCell: ({ view, fig }) => <Meter value={fig.disk} label={`${view.node.name} root filesystem`} width={64} />,
  },
  {
    key: 'load',
    header: 'Load',
    width: '14%',
    renderCell: ({ view, fig }) => (
      <Meter
        value={loadPct(fig)}
        label={`${view.node.name} load against ${fig.cores} cores`}
        text={fig.load ? fig.load[0].toFixed(2) : undefined}
        width={64}
      />
    ),
  },
  {
    key: 'temp',
    header: 'Temp',
    width: '9%',
    align: 'end',
    renderCell: ({ fig }) => <Figure value={fig.temp} digits={0} unit="°C" />,
  },
  {
    key: 'uptime',
    header: 'Uptime',
    width: '10%',
    align: 'end',
    renderCell: ({ view, fig }) => (
      <Figure value={fig.online && view.health.uptime_sec > 0 ? uptime(view.health.uptime_sec) : null} />
    ),
  },
];

/** Mobile system cards: tappable card with a clean 2×2 metric meter grid. */
function SystemCards({ rows }: { rows: SystemRow[] }) {
  return (
    <div className="sys-cards">
      {rows.map(({ id, view, fig }) => {
        const role = roleOf(view);
        const meta = metaOf(view, fig) || 'no data yet';
        const upText = fig.online && view.health.uptime_sec > 0 ? uptime(view.health.uptime_sec) : null;
        const tempText = fig.temp != null ? `${Math.round(fig.temp)} °C` : null;
        const metrics: Array<{ label: string; value: number | null; text?: string }> = [
          { label: 'CPU', value: fig.cpu },
          { label: 'Memory', value: fig.mem },
          { label: 'Disk', value: fig.disk },
          { label: 'Load', value: loadPct(fig), text: fig.load ? fig.load[0].toFixed(2) : undefined },
        ];
        return (
          <Link href={nodeHref(view.node.id)} key={id} className="sys-card">
            <div className="sys-card-head">
              <div className="sys-card-id">
                <StatusDot status={view.health.status} />
                <VStack gap={0.5} style={{ minWidth: 0 }}>
                  <div className="sys-card-name-row">
                    <span className="sys-card-name">{view.node.name}</span>
                    {role ? <span className="role-tag">{role}</span> : null}
                  </div>
                  <Text type="supporting" maxLines={1}>
                    {meta}
                  </Text>
                </VStack>
              </div>
              <div className="sys-card-right">
                {tempText ? <span>{tempText}</span> : null}
                {tempText && upText ? <span className="faint">·</span> : null}
                {upText ? <span>{upText}</span> : null}
                <CaretRight size={15} aria-hidden="true" />
              </div>
            </div>

            <div className="sys-card-metrics">
              {metrics.map((metric) => {
                const missing = metric.value == null || !Number.isFinite(metric.value);
                const level = missing ? undefined : levelOf(metric.value);
                const display = missing ? '—' : (metric.text ?? `${Math.round(metric.value!)}%`);
                return (
                  <div className="sys-metric" key={metric.label}>
                    <div className="sys-metric-head">
                      <span className="sys-metric-label">{metric.label}</span>
                      <span
                        className={missing ? 'sys-metric-val is-missing' : 'sys-metric-val'}
                        style={
                          level === 'error'
                            ? { color: 'var(--bad)' }
                            : level === 'warning'
                              ? { color: 'var(--warn)' }
                              : undefined
                        }
                      >
                        {display}
                      </span>
                    </div>
                    <Meter
                      value={metric.value}
                      label={`${view.node.name} ${metric.label.toLowerCase()}`}
                      text={metric.text}
                      showValue={false}
                      width="100%"
                    />
                  </div>
                );
              })}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * The home screen: every system with its meters, then the fleet's systemd
 * units failed first. The systems filter (?q=) and the units page (?page=)
 * live in the URL.
 */
export function OverviewPage() {
  const fleet = useFleet();
  const services = useFleetServices();
  const phone = useIsPhone();
  const pageSize = usePageSize();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const units = useMemo(() => sortUnits(services.data ?? []), [services.data]);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  if (fleet.isPending) return <LoadingPage title="Systems" />;
  if (fleet.isError && !fleet.data) {
    return <ErrorPanel what="Could not load the fleet." onRetry={() => fleet.refetch()} />;
  }

  const nodes = fleet.data?.nodes ?? [];
  const q = query.trim().toLowerCase();
  const shown: SystemRow[] = nodes
    .filter((view) => !q || view.node.name.toLowerCase().includes(q))
    .map((view) => ({ id: view.node.id, view, fig: nodeFigures(view) }));
  const strained = nodes.filter((view) => view.health.status !== 'healthy').length;
  const failed = units.filter((unit) => unit.active_state === 'failed').length;
  const worst = [...nodes]
    .filter((view) => view.health.status !== 'offline')
    .sort((a, b) => b.health.root_disk_pct - a.health.root_disk_pct)[0];

  const finding = [
    strained ? `${strained} need attention` : 'all healthy',
    worst && worst.health.root_disk_pct >= 75
      ? `${worst.node.name} is at ${Math.round(worst.health.root_disk_pct)} % disk`
      : null,
    failed ? `${failed} ${failed === 1 ? 'unit' : 'units'} failed` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const stale = Boolean(fleet.data?.stale);
  const updated = fleet.data?.updated;
  const pg = pageOf(units.length, pageSize, page - 1);
  const rows = units.slice(pg.index * pageSize, pg.index * pageSize + pageSize);

  const filter = (
    <SearchInput
      label="Filter systems"
      value={query}
      onChange={(value) => update('q', value || null)}
      placeholder="Filter systems…"
    />
  );

  const pager =
    pg.pages > 1 ? (
      <Pager
        page={pg.index}
        pages={pg.pages}
        from={pg.from}
        to={pg.to}
        total={units.length}
        onChange={(next) => update('page', next > 0 ? String(next + 1) : null)}
      />
    ) : undefined;

  return (
    <>
      <PageHead
        title={`${nodes.length} ${nodes.length === 1 ? 'system' : 'systems'}`}
        desc={finding}
        actions={
          <>
            {updated ? (
              <span className="live-badge">
                <Dot
                  variant={stale ? 'warning' : 'success'}
                  label={stale ? 'Stale' : 'Live'}
                  isPulsing={!stale}
                  tooltip={stale ? 'The hub stopped answering' : 'Refreshed every 10 s'}
                />
                <span>
                  {stale ? 'stale, ' : ''}updated {relative(updated, Date.now())}
                </span>
              </span>
            ) : null}
            {phone ? null : filter}
            {phone ? null : <Button label="Settings" href="/settings/nodes" />}
          </>
        }
      />

      <Band first>
        {phone ? filter : null}
        {shown.length === 0 ? (
          q ? (
            <EmptyState title={`No system matches “${query}”`} description="Clear the filter to see every system." />
          ) : (
            <EmptyState
              title="No systems yet"
              description="Add a node in Settings to start collecting."
              actions={<Button label="Add a node" variant="primary" href="/settings/nodes" />}
            />
          )
        ) : phone ? (
          <SystemCards rows={shown} />
        ) : (
          <Table data={shown} columns={columns} idKey="id" label="Systems" hasHover />
        )}
      </Band>

      <Band
        title="Services"
        desc={services.isPending ? 'Loading units…' : `${units.length} units · failed first`}
        actions={<Button label="View all" href="/services" size="sm" />}
      >
        {services.isError ? (
          <ErrorPanel what="Could not load services." onRetry={() => services.refetch()} />
        ) : services.isPending ? null : (
          <UnitTable rows={rows} footer={pager} />
        )}
      </Band>
    </>
  );
}
