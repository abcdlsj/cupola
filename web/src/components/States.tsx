import type { ReactNode } from 'react';
import { PageHeader, Panel } from './Panel';

/** Loading keeps the final layout: labels and headers render, values are bars. */
export function PageSkeleton({ title, finding }: { title: string; finding?: string }) {
  return (
    <>
      <PageHeader title={title} finding={finding ?? <span className="skeleton" style={{ display: 'inline-block', width: 320, height: 10 }} />} />
      <div className="kpi-row" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((cell) => (
          <div className="kpi-cell" key={cell}>
            <div className="skeleton" style={{ width: 64 }} />
            <div className="skeleton" style={{ width: 84, height: 20, marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="row" aria-hidden="true">
        <div className="span-7">
          <Panel title="Fleet horizon">
            <div className="skeleton-block" />
          </Panel>
        </div>
        <div className="span-5">
          <Panel title="Attention">
            <div className="skeleton-block" style={{ height: 168 }} />
          </Panel>
        </div>
      </div>
    </>
  );
}

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
