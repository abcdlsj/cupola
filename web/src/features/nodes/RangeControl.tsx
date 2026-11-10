import { useSearchParams } from 'react-router-dom';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';

/** `short` is the segment text (it has to fit a 390 px phone); `label` is prose. */
export const RANGES = [
  { id: '1h', short: '1 h', label: '1 hour' },
  { id: '24h', short: '24 h', label: '24 hours' },
  { id: '7d', short: '7 d', label: '7 days' },
  { id: '30d', short: '30 d', label: '30 days' },
] as const;

const DEFAULT_RANGE = '1h';

/** The chart window lives in the URL (?range=24h) so every node tab and a shared link agree on it. */
export function useRange(): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('range');
  const value = RANGES.some((range) => range.id === raw) ? (raw as string) : DEFAULT_RANGE;
  const set = (next: string) => {
    const copy = new URLSearchParams(params);
    if (next === DEFAULT_RANGE) copy.delete('range');
    else copy.set('range', next);
    setParams(copy, { replace: true });
  };
  return [value, set];
}

/** "1 hour", "24 hours", … for descriptions. */
export function rangeLabel(id: string): string {
  return RANGES.find((range) => range.id === id)?.label ?? id;
}

export function RangeSelect() {
  const [value, setValue] = useRange();
  return (
    <SegmentedControl label="Chart window" size="sm" value={value} onChange={setValue}>
      {RANGES.map((range) => (
        <SegmentedControlItem key={range.id} value={range.id} label={range.short} />
      ))}
    </SegmentedControl>
  );
}
