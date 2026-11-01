const utcTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const utcDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});

const utcFull = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "09:18", UTC: the hub stores Unix ms and the UI states its zone once. */
export function clock(ms: number): string {
  return utcTime.format(ms);
}

export function day(ms: number): string {
  return utcDate.format(ms);
}

export function stamp(ms: number): string {
  return utcFull.format(ms).replace(',', '');
}

/** Same-day events show the clock; older ones carry the date. */
export function eventTime(ms: number, now: number): string {
  return dayKey(ms) === dayKey(now) ? clock(ms) : `${day(ms)} ${clock(ms)}`;
}

export function percent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

/** "2 h 14 m", "41 min", "38 s". Durations keep two units at most. */
export function duration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restMin = minutes % 60;
    return restMin ? `${hours} h ${restMin} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} d ${restHours} h` : `${days} d`;
}

/** "2 h 13 min ago", "just now". Always names the baseline. */
export function relative(ms: number, now: number): string {
  const delta = Math.max(0, now - ms);
  if (delta < 5000) return 'just now';
  return `${duration(delta / 1000)} ago`;
}

export function uptime(seconds: number): string {
  return duration(seconds);
}

/** GiB with one decimal below a terabyte, two above it. */
export function size(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

/** Totals read as capacities: "64 GB", "1.86 TB". */
export function capacity(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  return `${Math.round(gb)} GB`;
}

export function rate(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbit/s`;
  return `${Math.round(kbps)} kbit/s`;
}

export function load(values: [number, number, number]): string {
  return values.map((value) => value.toFixed(2)).join(' ');
}

/** Integer percent of a part of a whole, guarding a zero denominator. */
export function usedPct(used: number, total: number): number {
  if (total <= 0) return 0;
  return (used / total) * 100;
}
