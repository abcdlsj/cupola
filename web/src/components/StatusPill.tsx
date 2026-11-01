import type { NodeStatus, Severity } from '../data/types';

const STATUS_TONE: Record<NodeStatus, string> = {
  healthy: 'positive',
  degraded: 'warning',
  offline: 'negative',
  unknown: 'neutral',
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  offline: 'Offline',
  unknown: 'Waiting',
};

const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'negative',
  warning: 'warning',
  info: 'neutral',
};

export function StatusPill({ status }: { status: NodeStatus }) {
  const label = STATUS_LABEL[status] ?? String(status);
  return (
    <span className="pill" data-tone={STATUS_TONE[status] ?? 'neutral'}>
      <span className="dot" aria-hidden="true" />
      {label}
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
