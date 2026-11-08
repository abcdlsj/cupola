import { Panel } from './Panel';

/**
 * Loading states keep the shape of the screen they replace. The frame — card,
 * title, column heads, labels — is the real thing, so nothing jumps when the
 * data lands; only the figures are bars. A single grey block per card is what
 * these are here to avoid: it tells you a number is coming, not where it goes.
 */

function Bar({ w, h = 10, r = 3 }: { w: number | string; h?: number; r?: number }) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r }} />;
}

function Track({ w }: { w: number | string }) {
  return (
    <span className="skeleton-track" style={{ width: w }}>
      <span className="skeleton-fill" />
    </span>
  );
}

function CardHeadSkeleton({ desc = 340 }: { desc?: number }) {
  return (
    <header className="panel-head">
      <div className="panel-heading">
        <span className="skeleton" style={{ width: 150, height: 26, borderRadius: 4 }} />
        <span className="skeleton" style={{ width: desc, height: 11, marginTop: 8 }} />
      </div>
      <div className="panel-meta">
        <span className="skeleton" style={{ width: 190, height: 34, borderRadius: 999 }} />
        <span className="skeleton" style={{ width: 58, height: 14 }} />
      </div>
    </header>
  );
}

/** One system card: dot, name, role, four meters, the meta line. */
function SystemCardSkeleton() {
  return (
    <div className="syscard" aria-hidden="true">
      <div className="syscard-head">
        <span className="skeleton" style={{ width: 7, height: 7, borderRadius: 999 }} />
        <Bar w={62} h={12} />
        <Bar w={38} h={10} />
      </div>
      <div className="syscard-body">
        {[0, 1, 2, 3].map((row) => (
          <div className="syscard-row" key={row}>
            <span className="skeleton" style={{ width: 16, height: 16, borderRadius: 4 }} />
            <Bar w={44} h={10} />
            <span className="syscard-skeleton-value">
              <Bar w={46} h={11} />
              <Track w="100%" />
            </span>
          </div>
        ))}
      </div>
      <div className="syscard-meta">
        <Bar w="68%" h={9} />
      </div>
    </div>
  );
}

/** A table's own frame with its column heads, then rows of the right height. */
function TableSkeleton({
  columns,
  rows,
  dot = false,
}: {
  columns: Array<{ label: string; w?: string; num?: boolean }>;
  rows: number;
  dot?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className={`table ${dot ? 'unit-table' : ''}`} aria-hidden="true">
        <thead>
          <tr>
            {dot ? <th className="unit-dot" /> : null}
            {columns.map((column, index) => (
              <th key={index} className={column.num ? 'num' : undefined} style={{ width: column.w }}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, index) => (
            <tr key={index}>
              {dot ? (
                <td className="unit-dot">
                  <span className="skeleton" style={{ width: 7, height: 7, borderRadius: 999 }} />
                </td>
              ) : null}
              {columns.map((column, cell) => (
                <td key={cell} className={column.num ? 'num' : undefined}>
                  {cell === 0 ? <Bar w={132} h={11} /> : <Bar w={column.num ? 42 : 76} h={11} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SystemsSkeleton() {
  return (
    <>
      <section className="panel" aria-hidden="true">
        <CardHeadSkeleton desc={300} />
        <div className="sysgrid" style={{ padding: 16 }}>
          {[0, 1, 2].map((card) => (
            <SystemCardSkeleton key={card} />
          ))}
        </div>
      </section>
      <ServicesPanelSkeleton rows={7} />
    </>
  );
}

export function ServicesPanelSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Panel
      title="Services"
      desc="Loading units…"
      flush
      meta={
        <>
          <span className="chips">
            {[44, 58, 66, 70].map((width, index) => (
              <Bar key={index} w={width} h={12} />
            ))}
          </span>
          <Bar w={52} h={12} />
        </>
      }
    >
      <TableSkeleton
        dot
        columns={[
          { label: 'Unit', w: '50%' },
          { label: 'System', w: '20%' },
          { label: 'State', w: '12%' },
          { label: 'Restarts', w: '9%', num: true },
          { label: 'Changed', w: '9%', num: true },
        ]}
        rows={rows}
      />
    </Panel>
  );
}

export function ServicesSkeleton() {
  return (
    <section className="panel" aria-hidden="true">
      <CardHeadSkeleton desc={340} />
      <TableSkeleton
        dot
        columns={[
          { label: 'Unit', w: '44%' },
          { label: 'System', w: '16%' },
          { label: 'State', w: '12%' },
          { label: 'Sub state', w: '10%' },
          { label: 'Restarts', w: '9%', num: true },
          { label: 'Changed', w: '9%', num: true },
        ]}
        rows={12}
      />
    </section>
  );
}

export function AppsSkeleton() {
  return (
    <section className="panel" aria-hidden="true">
      <CardHeadSkeleton desc={380} />
      <div className="app-list">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="app-row" key={index}>
            <span className="skeleton" style={{ width: 34, height: 34, borderRadius: 8 }} />
            <span className="app-main">
              <Bar w={index % 2 === 0 ? 104 : 132} h={12} />
              <Bar w={index % 2 === 0 ? 190 : 150} h={9} />
            </span>
            <span className="app-state">
              <Bar w={62} h={18} r={999} />
            </span>
            <span className="app-meta">
              <Bar w={148} h={9} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AlertsSkeleton() {
  return (
    <section className="panel" aria-hidden="true">
      <CardHeadSkeleton desc={420} />
      <div className="kpi-row" data-count="3">
        {['Firing', 'Rules', 'Deliveries'].map((label) => (
          <div className="kpi-cell" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">
              <Bar w={28} h={22} />
            </div>
            <div className="kpi-sub">
              <Bar w={78} h={9} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EventsSkeleton() {
  return (
    <section className="panel" aria-hidden="true">
      <CardHeadSkeleton desc={420} />
      <div className="event-list">
        {[0, 1].map((group) => (
          <div key={group}>
            <div className="event-kind-head">
              <span className="skeleton" style={{ width: 12, height: 12 }} />
              <Bar w={64} h={12} />
              <Bar w={58} h={18} r={999} />
              <span className="event-kind-count">
                <Bar w={110} h={9} />
              </span>
            </div>
            {[0, 1, 2].map((row) => (
              <div className="event-row" key={row}>
                <Bar w={44} h={10} />
                <Bar w={56} h={10} />
                <Bar w={54} h={18} r={999} />
                <Bar w={row === 0 ? 300 : 220} h={11} />
                <Bar w={48} h={10} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The node head: back arrow, name, status, labels, the facts row, the range. */
export function NodeSkeleton() {
  return (
    <section className="panel node-head" aria-hidden="true">
      <div className="node-head-main">
        <div className="node-title-line">
          <span className="skeleton" style={{ width: 28, height: 28, borderRadius: 999 }} />
          <span className="skeleton" style={{ width: 150, height: 26, borderRadius: 4 }} />
          <span className="skeleton" style={{ width: 74, height: 20, borderRadius: 999 }} />
          <span className="skeleton" style={{ width: 68, height: 20, borderRadius: 999 }} />
        </div>
        <dl className="node-facts">
          {[86, 96, 120, 140, 150, 92].map((width, index) => (
            <div className="node-fact" key={index}>
              <Bar w={Math.round(width * 0.42)} h={9} />
              <Bar w={width} h={11} />
            </div>
          ))}
        </dl>
      </div>
      <div className="node-head-tools">
        <span className="skeleton" style={{ width: 116, height: 34, borderRadius: 999 }} />
      </div>
    </section>
  );
}

/** A chart card: title, description, current figure, the plot. */
export function ChartGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="chart-grid" aria-hidden="true">
      {Array.from({ length: cards }, (_, index) => (
        <section className="panel chart-card" key={index}>
          <header className="chart-card-head">
            <div className="panel-heading">
              <Bar w={96} h={11} />
              <span style={{ marginTop: 7, display: 'block' }}>
                <Bar w={190} h={9} />
              </span>
            </div>
            <Bar w={62} h={16} />
          </header>
          <div className="chart-card-plot">
            <span className="skeleton-plot" />
          </div>
        </section>
      ))}
    </div>
  );
}
