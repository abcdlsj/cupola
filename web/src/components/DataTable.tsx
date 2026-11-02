import type { ReactNode } from 'react';
import { Fig } from './Fig';

export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="table-wrap">
      <table className="table" aria-label={label}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr>{children}</tr>
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Th({ children, num = false }: { children: ReactNode; num?: boolean }) {
  return (
    <th scope="col" className={num ? 'num' : undefined}>
      {children}
    </th>
  );
}

export type Cell = 'primary' | 'key' | 'field';

export function Td({
  children,
  num = false,
  cell,
  label,
  className,
}: {
  children: ReactNode;
  num?: boolean;
  cell?: Cell;
  label?: string;
  className?: string;
}) {
  return (
    <td
      className={[num ? 'num' : '', className ?? ''].join(' ').trim() || undefined}
      data-cell={cell}
      data-label={label}
    >
      {num ? <Fig>{children}</Fig> : children}
    </td>
  );
}
