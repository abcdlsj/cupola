import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { clock, day } from '../lib/format';

/** uPlot wants columns, the series is a list of rows. */
function toAligned(points: [number, number][]): uPlot.AlignedData {
  return [points.map((point) => point[0]), points.map((point) => point[1])] as uPlot.AlignedData;
}

export interface ChartMarker {
  at: number;
  label: string;
}

const AXIS_FONT = '12px "Public Sans", sans-serif';
const AXIS_INK = '#8a8c92';
const GRID_INK = '#222224';

/**
 * The CPU chart. uPlot with a custom theme: one 2px series in --chart-1, five
 * faint gridlines, no y-axis line, no legend, no fill, no animation. A dashed
 * 80% reference and the event that matters are drawn on the canvas.
 */
export function CpuChart({
  points,
  now,
  marker,
  label,
}: {
  points: [number, number][];
  now: number;
  marker?: ChartMarker;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  const markerRef = useRef<ChartMarker | undefined>(marker);
  const nowRef = useRef(now);
  const [tip, setTip] = useState<{ left: number; text: string } | null>(null);

  useEffect(() => {
    markerRef.current = marker;
    chart.current?.redraw();
  }, [marker]);

  useEffect(() => {
    nowRef.current = now;
    chart.current?.setScale('x', { min: points[0]?.[0] ?? 0, max: Math.round(now / 1000) });
  }, [now, points]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const spanHours = points.length > 1 ? (points[points.length - 1][0] - points[0][0]) / 3600 : 1;
    const options: uPlot.Options = {
      width: element.clientWidth || 600,
      height: element.clientHeight || 232,
      padding: [14, 14, 0, 8],
      legend: { show: false },
      cursor: {
        show: true,
        x: true,
        y: false,
        points: { show: true, size: 4, width: 2, stroke: () => '#f2f2f3', fill: () => '#171719' },
      },
      scales: {
        x: { time: true, range: () => [points[0]?.[0] ?? 0, Math.round(nowRef.current / 1000)] },
        y: { auto: false, range: [0, 100] },
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
          values: (_u, splits) =>
            splits.map((value) => (spanHours <= 26 ? clock(value * 1000) : day(value * 1000))),
        },
        {
          stroke: AXIS_INK,
          font: AXIS_FONT,
          size: 44,
          grid: { stroke: GRID_INK, width: 1 },
          ticks: { show: false },
          splits: () => [0, 25, 50, 75, 100],
          values: (_u, splits) => splits.map((value) => `${value}%`),
        },
      ],
      series: [{}, { stroke: '#f2f2f3', width: 2, points: { show: false } }],
      hooks: {
        draw: [
          (u) => {
            const { ctx } = u;
            const left = u.valToPos(u.scales.x.min ?? 0, 'x', true);
            const right = u.valToPos(u.scales.x.max ?? 0, 'x', true);
            const top = u.valToPos(100, 'y', true);
            const bottom = u.valToPos(0, 'y', true);
            ctx.save();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#3a3a3e';
            ctx.setLineDash([3, 4]);
            const alertY = u.valToPos(80, 'y', true);
            ctx.beginPath();
            ctx.moveTo(left, alertY);
            ctx.lineTo(right, alertY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = AXIS_INK;
            ctx.font = AXIS_FONT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText('80% alert', left + 4, alertY - 4);

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
              left: Math.max(0, Math.min(u.cursor.left + 44, u.width - 96)),
              text: `${clock(at * 1000)} · ${value.toFixed(1)}%`,
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
    // The chart is created once; data, marker and now are applied by the effects above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chart.current?.setData(toAligned(points));
  }, [points]);

  return (
    <>
      <div className="chart" ref={host} role="img" aria-label={label} data-testid="cpu-chart" />
      {tip ? (
        <div className="cursor-readout" style={{ left: tip.left }}>
          {tip.text}
        </div>
      ) : null}
    </>
  );
}
