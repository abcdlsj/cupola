import { Clock } from '@phosphor-icons/react';
import { useSearchParams } from 'react-router-dom';

export const RANGES = [
  { id: '1h', label: '1 hour' },
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
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

export function RangeSelect() {
  const [value, setValue] = useRange();
  return (
    <label className="select-wrap">
      <Clock size={15} aria-hidden="true" />
      <span className="sr-only">Chart window</span>
      <select className="select-bare" value={value} onChange={(event) => setValue(event.target.value)}>
        {RANGES.map((range) => (
          <option key={range.id} value={range.id}>
            {range.label}
          </option>
        ))}
      </select>
    </label>
  );
}
