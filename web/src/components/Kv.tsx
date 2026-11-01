import type { ReactNode } from 'react';

export function Kv({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="kv">
      {rows.map((row) => (
        <div className="kv-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
