import { describe, expect, it } from 'vitest';
import {
  capacity,
  clock,
  day,
  duration,
  eventTime,
  percent,
  rate,
  relative,
  size,
  uptime,
  usedPct,
} from '../format';

const NOON = Date.UTC(2026, 10, 1, 12, 0, 0);

describe('duration', () => {
  it('keeps two units and never invents precision', () => {
    expect(duration(38)).toBe('38 s');
    expect(duration(41 * 60)).toBe('41 min');
    expect(duration(2 * 3600 + 14 * 60)).toBe('2 h 14 min');
    expect(duration(3 * 86400 + 2 * 3600)).toBe('3 d 2 h');
    expect(duration(-5)).toBe('0 s');
  });
});

describe('relative', () => {
  it('always names the baseline', () => {
    expect(relative(NOON - 2000, NOON)).toBe('just now');
    expect(relative(NOON - 2 * 86400 * 1000, NOON)).toBe('2 d ago');
  });
});

describe('size and capacity', () => {
  it('switches to terabytes above 1024 GiB', () => {
    expect(size(48.4)).toBe('48.4 GB');
    expect(size(1863)).toBe('1.82 TB');
    expect(capacity(64)).toBe('64 GB');
    expect(capacity(4000)).toBe('3.91 TB');
  });
});

describe('figures', () => {
  it('formats percentages and rates with units', () => {
    expect(percent(71.26)).toBe('71%');
    expect(percent(71.26, 1)).toBe('71.3%');
    expect(rate(62400)).toBe('62.4 Mbit/s');
    expect(rate(412)).toBe('412 kbit/s');
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
    expect(uptime(3_564_000)).toBe('41 d 6 h');
  });
});
