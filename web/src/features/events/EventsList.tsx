import { useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { SeverityPill } from '../../components/StatusPill';
import { Empty, ErrorPanel } from '../../components/States';
import { EventsSkeleton } from '../../components/Skeletons';
import { useEvents } from '../../data/queries';
import type { Event, Severity } from '../../data/types';
import { eventTime, relative } from '../../lib/format';
import { groupEvents, type EventGroup } from '../../lib/events';

const KINDS = ['', 'node', 'service', 'container', 'system', 'network', 'action', 'disk'];
const SEVERITIES = ['', 'info', 'warning', 'critical'];

/** One word per kind, so the group header reads as a noun, not a key. */
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

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

interface KindGroup {
  kind: string;
  groups: EventGroup[];
  /** Occurrences, not rows: a folded row of twenty counts as twenty. */
  count: number;
  worst: Severity;
}

/**
 * Rows grouped by kind, worst first. Time order survives inside a kind; across
 * kinds the question is "which part of the system is talking", not "what
 * happened at 14:02", so the worst kind leads.
 */
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
    for (const group of list) {
      count += group.count;
      if ((SEVERITY_RANK[group.latest.severity] ?? 3) < (SEVERITY_RANK[worst] ?? 3)) {
        worst = group.latest.severity;
      }
    }
    out.push({ kind, groups: list, count, worst });
  }
  return out.sort(
    (a, b) => (SEVERITY_RANK[a.worst] ?? 3) - (SEVERITY_RANK[b.worst] ?? 3) || b.count - a.count,
  );
}

function EventLink({ event }: { event: Event }) {
  return (
    <Link className="link" to={`/events/${event.id}`}>
      {event.message}
    </Link>
  );
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
  const [params, setParams] = useSearchParams();
  const [severity, setSeverity] = useState(params.get('severity') ?? '');
  const [kind, setKind] = useState(params.get('kind') ?? '');
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  // null means "nothing has been toggled": only a critical group opens on its
  // own, everything else starts folded so the list is a summary, not a scroll.
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

  // Critical opens by itself; with nothing critical the worst kind opens, so a
  // quiet fleet is one readable group rather than a stack of closed lids.
  const defaultFolded = (): ReadonlySet<string> => {
    const critical = kinds.filter((entry) => entry.worst === 'critical');
    const open = critical.length > 0 ? critical : kinds.slice(0, 1);
    return new Set(kinds.filter((entry) => !open.includes(entry)).map((entry) => entry.kind));
  };

  const isFolded = (entry: KindGroup) =>
    collapsed === null ? defaultFolded().has(entry.kind) : collapsed.has(entry.kind);

  const toggleKind = (entry: KindGroup) => {
    setCollapsed((current) => {
      // the first toggle materialises the default, so one click opens exactly
      // the group that was clicked
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

  const renderGroup = (group: EventGroup) => {
    if (group.count === 1) {
      const event = group.latest;
      return (
        <li className="event-row" key={event.id}>
          <span className="event-time">{eventTime(event.ts, now)}</span>
          <span className="event-node">{event.node_id}</span>
          <SeverityPill severity={event.severity} />
          <span className="event-message">
            <EventLink event={event} />
          </span>
          <span className="event-kind quiet">{relative(event.ts, now)}</span>
        </li>
      );
    }
    const head = group.latest;
    const expanded = open.has(head.id);
    return (
      <li className="event-group" key={`${group.key}:${head.id}`}>
        <div className="event-row">
          <span className="event-time">{eventTime(head.ts, now)}</span>
          <span className="event-node">{head.node_id}</span>
          <SeverityPill severity={head.severity} />
          <span className="event-message event-message-fold">
            <button
              type="button"
              className="event-fold"
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Hide' : 'Show'} ${group.count} occurrences of ${head.message}`}
              onClick={() => toggle(head.id)}
            >
              <CaretRight size={11} aria-hidden="true" data-open={expanded ? 'true' : undefined} />
              <span className="event-fold-text">{head.message}</span>
              <span className="event-count fig">×{group.count}</span>
            </button>
          </span>
          <span className="event-kind quiet">{relative(head.ts, now)}</span>
        </div>
        {expanded ? (
          <ul className="event-occurrences">
            {group.events.slice(1).map((event) => (
              <li className="event-row event-occurrence" key={event.id}>
                <span className="event-time">{eventTime(event.ts, now)}</span>
                <span className="event-node" aria-hidden="true" />
                <span aria-hidden="true" />
                <span className="event-message">
                  <EventLink event={event} />
                </span>
                <span className="event-kind quiet">{relative(event.ts, now)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <Panel
      title={title}
      level={level}
      desc={desc}
      meta={
        <>
          {!compact ? (
            <>
              <label className="select-wrap">
                <span className="sr-only">Severity</span>
                <select
                  className="select-bare"
                  value={severity}
                  onChange={(event) => {
                    setSeverity(event.target.value);
                    apply(event.target.value, kind);
                  }}
                >
                  {SEVERITIES.map((value) => (
                    <option key={value} value={value}>
                      {value || 'All severities'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-wrap">
                <span className="sr-only">Kind</span>
                <select
                  className="select-bare"
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value);
                    apply(severity, event.target.value);
                  }}
                >
                  {KINDS.map((value) => (
                    <option key={value} value={value}>
                      {value || 'All kinds'}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <span className="event-count-summary">
            {events.length} events
            {folded > 0 ? ` · ${groups.length} rows` : ''}
          </span>
        </>
      }
      flush
    >
      {query.isError ? (
        <ErrorPanel what="Couldn't load events." onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <EventsSkeleton />
      ) : groups.length === 0 ? (
        <Empty>No events match this filter. Events appear when a unit fails, a container restarts, a port opens or a threshold fires.</Empty>
      ) : (
        <ul className="event-list">
          {kinds.map((entry) => {
            const hidden = isFolded(entry);
            return (
              <li className="event-kind" key={entry.kind}>
                <button
                  type="button"
                  className="event-kind-head"
                  aria-expanded={!hidden}
                  onClick={() => toggleKind(entry)}
                >
                  <CaretRight size={12} aria-hidden="true" data-open={hidden ? undefined : 'true'} />
                  <span className="event-kind-name">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
                  <SeverityPill severity={entry.worst} />
                  <span className="event-kind-count">
                    {entry.groups.length} {entry.groups.length === 1 ? 'row' : 'rows'} · {entry.count}{' '}
                    {entry.count === 1 ? 'event' : 'events'}
                  </span>
                </button>
                {hidden ? null : <ul className="event-kind-body">{entry.groups.map(renderGroup)}</ul>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
