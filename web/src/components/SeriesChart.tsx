import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { clock, clockSeconds, day, netRate, percent, rate, size } from '../lib/format';
import type { SeriesPoint } from '../data/types';
import { cssColor, useResolvedTheme } from '../lib/theme';

export interface ChartMarker {
  at: number;
  label: string;
}

import { niceMax, tickValue, type ChartUnit } from '../lib/axis';

export type { ChartUnit };

/** uPlot paints a flat translucent area under each line; no gradients. */
// Ten percent: enough to read the shape, not enough to make a colour field
// out of ten stacked charts.
const FILL_ALPHA = '2e';

/** One thin line. The colour comes from a data hue, never from the chrome. */
export interface ChartSeries {
  label: string;
  points: SeriesPoint[];
  color: string;
}

const AXIS_FONT = '11px "Figtree Variable", Figtree, system-ui, sans-serif';

/** Monotone-ish curves, the way Beszel draws its metrics; uPlot keeps the knots on the samples. */
const spline = uPlot.paths.spline?.();

/** Chart chrome comes from the theme tokens; read once per chart build. */
function inks() {
  return {
    axis: cssColor('var(--muted)'),
    grid: cssColor('var(--border)'),
    cursor: cssColor('var(--accent)'),
    threshold: cssColor('var(--muted)'),
    surface: cssColor('var(--card)'),
  };
}

function formatValue(value: number, unit: ChartUnit): string {
  switch (unit) {
    case 'rate':
      return rate(value);
    case 'net':
      return netRate(value);
    case 'load':
      return value.toFixed(2);
    case 'bytes':
      return size(value);
    default:
      return percent(value, 0);
  }
}

/** Applies alpha to a resolved hex or rgb() colour; anything else is left alone. */
function withAlpha(color: string, alpha: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color + alpha;
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  return rgb ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${(parseInt(alpha, 16) / 255).toFixed(3)})` : color;
}

function scaleMax(series: ChartSeries[], unit: ChartUnit, maxValue?: number): number {
  if (maxValue != null) return niceMax(maxValue, unit);
  return unit === 'percent' ? 100 : niceMax(dataMax(series), unit);
}

function longest(points: SeriesPoint[]): number {
  return points.length;
}

/** uPlot wants columns; every series is a list of rows. */
function toAligned(series: ChartSeries[]): uPlot.AlignedData {
  const reference = series.reduce((best, current) => (longest(current.points) >= longest(best.points) ? current : best), series[0] ?? { points: [] as SeriesPoint[] });
  const columns: uPlot.AlignedData = [reference.points.map((point) => Math.round(point.ts / 1000))];
  for (const entry of series) {
    const bySecond = new Map<number, number>();
    for (const point of entry.points) bySecond.set(Math.round(point.ts / 1000), point.avg);
    columns.push(reference.points.map((point) => bySecond.get(Math.round(point.ts / 1000)) ?? null));
  }
  return columns as uPlot.AlignedData;
}

function dataMax(series: ChartSeries[]): number {
  let max = 0;
  for (const entry of series) {
    for (const point of entry.points) if (point.max > max) max = point.max;
  }
  return max;
}

/**
 * Time series: thin coloured curves over a flat 18 % area of the same hue,
 * four faint horizontal gridlines, no y-axis line, no animation. Several
 * lines share one crosshair; the readout names each series.
 */
export function SeriesChart({
  series,
  unit,
  threshold,
  marker,
  label,
  maxValue,
  height = 232,
}: {
  series: ChartSeries[];
  unit: ChartUnit;
  threshold?: number;
  marker?: ChartMarker;
  label: string;
  maxValue?: number;
  height?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  const markerRef = useRef<ChartMarker | undefined>(marker);
  const thresholdRef = useRef<number | undefined>(threshold);
  const unitRef = useRef<ChartUnit>(unit);
  const seriesRef = useRef<ChartSeries[]>(series);
  const theme = useResolvedTheme();
  const [tip, setTip] = useState<{ left: number; rows: Array<{ label: string; color: string; value: string }>; at: number } | null>(null);

  useEffect(() => {
    markerRef.current = marker;
    thresholdRef.current = threshold;
    unitRef.current = unit;
    seriesRef.current = series;
    chart.current?.redraw();
  }, [marker, threshold, unit, series]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const ink = inks();
    const width = element.clientWidth || 600;
    const allPoints = series.flatMap((entry) => entry.points);
    const spanHours = allPoints.length > 1 ? (Math.max(...allPoints.map((p) => p.ts)) - Math.min(...allPoints.map((p) => p.ts))) / 3_600_000 : 1;
    const yMax = scaleMax(series, unit, maxValue);

    const options: uPlot.Options = {
      width,
      height: element.clientHeight || height,
      // room on the right for the last time label, which is centred on the edge
      padding: [12, 34, 0, 4],
      legend: { show: false },
      cursor: {
        show: true,
        x: true,
        y: false,
        points: { show: true, size: 5, width: 1.5, stroke: () => ink.axis, fill: () => ink.surface },
      },
      scales: {
        x: { time: true },
        y: { auto: false, range: [0, yMax] },
      },
      axes: [
        {
          stroke: ink.axis,
          font: AXIS_FONT,
          grid: { show: false },
          ticks: { show: false },
          gap: 6,
          size: 26,
          space: 96,
          values: (_u, splits) =>
            splits.map((value) =>
              spanHours <= 0.5 ? clockSeconds(value * 1000) : spanHours <= 26 ? clock(value * 1000) : day(value * 1000),
            ),
        },
        {
          stroke: ink.axis,
          font: AXIS_FONT,
          gap: 6,
          // as wide as the widest label, so "320 Mb/s" is never clipped
          size: (u, values) => {
            if (!values?.length) return 40;
            const { ctx } = u;
            const previous = ctx.font;
            ctx.font = AXIS_FONT; // CSS pixels: the width below is in CSS pixels too
            const widest = Math.max(...values.map((value) => ctx.measureText(String(value)).width));
            ctx.font = previous;
            // A phone gives the plot about 260 px; a 90 px axis would eat a
            // third of it, so the gutter is capped and uPlot trims the label.
            return Math.min(Math.ceil(widest) + 14, u.width < 420 ? 54 : 90);
          },
          grid: { stroke: ink.grid, width: 1 },
          ticks: { show: false },
          // quarters of the current scale, recomputed when the window rescales
          splits: (u) => [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round((u.scales.y.max ?? yMax) * fraction * 100) / 100),
          values: (_u, splits) => splits.map((value) => tickValue(value, unitRef.current, splits.length > 1 ? splits[1] - splits[0] : value)),
        },
      ],
      series: [
        {},
        ...series.map((entry, index) => ({
          stroke: cssColor(entry.color),
          width: index === 0 ? 1.5 : 1.25,
          paths: spline,
          // Only the first series fills. Two translucent areas stack into a
          // third colour nobody chose, so a comparison chart reads as one
          // shape with a second line over it.
          fill: index === 0 ? withAlpha(cssColor(entry.color), FILL_ALPHA) : undefined,
          points: { show: false },
        })),
      ],
      hooks: {
        draw: [
          (u) => {
            const { ctx } = u;
            const left = u.valToPos(u.scales.x.min ?? 0, 'x', true);
            const right = u.valToPos(u.scales.x.max ?? 0, 'x', true);
            const top = u.valToPos(u.scales.y.max ?? yMax, 'y', true);
            const bottom = u.valToPos(0, 'y', true);
            ctx.save();
            ctx.lineWidth = 1;
            const limit = thresholdRef.current;
            if (limit != null) {
              const alertY = u.valToPos(limit, 'y', true);
              ctx.strokeStyle = ink.threshold;
              ctx.globalAlpha = 0.6;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(left, alertY);
              ctx.lineTo(right, alertY);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.globalAlpha = 1;
              ctx.fillStyle = ink.axis;
              ctx.font = `${Math.round(11 * uPlot.pxRatio)}px ${AXIS_FONT.replace('11px ', '')}`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'bottom';
              ctx.fillText(tickValue(limit, unitRef.current, limit), left + 4, alertY - 4);
            }
            const event = markerRef.current;
            if (event) {
              const x = u.valToPos(event.at / 1000, 'x', true);
              if (x >= left - 1 && x <= right + 1) {
                ctx.strokeStyle = ink.cursor;
                ctx.beginPath();
                ctx.moveTo(x, top);
                ctx.lineTo(x, bottom);
                ctx.stroke();
                ctx.fillStyle = ink.cursor;
                ctx.textBaseline = 'top';
                const onRight = x > (left + right) / 2;
                ctx.textAlign = onRight ? 'right' : 'left';
                ctx.fillText(event.label, x + (onRight ? -6 : 6), top + 2);
              }
            }
            ctx.restore();
          },
        ],
        setCursor: [
          (u) => {
            const idx = u.cursor.idx;
            if (idx == null || u.cursor.left == null || u.cursor.left < 0) {
              setTip(null);
              return;
            }
            const at = u.data[0][idx];
            if (at == null) {
              setTip(null);
              return;
            }
            const rows = seriesRef.current.map((entry, index) => {
              const value = u.data[index + 1]?.[idx];
              return {
                label: entry.label,
                color: entry.color,
                value: value == null ? '—' : formatValue(value, unitRef.current),
              };
            });
            if (rows.every((row) => row.value === '—')) {
              setTip(null);
              return;
            }
            setTip({ left: Math.max(0, Math.min(u.cursor.left + 18, u.width - 170)), rows, at: at * 1000 });
          },
        ],
      },
    };

    const instance = new uPlot(options, toAligned(series), element);
    chart.current = instance;
    const observer = new ResizeObserver(() => {
      if (!host.current) return;
      const nextWidth = host.current.clientWidth;
      if (nextWidth > 0) instance.setSize({ width: nextWidth, height: host.current.clientHeight });
    });
    observer.observe(element);
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => instance.redraw());
    }
    return () => {
      observer.disconnect();
      instance.destroy();
      chart.current = null;
    };
    // Created once per metric page and theme; data, marker and threshold are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const pointCount = Math.max(...series.map((entry) => entry.points.length), 0);
    if (pointCount === 0) return;
    instance.setData(toAligned(series));
    instance.setScale('y', { min: 0, max: scaleMax(series, unit, maxValue) });
  }, [series, unit, maxValue]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={host} style={{ height }} role="img" aria-label={label} data-testid="series-chart" />
      {tip ? (
        <div className="chart-readout" style={{ left: tip.left }}>
          <span className="muted">{clock(tip.at)}</span>
          {tip.rows.map((row) => (
            <span className="chart-readout-row" key={row.label}>
              <span className="legend-dot" style={{ background: row.color }} aria-hidden="true" />
              <span className="name">{row.label}</span>
              <span className="value">{row.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
