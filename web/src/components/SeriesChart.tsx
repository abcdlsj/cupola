import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { clock, day, netRate, percent, rate } from '../lib/format';
import type { SeriesPoint } from '../data/types';

export interface ChartMarker {
  at: number;
  label: string;
}

export type ChartUnit = 'percent' | 'rate' | 'net' | 'load';

const AXIS_FONT = '12px "Public Sans", sans-serif';
const AXIS_INK = '#8a8c92';
const GRID_INK = '#222224';

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

/** uPlot wants columns, the series is a list of rows. */
function toAligned(points: SeriesPoint[]): uPlot.AlignedData {
  return [points.map((point) => Math.round(point.ts / 1000)), points.map((point) => point.avg)] as uPlot.AlignedData;
}

/**
 * One time series: 2px line in --chart-1, five faint gridlines, no y-axis line,
 * no legend, no fill, no animation. An optional dashed threshold and a 1px
 * event marker are drawn on the canvas.
 */
export function SeriesChart({
  points,
  unit,
  threshold,
  marker,
  label,
  maxValue,
  height = 232,
}: {
  points: SeriesPoint[];
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
  const [tip, setTip] = useState<{ left: number; text: string } | null>(null);

  useEffect(() => {
    markerRef.current = marker;
    thresholdRef.current = threshold;
    unitRef.current = unit;
    chart.current?.redraw();
  }, [marker, threshold, unit]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const spanHours = points.length > 1 ? (points[points.length - 1].ts - points[0].ts) / 3_600_000 : 1;
    const dataMax = Math.max(...points.map((point) => point.avg), 0);
    const yMax = maxValue ?? (unit === 'percent' ? 100 : niceMax(dataMax * 1.1));
    const ySplits = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(yMax * fraction * 100) / 100);

    const options: uPlot.Options = {
      width: element.clientWidth || 600,
      height: element.clientHeight || height,
      padding: [14, 14, 0, 8],
      legend: { show: false },
      cursor: {
        show: true,
        x: true,
        y: false,
        points: { show: true, size: 4, width: 2, stroke: () => '#f2f2f3', fill: () => '#171719' },
      },
      scales: {
        x: { time: true, range: () => [points[0]?.ts ? Math.round(points[0].ts / 1000) : 0, Math.round(Date.now() / 1000)] },
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
          space: 96,
          values: (_u, splits) => splits.map((value) => (spanHours <= 26 ? clock(value * 1000) : day(value * 1000))),
        },
        {
          stroke: AXIS_INK,
          font: AXIS_FONT,
          size: 52,
          grid: { stroke: GRID_INK, width: 1 },
          ticks: { show: false },
          splits: () => ySplits,
          values: (_u, splits) => splits.map((value) => formatValue(value, unitRef.current)),
        },
      ],
      series: [{}, { stroke: '#f2f2f3', width: 2, points: { show: false } }],
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
                ctx.strokeStyle = '#4a8ad6';
                ctx.beginPath();
                ctx.moveTo(x, top);
                ctx.lineTo(x, bottom);
                ctx.stroke();
                ctx.fillStyle = '#4a8ad6';
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
            const value = u.data[1][idx];
            if (at == null || value == null) {
              setTip(null);
              return;
            }
            setTip({
              left: Math.max(0, Math.min(u.cursor.left + 44, u.width - 110)),
              text: `${clock(at * 1000)} · ${formatValue(value, unitRef.current)}`,
            });
          },
        ],
      },
    };

    const instance = new uPlot(options, toAligned(points), element);
    chart.current = instance;
    const observer = new ResizeObserver(() => {
      if (!host.current) return;
      const width = host.current.clientWidth;
      if (width > 0) instance.setSize({ width, height: host.current.clientHeight });
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
    // Created once; data, marker and threshold are applied by the effects above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chart.current?.setData(toAligned(points));
    chart.current?.setScale('y', { min: 0, max: maxValue ?? (unit === 'percent' ? 100 : niceMax(Math.max(...points.map((p) => p.max), 1) * 1.1)) });
  }, [points, unit, maxValue]);

  return (
    <>
      <div className="chart" ref={host} style={{ height }} role="img" aria-label={label} data-testid="series-chart" />
      {tip ? (
        <div className="cursor-readout" style={{ left: tip.left }}>
          {tip.text}
        </div>
      ) : null}
    </>
  );
}
