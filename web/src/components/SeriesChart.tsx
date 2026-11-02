import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { clock, clockSeconds, day, netRate, percent, rate } from '../lib/format';
import type { SeriesPoint } from '../data/types';

export interface ChartMarker {
  at: number;
  label: string;
}

export type ChartUnit = 'percent' | 'rate' | 'net' | 'load';

/** One thin line. The colour comes from a data hue, never from the chrome. */
export interface ChartSeries {
  label: string;
  points: SeriesPoint[];
  color: string;
}

const AXIS_FONT = '12px "Public Sans", sans-serif';
const AXIS_INK = '#8a8c92';
const GRID_INK = '#222224';
const CURSOR_INK = '#4a8ad6';

function formatValue(value: number, unit: ChartUnit): string {
  switch (unit) {
    case 'rate':
      return rate(value);
    case 'net':
      return netRate(value);
    case 'load':
      return value.toFixed(2);
    default:
      return percent(value, 0);
  }
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const factor of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (value <= factor * base) return factor * base;
  }
  return 10 * base;
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
 * Time series in the data-terminal idiom: thin coloured lines on the surface,
 * faint horizontal gridlines, no y-axis line, no fill, no animation. Several
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
    const width = element.clientWidth || 600;
    const allPoints = series.flatMap((entry) => entry.points);
    const spanHours = allPoints.length > 1 ? (Math.max(...allPoints.map((p) => p.ts)) - Math.min(...allPoints.map((p) => p.ts))) / 3_600_000 : 1;
    const yMax = maxValue ?? (unit === 'percent' ? 100 : niceMax(dataMax(series) * 1.1));
    const ySplits = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(yMax * fraction * 100) / 100);

    const options: uPlot.Options = {
      width,
      height: element.clientHeight || height,
      padding: [14, 28, 0, 8],
      legend: { show: false },
      cursor: {
        show: true,
        x: true,
        y: false,
        points: { show: true, size: 5, width: 1.5, stroke: () => AXIS_INK, fill: () => '#171719' },
      },
      scales: {
        x: { time: true },
        y: { auto: false, range: [0, yMax] },
      },
      axes: [
        {
          stroke: AXIS_INK,
          font: AXIS_FONT,
          grid: { show: false },
          ticks: { stroke: GRID_INK, width: 1, size: 4 },
          gap: 8,
          size: 30,
          space: 120,
          values: (_u, splits) =>
            splits.map((value) =>
              spanHours <= 0.5 ? clockSeconds(value * 1000) : spanHours <= 26 ? clock(value * 1000) : day(value * 1000),
            ),
        },
        {
          stroke: AXIS_INK,
          font: AXIS_FONT,
          size: 56,
          grid: { stroke: GRID_INK, width: 1 },
          ticks: { show: false },
          splits: () => ySplits,
          values: (_u, splits) => splits.map((value) => formatValue(value, unitRef.current)),
        },
      ],
      series: [
        {},
        ...series.map((entry) => ({
          stroke: entry.color,
          width: 1.5,
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
              ctx.strokeStyle = '#3a3a3e';
              ctx.setLineDash([3, 4]);
              ctx.beginPath();
              ctx.moveTo(left, alertY);
              ctx.lineTo(right, alertY);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.fillStyle = AXIS_INK;
              ctx.font = AXIS_FONT;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'bottom';
              ctx.fillText(formatValue(limit, unitRef.current), left + 4, alertY - 4);
            }
            const event = markerRef.current;
            if (event) {
              const x = u.valToPos(event.at / 1000, 'x', true);
              if (x >= left - 1 && x <= right + 1) {
                ctx.strokeStyle = CURSOR_INK;
                ctx.beginPath();
                ctx.moveTo(x, top);
                ctx.lineTo(x, bottom);
                ctx.stroke();
                ctx.fillStyle = CURSOR_INK;
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
    // Created once per metric page; data, marker and threshold are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const pointCount = Math.max(...series.map((entry) => entry.points.length), 0);
    if (pointCount === 0) return;
    instance.setData(toAligned(series));
    instance.setScale('y', { min: 0, max: maxValue ?? (unit === 'percent' ? 100 : niceMax(dataMax(series) * 1.1)) });
  }, [series, unit, maxValue]);

  return (
    <div className="chart-stack">
      <div className="chart" ref={host} style={{ height }} role="img" aria-label={label} data-testid="series-chart" />
      {tip ? (
        <div className="cursor-readout" style={{ left: tip.left }}>
          <span className="cursor-time">{clock(tip.at)}</span>
          {tip.rows.map((row) => (
            <span className="cursor-row" key={row.label}>
              <span className="legend-swatch" style={{ background: row.color }} aria-hidden="true" />
              <span className="cursor-label">{row.label}</span>
              <span className="cursor-value">{row.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
