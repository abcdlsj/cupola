/**
 * Data hues for chart lines, as tokens so they follow the theme. SeriesChart
 * resolves them for the canvas; swatches use them directly.
 */
const SERIES = ['var(--data-1)', 'var(--data-2)', 'var(--data-3)', 'var(--data-4)'];

export function seriesColor(index: number): string {
  return SERIES[index % SERIES.length];
}

/** Identity hues for fleet lines: never the status colours. */
export function identityColor(index: number): string {
  return SERIES[index % SERIES.length];
}
