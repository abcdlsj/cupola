import { useState, type ComponentType } from 'react';
import {
  Bell,
  CaretDown,
  CaretRight,
  Cube,
  Desktop,
  HardDrive,
  HardDrives,
  PlayCircle,
  TerminalWindow,
  WifiHigh,
} from '@phosphor-icons/react';
import { useSearchParams } from 'react-router-dom';
import { SeverityPill, severityTone } from '../../components/StatusPill';
import { ErrorPanel, LoadingRows } from '../../components/States';
import { useEvents } from '../../data/queries';
import type { Event, Severity } from '../../data/types';
import { eventTime, relative } from '../../lib/format';
import { groupEvents, type EventGroup } from '../../lib/events';
import { useIsPhone } from '../../ui/kit';
import { EmptyState, Link, StatusDot } from '../../ui/primitives';
import { Select } from '../../ui/controls';

const ALL = 'all';
const KINDS = ['node', 'service', 'container', 'system', 'network', 'action', 'disk'];
const SEVERITIES: Severity[] = ['info', 'warning', 'critical'];

const KIND_LABEL: Record<string, string> = {
  node: 'Node',
  service: 'Service',
  container: 'Container',
  system: 'System',
  network: 'Network',
  action: 'Action',
  disk: 'Disk',
  agent: 'Agent',
};

const KIND_ICON: Record<string, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  node: HardDrives,
  service: TerminalWindow,
  container: Cube,
  system: Desktop,
  network: WifiHigh,
  action: PlayCircle,
  disk: HardDrive,
};

const SEVERITY_LABEL: Record<Severity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;
const kindIcon = (kind: string) => KIND_ICON[kind] ?? Bell;

interface KindGroup {
  kind: string;
  groups: EventGroup[];
  count: number;
  worst: Severity;
  newest: number;
}

function groupByKind(groups: EventGroup[]): KindGroup[] {
  const buckets = new Map<string, EventGroup[]>();
  for (const group of groups) {
    const list = buckets.get(group.latest.kind) ?? [];
    list.push(group);
    buckets.set(group.latest.kind, list);
  }
  const out: KindGroup[] = [];
  for (const [kind, list] of buckets) {
    let worst: Severity = 'info';
    let count = 0;
    let newest = 0;
    for (const group of list) {
      count += group.count;
      newest = Math.max(newest, group.latest.ts);
      if ((SEVERITY_RANK[group.latest.severity] ?? 3) < (SEVERITY_RANK[worst] ?? 3)) {
        worst = group.latest.severity;
      }
    }
    out.push({ kind, groups: list, count, worst, newest });
  }
  return out.sort((a, b) => (SEVERITY_RANK[a.worst] ?? 3) - (SEVERITY_RANK[b.worst] ?? 3) || b.count - a.count);
}

interface FeedRow {
  id: string;
  event: Event;
  group?: EventGroup;
  occurrence?: boolean;
}

function rowsOf(groups: EventGroup[], open: ReadonlySet<number>): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const group of groups) {
    const head = group.latest;
    if (group.count === 1) {
      rows.push({ id: String(head.id), event: head });
      continue;
    }
    rows.push({ id: String(head.id), event: head, group });
    if (open.has(head.id)) {
      for (const event of group.events.slice(1)) rows.push({ id: String(event.id), event, occurrence: true });
    }
  }
  return rows;
}

function Mono({ children, secondary }: { children: string; secondary?: boolean }) {
  return <span className={secondary ? 'code muted nowrap' : 'code nowrap'}>{children}</span>;
}

export function EventsList({
  nodeId,
  title = 'Events',
  desc,
  level = 2,
  compact = false,
}: {
  nodeId?: string;
  title?: string;
  desc?: string;
  level?: 1 | 2;
  compact?: boolean;
}) {
  const phone = useIsPhone();
  const [params, setParams] = useSearchParams();
  const [severity, setSeverity] = useState(params.get('severity') ?? '');
  const [kind, setKind] = useState(params.get('kind') ?? '');
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string> | null>(null);
  const query = useEvents({
    node: nodeId,
    severity: severity || undefined,
    kind: kind || undefined,
    q: params.get('q') ?? undefined,
    limit: compact ? 8 : 100,
  });
  const now = Date.now();

  const apply = (nextSeverity: string, nextKind: string) => {
    const next = new URLSearchParams(params);
    if (nextSeverity) next.set('severity', nextSeverity);
    else next.delete('severity');
    if (nextKind) next.set('kind', nextKind);
    else next.delete('kind');
    setParams(next, { replace: true });
  };

  const events = query.data ?? [];
  const groups = groupEvents(events);
  const kinds = groupByKind(groups);
  const folded = events.length - groups.length;

  const defaultFolded = (): ReadonlySet<string> => {
    const critical = kinds.filter((entry) => entry.worst === 'critical');
    const opened = critical.length > 0 ? critical : kinds.slice(0, 1);
    return new Set(kinds.filter((entry) => !opened.includes(entry)).map((entry) => entry.kind));
  };

  const isFolded = (entry: KindGroup) => (collapsed === null ? defaultFolded().has(entry.kind) : collapsed.has(entry.kind));

  const toggleKind = (entry: KindGroup) => {
    setCollapsed((current) => {
      const next = new Set(current ?? defaultFolded());
      if (next.has(entry.kind)) next.delete(entry.kind);
      else next.add(entry.kind);
      return next;
    });
  };

  const toggle = (id: number) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fold = (row: FeedRow) => {
    const { event, group } = row;
    if (!group) return <span className="event-fold" aria-hidden="true" />;
    const expanded = open.has(event.id);
    return (
      <button
        type="button"
        className="event-fold"
        aria-label={`${expanded ? 'Hide' : 'Show'} ${group.count} occurrences of ${event.message}`}
        aria-expanded={expanded}
        onClick={() => toggle(event.id)}
      >
        {expanded ? <CaretDown size={14} aria-hidden="true" /> : <CaretRight size={14} aria-hidden="true" />}
      </button>
    );
  };

  const message = (row: FeedRow) => {
    const { event, group } = row;
    return (
      <span className="event-message">
        <Link href={`/events/${event.id}`} tooltip={event.message}>
          {event.message}
        </Link>
        {group ? <span className="role-tag code">{`×${group.count}`}</span> : null}
      </span>
    );
  };

  const blocks = (rows: FeedRow[]) => (
    <div className="event-blocks">
      {rows.map((row) => (
        <div className={row.occurrence ? 'event-block is-occurrence' : 'event-block'} key={row.id}>
          <div className="event-block-main">
            {row.group ? fold(row) : null}
            {message(row)}
          </div>
          <div className="event-block-meta" style={row.occurrence ? { paddingLeft: 26 } : undefined}>
            {row.occurrence ? null : <SeverityPill severity={row.event.severity} />}
            {row.occurrence ? null : (
              <Link href={`/nodes/${row.event.node_id}/events`} className="role-tag code">
                {row.event.node_id}
              </Link>
            )}
            <Mono secondary>{eventTime(row.event.ts, now)}</Mono>
            <span>{relative(row.event.ts, now)}</span>
          </div>
        </div>
      ))}
    </div>
  );

  const filters = compact ? null : (
    <>
      <Select
        label="Severity"
        isLabelHidden
        width={150}
        value={severity || ALL}
        options={[{ value: ALL, label: 'All severities' }, ...SEVERITIES.map((value) => ({ value, label: SEVERITY_LABEL[value] }))]}
        onChange={(value) => {
          const next = value === ALL ? '' : value;
          setSeverity(next);
          apply(next, kind);
        }}
      />
      <Select
        label="Kind"
        isLabelHidden
        width={150}
        value={kind || ALL}
        options={[{ value: ALL, label: 'All kinds' }, ...KINDS.map((value) => ({ value, label: kindLabel(value) }))]}
        onChange={(value) => {
          const next = value === ALL ? '' : value;
          setKind(next);
          apply(severity, next);
        }}
      />
    </>
  );

  const summary = `${events.length} ${events.length === 1 ? 'event' : 'events'}${
    folded > 0 ? ` · ${groups.length} ${groups.length === 1 ? 'row' : 'rows'}` : ''
  }`;

  const feed = query.isError ? (
    <ErrorPanel what="Couldn't load events." onRetry={() => void query.refetch()} />
  ) : query.isPending ? (
    <LoadingRows rows={6} columns={5} />
  ) : groups.length === 0 ? (
    <EmptyState
      title="No events match this filter"
      description="Events appear when a unit fails, a container restarts, a port opens or a threshold fires."
    />
  ) : (
    <div className="event-kinds">
      {kinds.map((entry) => {
        const hidden = isFolded(entry);
        const rows = rowsOf(entry.groups, open);
        const Icon = kindIcon(entry.kind);
        const showCount = kinds.length > 1 || hidden;
        return (
          <div className="event-kind" key={entry.kind}>
            <button type="button" className="event-kind-head" aria-expanded={!hidden} onClick={() => toggleKind(entry)}>
              <span className="event-chevron" aria-hidden="true">
                {hidden ? <CaretRight size={14} /> : <CaretDown size={14} />}
              </span>
              <Icon size={15} aria-hidden={true} />
              <span className="event-kind-name">{kindLabel(entry.kind)}</span>
              {entry.worst !== 'info' ? (
                <StatusDot variant={severityTone(entry.worst)} label={`${kindLabel(entry.kind)}: ${entry.worst}`} />
              ) : null}
              {showCount ? <span className="event-kind-count code">{entry.count}</span> : null}
            </button>
            {hidden ? null : phone ? (
              blocks(rows)
            ) : (
              <div className="event-rows" role="list" aria-label={`${kindLabel(entry.kind)} events`}>
                {rows.map((row) => (
                  <div className={row.occurrence ? 'event-row is-occurrence' : 'event-row'} key={row.id} role="listitem">
                    {fold(row)}
                    <span className="event-clock">{eventTime(row.event.ts, now)}</span>
                    <span>{row.occurrence ? null : <SeverityPill severity={row.event.severity} />}</span>
                    <span>
                      <Link href={`/nodes/${row.event.node_id}/events`} className="role-tag code">
                        {row.event.node_id}
                      </Link>
                    </span>
                    {message(row)}
                    <span className="event-when">
                      <span className="muted small">{relative(row.event.ts, now)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="beszel-card" aria-label={title}>
      <header className="beszel-card-head">
        <div className="beszel-card-title-group">
          {level === 1 ? <h1>{title}</h1> : <h2>{title}</h2>}
          <p>{[summary, desc].filter(Boolean).join(' · ')}</p>
        </div>
        {filters ? <div className="beszel-card-controls">{filters}</div> : null}
      </header>
      {feed}
    </section>
  );
}
