const RANGES = [
  { id: '1h', label: '1 h' },
  { id: '24h', label: '24 h' },
  { id: '7d', label: '7 d' },
];

export function RangeControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="range" role="group" aria-label="Time range">
      {RANGES.map((range) => (
        <button
          type="button"
          key={range.id}
          className="range-btn"
          aria-pressed={range.id === value}
          onClick={() => onChange(range.id)}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
