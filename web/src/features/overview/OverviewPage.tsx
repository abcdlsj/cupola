// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useMemo, useState, type ComponentType } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowsDownUp,
  ArrowsLeftRight,
  ClockClockwise,
  Cpu,
  HardDrive,
  HardDrives,
  Hourglass,
  List,
  Memory,
  SquaresFour,
  Thermometer,
} from '@phosphor-icons/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorPanel, LoadingPage } from '../../components/States';
import { StatusDot } from '../../components/StatusPill';
import { Pager } from '../../components/Pager';
import { UnitTable } from '../../components/UnitTable';
import { useFleet, useFleetServices } from '../../data/queries';
import type { NodeView } from '../../data/types';
import { nodeFigures, type NodeFigures } from '../../lib/fleet';
import { netRate, relative, uptime } from '../../lib/format';
import { pageOf, usePageSize } from '../../lib/usePageSize';
import { Figure, levelOf, Meter, useIsPhone } from '../../ui/kit';
import {
  Badge,
  Button,
  EmptyState,
  HStack,
  Link,
  StatusDot as Dot,
  Table,
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
type SortKey = 'strain' | 'name' | 'cpu' | 'mem' | 'disk' | 'load' | 'net' | 'temp' | 'uptime';

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
        case 'load':
          return row.fig.load ? row.fig.load[0] : -1;
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

function LoadTrio({ fig, online }: { fig: NodeFigures; online: boolean }) {
  if (!fig.load) return <Figure value={null} />;
  const max = Math.max(...fig.load);
  const pct = (max / Math.max(1, fig.cores)) * 100;
  const variant = !online ? 'neutral' : levelOf(pct);
  return (
    <span className="load-trio">
      <Dot variant={variant === 'neutral' ? 'neutral' : variant} label={`Load ${fig.load[0].toFixed(2)}`} />
      {fig.load.map((val, idx) => (
        <span key={idx}>{val >= 10 ? val.toFixed(1) : val.toFixed(2)}</span>
      ))}
    </span>
  );
}

function SortHeader({
  label,
  Icon,
  col,
  active,
  dir,
  onSort,
  hideSort = false,
}: {
  label: string;
  Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  col: SortKey;
  active: SortKey;
  dir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  hideSort?: boolean;
}) {
  const isActive = active === col;
  return (
    <button
      type="button"
      className="sort-btn"
      data-active={isActive ? 'true' : undefined}
      onClick={() => onSort(col)}
    >
      <Icon size={15} aria-hidden={true} />
      <span>{label}</span>
      {hideSort ? null : isActive ? (
        dir === 'asc' ? (
          <ArrowUp size={13} aria-hidden="true" />
        ) : (
          <ArrowDown size={13} aria-hidden="true" />
        )
      ) : (
        <ArrowsDownUp size={13} style={{ opacity: 0.4 }} aria-hidden="true" />
      )}
    </button>
  );
}

/** Beszel SystemCard: tinted header + aligned icon/label/meter rows. */
function SystemCards({ rows }: { rows: SystemRow[] }) {
  return (
    <div className="sys-cards">
      {rows.map(({ id, view, fig }) => {
        const role = roleOf(view);
        const upText = fig.online && view.health.uptime_sec > 0 ? uptime(view.health.uptime_sec) : '—';
        return (
          <Link href={nodeHref(view.node.id)} key={id} className="sys-card">
            <div className="sys-card-head">
              <div className="sys-card-id">
                <StatusDot status={view.health.status} />
                <span className="sys-card-name">{view.node.name}</span>
              </div>
              {role ? <span className="role-tag">{role}</span> : null}
            </div>

            <div className="sys-card-rows">
              <span className="sys-card-ico"><Cpu size={15} aria-hidden="true" /></span>
              <span className="sys-card-lbl">CPU:</span>
              <Meter value={fig.cpu} label={`${view.node.name} CPU`} />

              <span className="sys-card-ico"><Memory size={15} aria-hidden="true" /></span>
              <span className="sys-card-lbl">Memory:</span>
              <Meter value={fig.mem} label={`${view.node.name} memory`} />

              <span className="sys-card-ico"><HardDrive size={15} aria-hidden="true" /></span>
              <span className="sys-card-lbl">Disk:</span>
              <Meter value={fig.disk} label={`${view.node.name} disk`} />

              <span className="sys-card-ico"><Hourglass size={15} aria-hidden="true" /></span>
              <span className="sys-card-lbl">Load:</span>
              <LoadTrio fig={fig} online={fig.online} />

              <span className="sys-card-ico"><ArrowsLeftRight size={15} aria-hidden="true" /></span>
              <span className="sys-card-lbl">Net:</span>
              <span className="nowrap">{fig.net != null ? netRate(fig.net) : '—'}</span>

              {fig.temp != null ? (
                <>
                  <span className="sys-card-ico"><Thermometer size={15} aria-hidden="true" /></span>
                  <span className="sys-card-lbl">Temp:</span>
                  <span>{Math.round(fig.temp)}°C</span>
                </>
              ) : null}

              <span className="sys-card-ico"><ClockClockwise size={15} aria-hidden="true" /></span>
              <span className="sys-card-lbl">Uptime:</span>
              <span>{upText}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * The home screen — authentic Beszel layout:
 * 1. One spacious All Systems centerpiece card with icon headers, chunky meters
 *    and Table/Cards toggle (no generic 4-box SaaS KPI clutter).
 * 2. Systemd Services card below (failed pinned first).
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

  const onlineCount = allRows.filter(({ fig }) => fig.online).length;
  const failedUnits = units.filter((unit) => unit.active_state === 'failed').length;
  const activeUnits = units.filter((unit) => unit.active_state === 'active').length;

  const stale = Boolean(fleet.data?.stale);
  const updated = fleet.data?.updated;
  const pg = pageOf(units.length, pageSize, page - 1);
  const unitRows = units.slice(pg.index * pageSize, pg.index * pageSize + pageSize);

  const columns: Array<TableColumn<SystemRow>> = [
    {
      key: 'name',
      header: <SortHeader label="System" Icon={HardDrives} col="name" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '18%',
      renderCell: ({ view }) => {
        const role = roleOf(view);
        return (
          <HStack gap={2.5} vAlign="center">
            <StatusDot status={view.health.status} />
            <Link href={nodeHref(view.node.id)} maxLines={1} className="node-link">
              {view.node.name}
            </Link>
            {role ? <span className="role-tag">{role}</span> : null}
          </HStack>
        );
      },
    },
    {
      key: 'cpu',
      header: <SortHeader label="CPU" Icon={Cpu} col="cpu" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '16%',
      renderCell: ({ view, fig }) => <Meter value={fig.cpu} label={`${view.node.name} CPU`} />,
    },
    {
      key: 'memory',
      header: <SortHeader label="Memory" Icon={Memory} col="mem" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '16%',
      renderCell: ({ view, fig }) => <Meter value={fig.mem} label={`${view.node.name} memory`} />,
    },
    {
      key: 'disk',
      header: <SortHeader label="Disk" Icon={HardDrive} col="disk" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '16%',
      renderCell: ({ view, fig }) => <Meter value={fig.disk} label={`${view.node.name} root filesystem`} />,
    },
    {
      key: 'load',
      header: <SortHeader label="Load Avg" Icon={Hourglass} col="load" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '13%',
      renderCell: ({ fig }) => <LoadTrio fig={fig} online={fig.online} />,
    },
    {
      key: 'net',
      header: <SortHeader label="Net" Icon={ArrowsLeftRight} col="net" active={sortKey} dir={sortDir} onSort={toggleSort} />,
      width: '10%',
      renderCell: ({ fig }) =>
        fig.net != null ? (
          <span
            className="nowrap"
            title={fig.rx != null && fig.tx != null ? `In ${netRate(fig.rx)} · Out ${netRate(fig.tx)}` : undefined}
          >
            {netRate(fig.net)}
          </span>
        ) : (
          <Figure value={null} />
        ),
    },
    {
      key: 'temp',
      header: (
        <SortHeader label="Temp" Icon={Thermometer} col="temp" active={sortKey} dir={sortDir} onSort={toggleSort} hideSort />
      ),
      width: '5%',
      renderCell: ({ fig }) => (fig.temp != null ? <span className="nowrap">{Math.round(fig.temp)}°C</span> : <Figure value={null} />),
    },
    {
      key: 'uptime',
      header: (
        <SortHeader label="Uptime" Icon={ClockClockwise} col="uptime" active={sortKey} dir={sortDir} onSort={toggleSort} hideSort />
      ),
      width: '6%',
      align: 'end',
      renderCell: ({ view, fig }) => (
        <span className="nowrap muted">
          {fig.online && view.health.uptime_sec > 0 ? uptime(view.health.uptime_sec) : '—'}
        </span>
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
      <section className="beszel-card" aria-label="Systems">
        <header className="beszel-card-head">
          <div className="beszel-card-title-group">
            <h1>All Systems</h1>
            <p>
              {nodes.length === 0
                ? 'No systems registered'
                : onlineCount === nodes.length
                  ? `${onlineCount} online`
                  : `${onlineCount} of ${nodes.length} online`}
            </p>
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
                <span>{stale ? 'stale, ' : ''}{relative(updated, Date.now())}</span>
              </span>
            ) : null}
            <SearchInput
              label="Filter systems"
              value={query}
              onChange={(value) => update('q', value || null)}
              placeholder="Filter systems…"
              width={phone ? '100%' : 240}
            />
            {phone ? null : (
              <SegmentedControl label="View mode" value={viewMode} onChange={changeView}>
                <SegmentedControlItem
                  value="table"
                  label={
                    <>
                      <List size={15} aria-hidden="true" />
                      Table
                    </>
                  }
                />
                <SegmentedControlItem
                  value="cards"
                  label={
                    <>
                      <SquaresFour size={15} aria-hidden="true" />
                      Grid
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
          <SystemCards rows={shown} />
        ) : (
          <div className="table-systems">
            <Table
              data={shown}
              columns={columns}
              idKey="id"
              label="Systems"
              hasHover
              onRowClick={(row) => navigate(nodeHref(row.view.node.id))}
            />
          </div>
        )}
      </section>

      <section className="beszel-card" aria-label="Services">
        <header className="beszel-card-head">
          <div className="beszel-card-title-group">
            <h2>Systemd Services</h2>
            <p>
              {services.isPending
                ? 'Loading units…'
                : `${units.length} ${units.length === 1 ? 'unit' : 'units'} across ${nodes.length} ${nodes.length === 1 ? 'system' : 'systems'}`}
            </p>
          </div>
          <div className="beszel-card-controls">
            {failedUnits > 0 ? <Badge variant="error" label={`${failedUnits} failed`} /> : null}
            {activeUnits > 0 ? <Badge variant="success" label={`${activeUnits} active`} /> : null}
            <Button label="View all" href="/services" size="sm" />
          </div>
        </header>
        {services.isError ? (
          <ErrorPanel what="Could not load services." onRetry={() => services.refetch()} />
        ) : services.isPending ? null : (
          <UnitTable rows={unitRows} footer={pager} />
        )}
      </section>
    </>
  );
}
