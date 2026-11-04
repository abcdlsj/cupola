import { useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { SeverityPill } from '../../components/StatusPill';
import { Empty, ErrorPanel } from '../../components/States';
import { useEvents } from '../../data/queries';
import type { Event } from '../../data/types';
import { eventTime, relative } from '../../lib/format';
import { groupEvents, type EventGroup } from '../../lib/events';

const KINDS = ['', 'node', 'service', 'container', 'system', 'network', 'action', 'disk', 'agent'];
const SEVERITIES = ['', 'info', 'warning', 'critical'];

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
  compact = false,
}: {
  nodeId?: string;
  title?: string;
  compact?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const [severity, setSeverity] = useState(params.get('severity') ?? '');
  const [kind, setKind] = useState(params.get('kind') ?? '');
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
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
  const folded = events.length - groups.length;

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
        <Empty>Loading events…</Empty>
      ) : groups.length === 0 ? (
        <Empty>No events match this filter. Events appear when a unit fails, a container restarts, a port opens or a threshold fires.</Empty>
      ) : (
        <ul className="event-list">{groups.map(renderGroup)}</ul>
      )}
    </Panel>
  );
}
