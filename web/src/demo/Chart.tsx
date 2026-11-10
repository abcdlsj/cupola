import { useEffect, useRef, type RefObject } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useTheme } from '@astryxdesign/core/theme';

/**
 * uPlot reads concrete colours from an options object, so every hue comes out of
 * the active Astryx theme through useTheme rather than a literal here.
 */
function resolve(probe: HTMLElement, token: string): string {
  probe.style.color = `var(${token})`;
  const value = getComputedStyle(probe).color;
  probe.style.color = '';
  return value || 'currentColor';
}

/** A hover readout: the timestamp, then one line per series with its value. */
function buildTooltip(host: HTMLElement, unit: string) {
  const tip = document.createElement('div');
  tip.dataset.chartTooltip = '';
  Object.assign(tip.style, {
    position: 'absolute',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 90ms linear',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-background-popover)',
    boxShadow: 'var(--shadow-med)',
    font: '12px/1.5 "IBM Plex Mono", monospace',
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap',
    zIndex: '2',
  } satisfies Partial<CSSStyleDeclaration>);
  tip.hidden = true;
  host.style.position = 'relative';
  host.appendChild(tip);

  return {
    update(time: string, rows: { label: string; value: number; color: string }[], x: number, y: number) {
      tip.hidden = false;
      tip.replaceChildren();
      const head = document.createElement('div');
      head.textContent = time;
      head.style.color = 'var(--color-text-secondary)';
      head.style.marginBottom = '4px';
      tip.appendChild(head);

      for (const row of rows) {
        const line = document.createElement('div');
        Object.assign(line.style, { display: 'flex', gap: '8px', alignItems: 'center' });

        const dot = document.createElement('span');
        Object.assign(dot.style, {
          width: '8px',
          height: '8px',
          borderRadius: '999px',
          background: row.color,
          flex: 'none',
        });
        const label = document.createElement('span');
        label.textContent = row.label;
        label.style.color = 'var(--color-text-secondary)';
        label.style.minWidth = '64px';
        const value = document.createElement('span');
        value.textContent = `${row.value.toFixed(1)}${unit ? ` ${unit}` : ''}`;
        value.style.marginLeft = 'auto';
        value.style.fontVariantNumeric = 'tabular-nums';

        line.append(dot, label, value);
        tip.appendChild(line);
      }

      const width = tip.offsetWidth;
      const height = tip.offsetHeight;
      const left = Math.min(Math.max(x + 12, 4), Math.max(host.clientWidth - width - 4, 4));
      const top = y - height - 12 > 0 ? y - height - 12 : y + 16;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
      tip.style.opacity = '1';
    },
    hide() {
      tip.style.opacity = '0';
      tip.hidden = true;
    },
    destroy() {
      tip.remove();
    },
  };
}

export function Chart({
  host,
  timestamps,
  series,
  height = 180,
  yMax = 100,
  unit = '%',
}: {
  host: RefObject<HTMLDivElement | null>;
  timestamps: number[];
  series: { label: string; data: number[] }[];
  height?: number;
  yMax?: number;
  unit?: string;
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

    const tooltip = buildTooltip(element, unit);

    const build = () => {
      const width = element.clientWidth || 320;
      const options: uPlot.Options = {
        width,
        height,
        padding: [8, 12, 0, 0],
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
                return i % 2 === 0
                  ? `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`
                  : '';
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
        hooks: {
          setCursor: [
            (self) => {
              const index = self.cursor.idx;
              if (index == null || self.cursor.left == null || self.cursor.left < 0) {
                tooltip.hide();
                return;
              }
              const stamp = new Date(self.data[0][index] * 1000);
              const rows = series.map((line, i) => ({
                label: line.label,
                value: self.data[i + 1]?.[index] ?? 0,
                color: hues[i % hues.length],
              }));
              tooltip.update(
                `${stamp.getHours()}:${String(stamp.getMinutes()).padStart(2, '0')}`,
                rows,
                self.cursor.left,
                self.cursor.top ?? 0,
              );
            },
          ],
        },
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
      tooltip.destroy();
    };
  }, [host, timestamps, series, mode, token, height, yMax, unit]);

  return null;
}
