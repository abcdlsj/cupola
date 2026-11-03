/**
 * The metric names GET /nodes/{id}/series answers for. It must match the
 * hub's seriesAllow list (internal/hub/api.go) and the store's series map
 * (internal/hub/store/store.go), so the UI never asks for a name that would
 * answer 400. Disk fill, inodes and temperatures are current values only.
 */
export const SERIES_METRICS: ReadonlySet<string> = new Set([
  'cpu',
  'mem',
  'load',
  'net_rx',
  'net_tx',
  'disk_r',
  'disk_w',
  'psi_cpu',
  'psi_io',
  'procs',
]);

export function supportsSeries(metric: string): boolean {
  return SERIES_METRICS.has(metric);
}
