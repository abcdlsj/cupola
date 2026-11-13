// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useMemo } from 'react';
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
import { Band, Figure, Meter, PageHead, useIsPhone } from '../../ui/kit';
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

/** The label a card used to carry: the first node label, else the push transport. */
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
    <HStack gap={1.5} vAlign="center">
      <Link href={nodeHref(view.node.id)} maxLines={1} className="node-link">
        {view.node.name}
      </Link>
      {role ? (
        <Text type="supporting" maxLines={1}>
          {role}
        </Text>
      ) : null}
    </HStack>
  );
}

const columns: Array<TableColumn<SystemRow>> = [
  {
    key: 'name',
    header: 'System',
    width: '320px',
    renderCell: ({ view, fig }) => (
      <HStack gap={2} vAlign="center">
        <StatusDot status={view.health.status} />
        <VStack gap={0}>
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
    renderCell: ({ view, fig }) => <Meter value={fig.cpu} label={`${view.node.name} CPU`} width={64} />,
  },
  {
    key: 'memory',
    header: 'Memory',
    renderCell: ({ view, fig }) => <Meter value={fig.mem} label={`${view.node.name} memory`} width={64} />,
  },
  {
    key: 'disk',
    header: 'Disk',
    renderCell: ({ view, fig }) => <Meter value={fig.disk} label={`${view.node.name} root filesystem`} width={64} />,
  },
  {
    key: 'load',
    header: 'Load',
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
    width: '88px',
    align: 'end',
    renderCell: ({ fig }) => <Figure value={fig.temp} digits={0} unit="°C" />,
  },
  {
    key: 'uptime',
    header: 'Up',
    width: '104px',
    align: 'end',
    renderCell: ({ view, fig }) => (
      <Figure value={fig.online && view.health.uptime_sec > 0 ? uptime(view.health.uptime_sec) : null} />
    ),
  },
];

/** Below 900 px a table stops being readable: each system becomes one block. */
function SystemBlocks({ rows }: { rows: SystemRow[] }) {
  return (
    <div className="rows">
      {rows.map(({ id, view, fig }) => {
        const meta = [
          metaOf(view, fig),
          fig.temp != null ? `${Math.round(fig.temp)} °C` : null,
          fig.online && view.health.uptime_sec > 0 ? `up ${uptime(view.health.uptime_sec)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const meters: Array<[string, number | null, string | undefined]> = [
          ['CPU', fig.cpu, undefined],
          ['Memory', fig.mem, undefined],
          ['Disk', fig.disk, undefined],
          ['Load', loadPct(fig), fig.load ? fig.load[0].toFixed(2) : undefined],
        ];
        return (
          <div className="row" key={id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: '12px 0' }}>
            <HStack gap={2} vAlign="start">
              <StatusDot status={view.health.status} />
              <VStack gap={0}>
                <SystemName view={view} />
                <Text type="supporting" maxLines={1}>
                  {meta || 'no data yet'}
                </Text>
              </VStack>
            </HStack>
            {meters.map(([label, value, text]) => (
              <HStack key={label} gap={3} vAlign="center">
                <span className="muted small" style={{ width: 64 }}>
                  {label}
                </span>
                <Meter value={value} label={`${view.node.name} ${label.toLowerCase()}`} text={text} width={160} />
              </HStack>
            ))}
          </div>
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

  return (
    <>
      <PageHead
        title={`${nodes.length} ${nodes.length === 1 ? 'system' : 'systems'}`}
        desc={finding}
        actions={
          <>
            {updated ? (
              <HStack gap={2} vAlign="center" paddingInline={2}>
                <Dot
                  variant={stale ? 'warning' : 'success'}
                  label={stale ? 'Stale' : 'Live'}
                  isPulsing={!stale}
                  tooltip={stale ? 'The hub stopped answering' : 'Refreshed every 10 s'}
                />
                <Text type="supporting" textWrap="nowrap">
                  {stale ? 'stale, ' : ''}updated {relative(updated, Date.now())}
                </Text>
              </HStack>
            ) : null}
            {phone ? null : filter}
            <Button label="Settings" href="/settings/nodes" />
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
          <SystemBlocks rows={shown} />
        ) : (
          <Table data={shown} columns={columns} idKey="id" label="Systems" hasHover />
        )}
      </Band>

      <Band
        title="Services"
        desc={
          services.isPending
            ? 'Loading units…'
            : `${units.length} units · failed first`
        }
        actions={<Button label="View all" href="/services" />}
      >
        {services.isError ? (
          <ErrorPanel what="Could not load services." onRetry={() => services.refetch()} />
        ) : services.isPending ? null : (
          <>
            <UnitTable rows={rows} />
            {pg.pages > 1 ? (
              <Pager
                page={pg.index}
                pages={pg.pages}
                from={pg.from}
                to={pg.to}
                total={units.length}
                onChange={(next) => update('page', next > 0 ? String(next + 1) : null)}
              />
            ) : null}
          </>
        )}
      </Band>
    </>
  );
}
