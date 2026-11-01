import { describe, expect, it } from 'vitest';
import {
  clock,
  day,
  duration,
  eventTime,
  netRate,
  percent,
  rate,
  relative,
  size,
  sizeSmall,
  uptime,
  usedPct,
} from '../format';

const NOON = Date.UTC(2026, 10, 1, 12, 0, 0);

describe('duration', () => {
  it('keeps two units and never invents precision', () => {
    expect(duration(38)).toBe('38s');
    expect(duration(41 * 60)).toBe('41m');
    expect(duration(2 * 3600 + 14 * 60)).toBe('2h 14m');
    expect(duration(3 * 86400 + 2 * 3600)).toBe('3d 2h');
    expect(duration(2 * 86400 + 22 * 3600)).toBe('2d 22h');
    expect(duration(-5)).toBe('0s');
  });
});

describe('relative', () => {
  it('always names the baseline', () => {
    expect(relative(NOON - 2000, NOON)).toBe('just now');
    expect(relative(NOON - 2 * 86400 * 1000, NOON)).toBe('2d ago');
  });
});

describe('byte figures', () => {
  it('formats bytes, small bytes and rates', () => {
    expect(size(52 * 1024 ** 3)).toBe('52.0 GB');
    expect(size(2 * 1024 ** 4)).toBe('2.00 TB');
    expect(sizeSmall(1536)).toBe('2 kB');
    expect(rate(1024 * 1024)).toBe('1 MB/s');
    expect(netRate(1_000_000)).toBe('8.0 Mbit/s');
  });
});

describe('figures', () => {
  it('formats percentages and guard rails', () => {
    expect(percent(71.26)).toBe('71%');
    expect(percent(71.26, 1)).toBe('71.3%');
    expect(usedPct(58.1, 64).toFixed(2)).toBe('90.78');
    expect(usedPct(1, 0)).toBe(0);
  });
});

describe('time', () => {
  it('states UTC once and uses the clock for the same day', () => {
    expect(clock(Date.UTC(2026, 10, 1, 4, 2, 0))).toBe('04:02');
    expect(day(Date.UTC(2026, 10, 1, 4, 2, 0))).toBe('Nov 1');
    expect(eventTime(Date.UTC(2026, 10, 1, 3, 56, 0), Date.UTC(2026, 10, 1, 4, 12, 0))).toBe('03:56');
    expect(eventTime(Date.UTC(2026, 9, 31, 23, 34, 0), Date.UTC(2026, 10, 1, 4, 12, 0))).toBe('Oct 31 23:34');
    expect(uptime(3_564_000)).toBe('41d 6h');
  });
});
