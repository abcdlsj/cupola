import type { ReactNode } from 'react';

export function ErrorPanel({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <span className="dot-mark" data-severity="critical" aria-hidden="true" />
      <span>{what}</span>
      <button type="button" className="btn btn-ghost" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
