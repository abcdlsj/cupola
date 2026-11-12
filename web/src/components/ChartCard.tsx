import type { ReactNode } from 'react';
import { SeriesChart, type ChartMarker, type ChartSeries, type ChartUnit } from './SeriesChart';

/**
 * One metric in a chart grid: title and one line of context on the left, the
 * current reading on the right, the chart, and a swatch legend when there is
 * more than one series. Loading and empty windows keep the frame's height.
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
  empty = 'No sample in this window yet.',
  height = 152,
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
        <div className="chart-card-heading">
          <h3 className="chart-card-title">{title}</h3>
          <p className="chart-card-desc">{desc}</p>
        </div>
        {now != null ? <span className="chart-card-now">{now}</span> : null}
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
