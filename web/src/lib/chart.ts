/**
 * Data hues for chart lines, as Astryx data tokens so they follow the theme.
 * SeriesChart resolves them for the canvas; swatches use them directly.
 */
const SERIES = [
  'var(--color-data-categorical-blue)',
  'var(--color-data-categorical-teal)',
  'var(--color-data-categorical-orange)',
  'var(--color-data-categorical-red)',
];

export function seriesColor(index: number): string {
  return SERIES[index % SERIES.length];
}

/** Identity hues for fleet lines: never the status colours. */
export function identityColor(index: number): string {
  const hues = [SERIES[0], SERIES[1], 'var(--color-data-categorical-cyan)'];
  return hues[index % hues.length];
}
