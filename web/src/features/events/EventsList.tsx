import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { SeverityPill } from '../../components/StatusPill';
import { Empty, ErrorPanel } from '../../components/States';
import { useEvents } from '../../data/queries';
import { eventTime, relative } from '../../lib/format';

const KINDS = ['', 'node', 'service', 'container', 'system', 'network', 'action', 'disk', 'agent'];
const SEVERITIES = ['', 'info', 'warning', 'critical'];

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

  return (
    <Panel
      title={title}
      meta={
        <>
          {!compact ? (
            <>
              <label className="filter">
                <span className="sr-only">Severity</span>
                <select
                  className="select"
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
              <label className="filter">
                <span className="sr-only">Kind</span>
                <select
                  className="select"
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
          <span>{query.data?.length ?? 0} events</span>
        </>
      }
      flush
    >
      {query.isError ? (
        <ErrorPanel what="Couldn't load events." onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Empty>Loading events…</Empty>
      ) : !query.data || query.data.length === 0 ? (
        <Empty>No events match this filter. Events appear when a unit fails, a container restarts, a port opens or a threshold fires.</Empty>
      ) : (
        <ul className="event-list">
          {query.data.map((event) => (
            <li className="event-row" key={event.id}>
              <span className="event-time">{eventTime(event.ts, now)}</span>
              <span className="event-node">{event.node_id}</span>
              <SeverityPill severity={event.severity} />
              <span className="event-message">
                <Link className="link" to={`/events/${event.id}`}>
                  {event.message}
                </Link>
              </span>
              <span className="event-kind quiet">{relative(event.ts, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
