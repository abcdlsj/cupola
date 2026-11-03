import { percent, rate } from './format';

/** What a chart axis counts; shared with SeriesChart. */
export type ChartUnit = 'percent' | 'rate' | 'net' | 'load' | 'bytes';

/** Finer than 1-2-4-8: a 10 MB window gets 3 MB steps, not 4 MB doubling to 16. */
const BYTE_LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 256, 320, 384, 512, 640, 768, 1024];

/** Binary steps (1, 1.5, 2 … 1024 × kB/MB/GB) so byte gridlines stay round. */
export function niceBinaryStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const unit = 1024 ** Math.max(0, Math.floor(Math.log(raw) / Math.log(1024)));
  const scaled = raw / unit;
  const step = BYTE_LADDER.find((candidate) => scaled <= candidate) ?? 1024;
  return step * unit;
}

/**
 * The top of the y scale: four equal steps, so the five gridlines carry round
 * labels. Percent never goes past 100.
 */
export function niceMax(value: number, unit: ChartUnit): number {
  if (!Number.isFinite(value) || value <= 0) return unit === 'percent' ? 100 : 1;
  // A tenth of headroom keeps the peak off the top gridline.
  const raw = (value * 1.1) / 4;
  // Byte charts are read in binary units, so their steps are binary too.
  if (unit === 'rate' || unit === 'bytes') return niceBinaryStep(raw) * 4;
  if (unit === 'percent') {
    // Whole percents only, and fine enough that a 10 % window is not a 20 % axis.
    const step = [1, 2, 2.5, 3, 4, 5, 10, 15, 20, 25].find((candidate) => raw <= candidate) ?? 25;
    return Math.min(100, step * 4);
  }
  const base = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (raw <= factor * base) return factor * base * 4;
  }
  return 40 * base;
}

/** Axis labels: short, no trailing zeros; the readout keeps full precision. */
export function tickValue(value: number, unit: ChartUnit, step: number): string {
  const digits = step >= 1 || value === 0 ? 0 : step >= 0.1 ? 1 : 2;
  switch (unit) {
    case 'rate':
      return rate(value);
    case 'net': {
      const bits = value * 8;
      if (bits >= 1e9) return `${+(bits / 1e9).toFixed(2)} Gb/s`;
      if (bits >= 1e6) return `${+(bits / 1e6).toFixed(1)} Mb/s`;
      if (bits >= 1e3) return `${Math.round(bits / 1e3)} kb/s`;
      return `${Math.round(bits)} b/s`;
    }
    case 'load':
      return value.toFixed(digits);
    case 'bytes':
      return sizeTick(value, step);
    default:
      return percent(value, digits);
  }
}

/** One unit for every byte gridline, chosen from the step so the labels match. */
export function sizeTick(value: number, step: number): string {
  const units: Array<[string, number]> = [
    ['TB', 1024 ** 4],
    ['GB', 1024 ** 3],
    ['MB', 1024 ** 2],
    ['kB', 1024],
  ];
  const [label, scale] = units.find(([, unit]) => step >= unit) ?? ['B', 1];
  const perStep = step / scale;
  const digits = Number.isInteger(perStep) ? 0 : perStep >= 1 ? 1 : 2;
  return `${Number((value / scale).toFixed(digits))} ${label}`;
}

