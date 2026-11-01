import type { ReactNode } from 'react';
import type { NodeStatus, Severity } from '../data/schema';

const STATUS_TONE: Record<NodeStatus, string> = {
  healthy: 'positive',
  degraded: 'warning',
  offline: 'negative',
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  offline: 'Offline',
};

const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'negative',
  warning: 'warning',
  info: 'neutral',
};

export function StatusPill({ status }: { status: NodeStatus }) {
  return (
    <span className="pill" data-tone={STATUS_TONE[status]}>
      <span className="dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function SeverityPill({ severity, children }: { severity: Severity; children?: ReactNode }) {
  return (
    <span className="pill" data-tone={SEVERITY_TONE[severity]}>
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
