/**
 * Data hues for chart lines, as CSS variables so they follow the theme.
 * SeriesChart resolves them for the canvas; swatches use them directly.
 */
export function seriesColor(index: number): string {
  return `var(--series-${(index % 4) + 1})`;
}

/** Identity hues for fleet lines: never the status colours. */
export function identityColor(index: number): string {
  const hues = ['var(--series-1)', 'var(--series-2)', 'var(--chart-1)'];
  return hues[index % hues.length];
}
