import type { NodeStatus, Severity } from '../data/types';

const STATUS_TONE: Record<NodeStatus, string> = {
  healthy: 'positive',
  degraded: 'warning',
  offline: 'negative',
  unknown: 'neutral',
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  healthy: 'Up',
  degraded: 'Degraded',
  offline: 'Down',
  unknown: 'Waiting',
};

const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'negative',
  warning: 'warning',
  info: 'neutral',
};

export function statusLabel(status: NodeStatus): string {
  return STATUS_LABEL[status] ?? String(status);
}

/** A node's state as a coloured dot; the label is for screen readers and the tooltip. */
export function StatusDot({ status }: { status: NodeStatus }) {
  const label = statusLabel(status);
  return <span className="status-dot" data-tone={STATUS_TONE[status] ?? 'neutral'} role="img" aria-label={label} title={label} />;
}

/** Dot and word, for headers where the state needs to be read, not just seen. */
export function StatusPill({ status }: { status: NodeStatus }) {
  return (
    <span className="status" data-tone={STATUS_TONE[status] ?? 'neutral'}>
      <span className="status-dot" data-tone={STATUS_TONE[status] ?? 'neutral'} aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

export function SeverityPill({ severity, children }: { severity: Severity; children?: React.ReactNode }) {
  return (
    <span className="pill" data-tone={SEVERITY_TONE[severity] ?? 'neutral'}>
      {children ?? severity}
    </span>
  );
}

export function RunPill({ ok }: { ok: boolean }) {
  return (
    <span className="pill" data-tone={ok ? 'positive' : 'negative'}>
      {ok ? 'OK' : 'Failed'}
    </span>
  );
}
