/**
 * Data hues for chart lines. They mirror --series-1..4 in tokens.css; canvas
 * needs a resolved colour, so read the variables once at runtime.
 */
const FALLBACK = ['#5b9ed6', '#4fae94', '#d9a441', '#e5566f'];

let cache: string[] | null = null;

export function seriesColor(index: number): string {
  if (!cache) {
    const style = typeof window === 'undefined' ? null : getComputedStyle(document.documentElement);
    cache = FALLBACK.map(
      (fallback, position) => style?.getPropertyValue(`--series-${position + 1}`).trim() || fallback,
    );
  }
  return cache[index % cache.length];
}

/** Identity hues for fleet lines: never the status colours. */
export function identityColor(index: number): string {
  const hues = ['var(--series-1)', 'var(--series-2)', 'var(--chart-1)'];
  return hues[index % hues.length];
}
