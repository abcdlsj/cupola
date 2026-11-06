import { percent } from '../lib/format';

/**
 * Where a meter turns amber and red. 65 % is a normal Linux memory or disk
 * reading, so a healthy fleet stays in the accent hue and only a real breach
 * takes a warning colour.
 */
export const METER_WARN = 75;
export const METER_CRIT = 90;

export type MeterLevel = 'ok' | 'warn' | 'crit';

export function meterLevel(value: number): MeterLevel {
  if (value >= METER_CRIT) return 'crit';
  if (value >= METER_WARN) return 'warn';
  return 'ok';
}

/**
 * A percentage as a figure and a thin rounded bar. Green under 65 %, amber to
 * 90 %, red above. A missing reading prints a dash and an empty track; zero
 * prints 0 %.
 */
export function Meter({
  value,
  label,
  digits = 0,
  tone,
  text,
}: {
  value: number | null | undefined;
  label?: string;
  digits?: number;
  /** A neutral meter (data, not health) uses the first series hue. */
  tone?: 'neutral';
  /** printed instead of the percentage, e.g. a per-core figure over a whole-machine bar */
  text?: string;
}) {
  const missing = value == null || !Number.isFinite(value);
  const clamped = missing ? 0 : Math.max(0, Math.min(100, value));
  const level = missing ? 'none' : tone === 'neutral' ? 'neutral' : meterLevel(value);
  return (
    <span className="meter" data-level={level}>
      <span className="meter-value">{missing ? '—' : text ?? percent(value, digits)}</span>
      <span
        className="meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={missing ? undefined : Math.round(clamped)}
      >
        <span className="meter-fill" style={{ width: `${clamped}%` }} />
      </span>
    </span>
  );
}
