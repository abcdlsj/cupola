/** A filter field: one search input with an inline clear control. */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
  width,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number | string;
}) {
  return (
    <span className="search" style={width ? { width } : undefined}>
      <input
        className="input input-search"
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        enterKeyHint="search"
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button type="button" className="search-clear" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange('')}>
          ×
        </button>
      ) : null}
    </span>
  );
}
