import { useEffect, useRef, type RefObject } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useTheme } from '@astryxdesign/core/theme';

/**
 * uPlot reads concrete colours from an options object, so every hue comes out
 * of the active Astryx theme through useTheme rather than a literal here.
 */
function resolve(probe: HTMLElement, token: string): string {
  probe.style.color = `var(${token})`;
  const value = getComputedStyle(probe).color;
  probe.style.color = '';
  return value || 'currentColor';
}

export function Chart({
  host,
  timestamps,
  series,
  height = 180,
  yMax = 100,
}: {
  host: RefObject<HTMLDivElement | null>;
  timestamps: number[];
  series: { label: string; data: number[] }[];
  height?: number;
  yMax?: number;
}) {
  const plot = useRef<uPlot | null>(null);
  const { mode, token } = useTheme();

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.opacity = '0';
    document.body.appendChild(probe);

    const text = resolve(probe, '--color-text-secondary');
    const grid = resolve(probe, '--color-border');
    const hues = [
      '--color-data-categorical-blue',
      '--color-data-categorical-teal',
      '--color-data-categorical-green',
    ].map((name) => resolve(probe, name));
    probe.remove();

    const build = () => {
      const width = element.clientWidth || 320;
      const options: uPlot.Options = {
        width,
        height,
        padding: [8, 8, 0, 0],
        legend: { show: false },
        cursor: { y: false, points: { size: 6 } },
        scales: { x: { time: false }, y: { range: [0, yMax] } },
        axes: [
          {
            stroke: text,
            grid: { show: false },
            ticks: { show: false },
            font: '11px "IBM Plex Mono", monospace',
            values: (_u, splits) =>
              splits.map((s, i) => {
                const t = new Date(s * 1000);
                return i % 2 === 0 ? `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}` : '';
              }),
          },
          {
            stroke: text,
            grid: { stroke: grid, width: 1 },
            ticks: { show: false },
            size: 34,
            font: '11px "IBM Plex Mono", monospace',
            values: (_u, splits) => splits.map((s) => `${s}`),
          },
        ],
        series: [
          {},
          ...series.map((line, index) => ({
            label: line.label,
            stroke: hues[index % hues.length],
            width: 1.5,
            points: { show: false },
            fill: `color-mix(in srgb, ${hues[index % hues.length]} 12%, transparent)`,
          })),
        ],
      };
      plot.current?.destroy();
      plot.current = new uPlot(
        options,
        [timestamps, ...series.map((line) => line.data)] as uPlot.AlignedData,
        element,
      );
    };

    build();
    const observer = new ResizeObserver(build);
    observer.observe(element);
    return () => {
      observer.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
  }, [host, timestamps, series, mode, token, height, yMax]);

  return null;
}
