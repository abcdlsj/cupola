import type { ReactNode } from 'react';
import { Badge, HStack, StatusDot as Dot, Text } from '../ui/primitives';
import type { NodeStatus, Severity } from '../data/types';

type DotTone = 'success' | 'warning' | 'error' | 'neutral';

const STATUS_TONE: Record<NodeStatus, DotTone> = {
  healthy: 'success',
  degraded: 'warning',
  offline: 'error',
  unknown: 'neutral',
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  healthy: 'Up',
  degraded: 'Degraded',
  offline: 'Down',
  unknown: 'Waiting',
};

const SEVERITY_TONE: Record<Severity, 'error' | 'warning' | 'neutral'> = {
  critical: 'error',
  warning: 'warning',
  info: 'neutral',
};

export function statusLabel(status: NodeStatus): string {
  return STATUS_LABEL[status] ?? String(status);
}

export function statusTone(status: NodeStatus): DotTone {
  return STATUS_TONE[status] ?? 'neutral';
}

export function severityTone(severity: Severity): 'error' | 'warning' | 'neutral' {
  return SEVERITY_TONE[severity] ?? 'neutral';
}

/** A node's state as a coloured dot; the label is for screen readers and the tip. */
export function StatusDot({ status }: { status: NodeStatus }) {
  const label = statusLabel(status);
  return <Dot variant={statusTone(status)} label={label} tooltip={label} />;
}

/** Dot and word, for headers where the state needs to be read, not just seen. */
export function StatusPill({ status }: { status: NodeStatus }) {
  const label = statusLabel(status);
  return (
    <HStack gap={1.5} vAlign="center">
      <Dot variant={statusTone(status)} label={label} />
      <Text type="supporting">{label}</Text>
    </HStack>
  );
}

export function SeverityPill({ severity, children }: { severity: Severity; children?: ReactNode }) {
  return <Badge variant={severityTone(severity)} label={children ?? severity} />;
}

export function RunPill({ ok }: { ok: boolean }) {
  return <Badge variant={ok ? 'success' : 'error'} label={ok ? 'OK' : 'Failed'} />;
}
