// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowsDownUp,
  CaretRight,
  List,
  SquaresFour,
} from '@phosphor-icons/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorPanel, LoadingPage } from '../../components/States';
import { StatusDot } from '../../components/StatusPill';
import { Pager } from '../../components/Pager';
import { UnitTable } from '../../components/UnitTable';
import { useFleet, useFleetServices } from '../../data/queries';
import type { NodeView } from '../../data/types';
import { nodeFigures, type NodeFigures } from '../../lib/fleet';
import { netRate, relative, size, uptime } from '../../lib/format';
import { pageOf, usePageSize } from '../../lib/usePageSize';
import { Figure, KpiCell, KpiStrip, levelOf, Meter, useIsPhone } from '../../ui/kit';
import {
  Badge,
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
import { SegmentedControl, SegmentedControlItem } from '../../ui/controls';
import { SearchInput } from '../../ui/SearchInput';
import { sortUnits } from '../services/ServicesPage';

interface SystemRow extends Record<string, unknown> {
  id: string;
  view: NodeView;
  fig: NodeFigures;
}

type ViewMode = 'table' | 'cards';
type SortKey = 'strain' | 'name' | 'cpu' | 'mem' | 'disk' | 'net' | 'temp' | 'uptime';

const VIEW_STORAGE_KEY = 'cupola.systemsView';

function readStoredView(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'table' || saved === 'cards') return saved;
  } catch {
    // storage blocked
  }
  return 'table';
}

function nodeHref(id: string): string {
  return `/nodes/${encodeURIComponent(id)}`;
}

/** The first node label, else the push transport. */
function roleOf(view: NodeView): string {
  return view.node.labels[0] ?? (view.node.mode === 'push' ? 'push' : '');
}

function metaOf(view: NodeView, fig: NodeFigures): string {
  const mem = view.health.mem_total ? size(view.health.mem_total) : null;
  return [view.node.os || null, fig.cores ? `${fig.cores}c` : null, mem].filter(Boolean).join(' · ');
}

function loadPct(fig: NodeFigures): number | null {
  return fig.load && fig.cores ? (fig.load[0] / fig.cores) * 100 : null;
}

function strainScore(row: SystemRow): number {
  const statusWeight =
    row.view.health.status === 'offline'
      ? 1000
      : row.view.health.status === 'degraded'
        ? 500
        : row.view.health.status === 'unknown'
          ? 250
          : 0;
  const peak = Math.max(row.fig.cpu ?? 0, row.fig.mem ?? 0, row.fig.disk ?? 0);
  return statusWeight + peak;
}

function sortRows(rows: SystemRow[], key: SortKey, dir: 'asc' | 'desc'): SystemRow[] {
  if (key === 'strain') {
    return [...rows].sort((a, b) => strainScore(b) - strainScore(a) || a.view.node.name.localeCompare(b.view.node.name));
  }
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'name') return factor * a.view.node.name.localeCompare(b.view.node.name);
    const num = (row: SystemRow): number => {
      switch (key) {
        case 'cpu':
          return row.fig.cpu ?? -1;
        case 'mem':
          return row.fig.mem ?? -1;
        case 'disk':
          return row.fig.disk ?? -1;
        case 'net':
          return row.fig.net ?? -1;
        case 'temp':
          return row.fig.temp ?? -1;
        case 'uptime':
          return row.fig.online ? row.view.health.uptime_sec : -1;
        default:
          return 0;
      }
    };
    return factor * (num(a) - num(b)) || a.view.node.name.localeCompare(b.view.node.name);
  });
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

function SortHeader({
  label,
  col,
  active,
  dir,
  onSort,
}: {
  label: string;
  col: SortKey;
  active: SortKey;
  dir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
}) {
  const isActive = active === col;
  return (
    <button
      type="button"
      className="sort-btn"
      data-active={isActive ? 'true' : undefined}
      onClick={() => onSort(col)}
    >
      <span>{label}</span>
      {isActive ? (
        dir === 'asc' ? (
          <ArrowUp size={12} aria-hidden="true" />
        ) : (
          <ArrowDown size={12} aria-hidden="true" />
        )
      ) : (
        <ArrowsDownUp size={12} style={{ opacity: 0.45 }} aria-hidden="true" />
      )}
    </button>
  );
}

/** Beszel grid cards: tappable card with header bar, 2×2 metric meters and footer. */
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
                <div className="sys-card-name-row">
                  <span className="sys-card-name">{view.node.name}</span>
                  {role ? <span className="role-tag">{role}</span> : null}
                </div>
              </div>
              <div className="sys-card-right">
                {tempText ? <span>{tempText}</span> : null}
                {tempText && upText ? <span className="faint">·</span> : null}
                {upText ? <span>{upText}</span> : null}
                <CaretRight size={14} aria-hidden="true" />
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

            <div className="sys-card-foot">
              <span className="clamp-1">{meta}</span>
              {fig.rx != null && fig.tx != null ? (
                <span className="code nowrap">
                  ↓ {netRate(fig.rx)} · ↑ {netRate(fig.tx)}
                </span>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * The home screen (Beszel-refined):
 * 1. Compact 4-card Fleet Summary strip (Online, Fleet CPU, Fleet Memory, Attention)
 * 2. All Systems card with filter, sortable table and Table/Cards switcher
 * 3. Systemd Services card (failed first, with honest state counts)
 */
export function OverviewPage() {
  const fleet = useFleet();
  const services = useFleetServices();
  const phone = useIsPhone();
  const navigate = useNavigate();
  const pageSize = usePageSize();
  const [params, setParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredView);
  const [sortKey, setSortKey] = useState<SortKey>('strain');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const query = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const units = useMemo(() => sortUnits(services.data ?? []), [services.data]);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const changeView = (next: string) => {
    const mode: ViewMode = next === 'cards' ? 'cards' : 'table';
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // storage blocked
    }
  };

  const toggleSort = (col: SortKey) => {
    if (sortKey === col) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(col);
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  };

  if (fleet.isPending) return <LoadingPage title="Systems" />;
  if (fleet.isError && !fleet.data) {
    return <ErrorPanel what="Could not load the fleet." onRetry={() => fleet.refetch()} />;
  }

  const nodes = fleet.data?.nodes ?? [];
  const allRows: SystemRow[] = nodes.map((view) => ({ id: view.node.id, view, fig: nodeFigures(view) }));
  const q = query.trim().toLowerCase();
  const filtered = allRows.filter(
    ({ view }) =>
      !q ||
      view.node.name.toLowerCase().includes(q) ||
      view.node.os.toLowerCase().includes(q) ||
      view.node.labels.some((label) => label.toLowerCase().includes(q)),
  );
  const shown = sortRows(filtered, sortKey, sortDir);

  // Fleet KPI summaries
  const onlineRows = allRows.filter(({ fig }) => fig.online);
  const pushCount = nodes.filter((view) => view.node.mode === 'push').length;
  const pullCount = nodes.length - pushCount;
  const totalCores = onlineRows.reduce((sum, { fig }) => sum + fig.cores, 0);
  const avgCpu =
    onlineRows.length > 0
      ? onlineRows.reduce((sum, { fig }) => sum + (fig.cpu ?? 0), 0) / onlineRows.length
      : null;
  const peakCpuNode = [...onlineRows].sort((a, b) => (b.fig.cpu ?? 0) - (a.fig.cpu ?? 0))[0];

  const totalMemBytes = onlineRows.reduce((sum, { view }) => sum + (view.health.mem_total || 0), 0);
  const usedMemBytes = onlineRows.reduce((sum, { view }) => sum + (view.health.mem_used || 0), 0);
  const fleetMemPct =
    totalMemBytes > 0
      ? (usedMemBytes / totalMemBytes) * 100
      : onlineRows.length > 0
        ? onlineRows.reduce((sum, { fig }) => sum + (fig.mem ?? 0), 0) / onlineRows.length
        : null;

  const strained = nodes.filter((view) => view.health.status !== 'healthy').length;
  const failedUnits = units.filter((unit) => unit.active_state === 'failed').length;
  const activeUnits = units.filter((unit) => unit.active_state === 'active').length;
  const attentionCount = strained + failedUnits;

  const worstDisk = [...nodes]
    .filter((view) => view.health.status !== 'offline')
    .sort((a, b) => b.health.root_disk_pct - a.health.root_disk_pct)[0];

  const finding = [
    `${nodes.length} ${nodes.length === 1 ? 'system' : 'systems'}`,
    strained ? `${strained} need attention` : 'all healthy',
    worstDisk && worstDisk.health.root_disk_pct >= 75
      ? `${worstDisk.node.name} at ${Math.round(worstDisk.health.root_disk_pct)}% disk`
      : null,
    failedUnits ? `${failedUnits} ${failedUnits === 1 ? 'unit' : 'units'} failed` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const stale = Boolean(fleet.data?.stale);
  const updated = fleet.data?.updated;
  const pg = pageOf(units.length, pageSize, page - 1);
  const unitRows = units.slice(pg.index * pageSize, pg.index * pageSize + pageSize);

  const columns: Array<TableColumn<SystemRow>> = [
    {
      key: 'name',
      header: <SortHeader label="System" col="name" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '25%',
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
      header: <SortHeader label="CPU" col="cpu" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '13%',
      renderCell: ({ view, fig }) => <Meter value={fig.cpu} label={`${view.node.name} CPU`} width={68} />,
    },
    {
      key: 'memory',
      header: <SortHeader label="Memory" col="mem" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '13%',
      renderCell: ({ view, fig }) => <Meter value={fig.mem} label={`${view.node.name} memory`} width={68} />,
    },
    {
      key: 'disk',
      header: <SortHeader label="Disk" col="disk" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '13%',
      renderCell: ({ view, fig }) => <Meter value={fig.disk} label={`${view.node.name} root filesystem`} width={68} />,
    },
    {
      key: 'net',
      header: <SortHeader label="Network" col="net" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '14%',
      align: 'end',
      renderCell: ({ fig }) =>
        fig.rx != null && fig.tx != null ? (
          <span className="net-stack">
            <span className="net-rx">↓ {netRate(fig.rx)}</span>
            <span className="net-tx">↑ {netRate(fig.tx)}</span>
          </span>
        ) : (
          <Figure value={null} />
        ),
    },
    {
      key: 'temp',
      header: <SortHeader label="Temp" col="temp" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '10%',
      align: 'end',
      renderCell: ({ fig }) => (
        <span style={fig.temp != null && fig.temp >= 75 ? { color: 'var(--warn)' } : undefined}>
          <Figure value={fig.temp} digits={0} unit="°C" />
        </span>
      ),
    },
    {
      key: 'uptime',
      header: <SortHeader label="Uptime" col="uptime" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '12%',
      align: 'end',
      renderCell: ({ view, fig }) => (
        <Figure value={fig.online && view.health.uptime_sec > 0 ? uptime(view.health.uptime_sec) : null} />
      ),
    },
  ];

  const effectiveMode: ViewMode = phone ? 'cards' : viewMode;

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
      <KpiStrip>
        <KpiCell
          label="Systems online"
          value={nodes.length ? `${onlineRows.length} / ${nodes.length}` : '0'}
          state={onlineRows.length === nodes.length && nodes.length > 0 ? 'success' : nodes.length === 0 ? 'neutral' : 'error'}
          isPulsing={onlineRows.length === nodes.length && nodes.length > 0}
          note={nodes.length ? `${pullCount} pull · ${pushCount} push` : 'add a node to begin'}
        />
        <KpiCell
          label="Fleet CPU"
          value={avgCpu}
          unit="%"
          digits={1}
          state={avgCpu != null ? levelOf(avgCpu) : undefined}
          note={
            peakCpuNode && peakCpuNode.fig.cpu != null
              ? `${totalCores} cores · peak ${peakCpuNode.view.node.name} (${Math.round(peakCpuNode.fig.cpu)}%)`
              : `${totalCores} cores`
          }
        />
        <KpiCell
          label="Fleet memory"
          value={fleetMemPct}
          unit="%"
          digits={1}
          state={fleetMemPct != null ? levelOf(fleetMemPct) : undefined}
          note={totalMemBytes > 0 ? `${size(usedMemBytes)} of ${size(totalMemBytes)}` : 'waiting for samples'}
        />
        <KpiCell
          label="Attention"
          value={attentionCount}
          state={attentionCount > 0 ? 'error' : 'success'}
          note={
            failedUnits > 0
              ? `${failedUnits} failed ${failedUnits === 1 ? 'unit' : 'units'}`
              : strained > 0
                ? `${strained} strained ${strained === 1 ? 'system' : 'systems'}`
                : 'all systems nominal'
          }
        />
      </KpiStrip>

      <section className="beszel-card" aria-label="Systems">
        <header className="beszel-card-head">
          <div className="beszel-card-title-group">
            <h1>Systems</h1>
            <p>{finding}</p>
          </div>
          <div className="beszel-card-controls">
            {updated ? (
              <span className="live-badge">
                <Dot
                  variant={stale ? 'warning' : 'success'}
                  label={stale ? 'Stale' : 'Live'}
                  isPulsing={!stale}
                  tooltip={stale ? 'The hub stopped answering' : 'Refreshed live'}
                />
                <span>
                  {stale ? 'stale, ' : ''}updated {relative(updated, Date.now())}
                </span>
              </span>
            ) : null}
            <SearchInput
              label="Filter systems"
              value={query}
              onChange={(value) => update('q', value || null)}
              placeholder="Filter systems…"
              width={phone ? '100%' : 210}
            />
            {phone ? null : (
              <SegmentedControl label="View mode" value={viewMode} onChange={changeView}>
                <SegmentedControlItem
                  value="table"
                  label={
                    <>
                      <List size={14} aria-hidden="true" />
                      Table
                    </>
                  }
                />
                <SegmentedControlItem
                  value="cards"
                  label={
                    <>
                      <SquaresFour size={14} aria-hidden="true" />
                      Cards
                    </>
                  }
                />
              </SegmentedControl>
            )}
          </div>
        </header>

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
        ) : effectiveMode === 'cards' ? (
          <div className="beszel-card-body">
            <SystemCards rows={shown} />
          </div>
        ) : (
          <Table
            data={shown}
            columns={columns}
            idKey="id"
            label="Systems"
            hasHover
            onRowClick={(row) => navigate(nodeHref(row.view.node.id))}
          />
        )}
      </section>

      <section className="beszel-card" aria-label="Services">
        <header className="beszel-card-head">
          <div className="beszel-card-title-group">
            <h2>Services</h2>
            <p>{services.isPending ? 'Loading units…' : `${units.length} units across fleet · failed pinned first`}</p>
          </div>
          <div className="beszel-card-controls">
            {failedUnits > 0 ? <Badge variant="error" label={`${failedUnits} failed`} /> : null}
            {activeUnits > 0 ? <Badge variant="success" label={`${activeUnits} active`} /> : null}
            <Button label="View all" href="/services" size="sm" />
          </div>
        </header>
        {services.isError ? (
          <div className="beszel-card-body">
            <ErrorPanel what="Could not load services." onRetry={() => services.refetch()} />
          </div>
        ) : services.isPending ? null : (
          <UnitTable rows={unitRows} footer={pager} />
        )}
      </section>
    </>
  );
}
