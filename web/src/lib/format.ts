const utcTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
const utcSeconds = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const utcDate = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const utcFull = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function clock(ms: number): string {
  return utcTime.format(ms);
}

export function clockSeconds(ms: number): string {
  return utcSeconds.format(ms);
}

export function day(ms: number): string {
  return utcDate.format(ms);
}

export function stamp(ms: number): string {
  return utcFull.format(ms).replace(',', '');
}

export function eventTime(ms: number, now: number): string {
  return dayKey(ms) === dayKey(now) ? clock(ms) : `${day(ms)} ${clock(ms)}`;
}

export function percent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function duration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restMin = minutes % 60;
    return restMin ? `${hours}h ${restMin}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

export function relative(ms: number, now: number): string {
  const delta = Math.max(0, now - ms);
  if (delta < 5000) return 'just now';
  return `${duration(delta / 1000)} ago`;
}

export function uptime(seconds: number): string {
  return seconds > 0 ? duration(seconds) : '—';
}

export function size(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 GB';
  const gib = bytes / 1024 ** 3;
  if (gib >= 1024) return `${(gib / 1024).toFixed(2)} TB`;
  return `${gib.toFixed(gib >= 100 ? 0 : 1)} GB`;
}

export function sizeSmall(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${Math.round(bytes)} B`;
}

export function rate(bps: number): string {
  return `${sizeSmall(bps)}/s`;
}

export function netRate(bps: number): string {
  const bits = bps * 8;
  if (bits >= 1e9) return `${(bits / 1e9).toFixed(2)} Gbit/s`;
  if (bits >= 1e6) return `${(bits / 1e6).toFixed(1)} Mbit/s`;
  if (bits >= 1e3) return `${(bits / 1e3).toFixed(0)} kbit/s`;
  return `${Math.round(bits)} bit/s`;
}

export function load(values: [number, number, number] | number[]): string {
  return values.map((value) => value.toFixed(2)).join(' ');
}

export function usedPct(used: number, total: number): number {
  if (total <= 0) return 0;
  return (used / total) * 100;
}

export function days(value: number): string {
  if (!value) return '—';
  if (value > 365) return 'over a year';
  return `${value.toFixed(0)}d`;
}
