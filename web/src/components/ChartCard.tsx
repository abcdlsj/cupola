import type { ReactNode } from 'react';
import { SeriesChart, type ChartMarker, type ChartSeries, type ChartUnit } from './SeriesChart';

/**
 * Beszel-style spacious ChartCard: bold title and description on the left,
 * current reading on the right, tall luminous area chart, and optional swatch legend.
 */
export function ChartCard({
  title,
  desc,
  now,
  series,
  unit,
  threshold,
  marker,
  maxValue,
  pending = false,
  empty = 'Waiting for enough records to display.',
  height = 206,
  legend,
}: {
  title: string;
  desc: ReactNode;
  now?: ReactNode;
  series: ChartSeries[];
  unit: ChartUnit;
  threshold?: number;
  marker?: ChartMarker;
  maxValue?: number;
  pending?: boolean;
  empty?: string;
  height?: number;
  /** current value per series, printed beside its swatch */
  legend?: ReactNode[];
}) {
  // one sample is a dot, not a curve: wait for the second before drawing axes
  const hasData = series.some((entry) => entry.points.length > 1);
  return (
    <section className="chart-card" aria-label={title}>
      <header className="chart-card-head">
        <div className="chart-card-title-row">
          <h3 className="chart-card-title">{title}</h3>
          {now != null ? <span className="chart-card-now">{now}</span> : null}
        </div>
        <p className="chart-card-desc">{desc}</p>
      </header>
      {hasData ? (
        <SeriesChart
          series={series}
          unit={unit}
          threshold={threshold}
          marker={marker}
          maxValue={maxValue}
          label={title}
          height={height}
        />
      ) : (
        <div className="chart-empty" style={{ height }}>
          {pending ? 'Loading this window from the hub…' : empty}
        </div>
      )}
      {series.length > 1 ? (
        <div className="chart-legend">
          {series.map((entry, index) => (
            <span className="chart-legend-item" key={entry.label}>
              <span className="legend-dot" style={{ background: entry.color }} aria-hidden="true" />
              <span>{entry.label}</span>
              {legend?.[index] != null ? <span className="code">{legend[index]}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
