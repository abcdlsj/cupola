/**
 * The metric names GET /nodes/{id}/series actually answers for. Two Go lists
 * have to agree before a name works: the route's allowlist (internal/hub/
 * alerts.go, metricNames) and the store's series map. Today only these five
 * survive both, so the UI never asks for a name that would answer 400 or 500.
 *
 * The store keeps net_rx, net_tx, disk_r and disk_w columns, but the route
 * refuses them; disk, inode and temp pass the route and fail in the store.
 * Widening the Go allowlist is what turns the rest on; nothing here is fake.
 */
export const SERIES_METRICS: ReadonlySet<string> = new Set([
  'cpu',
  'mem',
  'load',
  'psi_cpu',
  'psi_io',
]);

export function supportsSeries(metric: string): boolean {
  return SERIES_METRICS.has(metric);
}
