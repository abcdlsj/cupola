/** A filter field: one search input, its label announced, no visible label. */
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
    </span>
  );
}
