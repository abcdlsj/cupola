import { describe, expect, it } from 'vitest';
import { niceMax, niceBinaryStep, sizeTick } from '../axis';

const MB = 1024 ** 2;
const GB = 1024 ** 3;

describe('byte axes', () => {
  // The h2nexus Docker cards charted a 200 MB window as 0.0/0.1/0.2 GB. These
  // pin the step for the sizes that actually turn up on a homelab box.
  it('keeps the step proportional to the window', () => {
    const cases: Array<[number, number, number]> = [
      // window, step, top
      [3 * MB, 1 * MB, 4 * MB],
      [10 * MB, 3 * MB, 12 * MB],
      [12 * MB, 4 * MB, 16 * MB],
      [97 * MB, 32 * MB, 128 * MB],
      [260 * MB, 80 * MB, 320 * MB],
      [1500 * MB, 512 * MB, 2048 * MB],
    ];
    for (const [window, step, top] of cases) {
      expect(niceBinaryStep((window * 1.1) / 4)).toBe(step);
      expect(niceMax(window, 'bytes')).toBe(top);
    }
  });

  it('keeps the peak on the chart without wasting half the height', () => {
    for (const mb of [1, 3, 7, 10, 24, 40, 97, 130, 260, 640, 1500, 4000]) {
      const value = mb * MB;
      const top = niceMax(value, 'bytes');
      expect(top).toBeGreaterThanOrEqual(value);
      expect(top).toBeLessThanOrEqual(value * 1.6);
    }
  });

  it('labels every tick in one unit that matches the step', () => {
    expect(sizeTick(0, 12 * MB)).toBe('0 MB');
    expect(sizeTick(24 * MB, 12 * MB)).toBe('24 MB');
    expect(sizeTick(3 * MB, 3 * MB)).toBe('3 MB');
    expect(sizeTick(512 * 1024, 512 * 1024)).toBe('512 kB');
    expect(sizeTick(1.5 * GB, 1.5 * GB)).toBe('1.5 GB');
    expect(sizeTick(2 * GB, 1.5 * GB)).toBe('2 GB');
  });

  it('gives a small window small steps', () => {
    // 12 MB of container memory must not be charted on a 128 MB step.
    expect(niceMax(12 * MB, 'bytes')).toBe(16 * MB);
    expect(sizeTick(4 * MB, 4 * MB)).toBe('4 MB');
  });
});

describe('percent axes', () => {
  it('only uses whole percents and leaves headroom', () => {
    expect(niceMax(10, 'percent')).toBe(12);
    expect(niceMax(78, 'percent')).toBe(100);
    expect(niceMax(2.5, 'percent')).toBe(4);
    expect(niceMax(100, 'percent')).toBe(100);
  });
});
