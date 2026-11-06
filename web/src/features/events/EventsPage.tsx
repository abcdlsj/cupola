import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Panel } from '../../components/Panel';
import { SeverityPill } from '../../components/StatusPill';
import { Empty } from '../../components/States';
import { Kv } from '../../components/Kv';
import { useEvent } from '../../data/queries';
import { relative, stamp } from '../../lib/format';
import { EventsList } from './EventsList';

export function EventsPage() {
  return (
    <EventsList
      title="Events"
      level={1}
      desc="Changes the hub derived from the snapshots: units, containers, reboots, ports and alert transitions."
    />
  );
}

export function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const query = useEvent(eventId);
  if (query.isPending) return <Empty>Loading…</Empty>;
  if (query.isError || !query.data) {
    return (
      <Panel title="Not found">
        <Empty>
          No such event. <Link className="link" to="/events">Back to events</Link>.
        </Empty>
      </Panel>
    );
  }
  const event = query.data;
  const params = new URLSearchParams({ kind: event.kind, severity: event.severity, node: event.node_id });
  return (
    <>
      <PageHeader
        title={`Event ${event.id}`}
        finding={`${event.message} · ${stamp(event.ts)} UTC`}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(`/alerts/rules/new?${params.toString()}`)}>
              Alert me about this
            </button>
</>
        }
      />
      <Panel title="Event" meta={<SeverityPill severity={event.severity} />} flush>
        <div className="panel-body">
          <Kv
            rows={[
              { label: 'Node', value: <Link className="link" to={`/nodes/${event.node_id}/events`}>{event.node_id}</Link> },
              { label: 'Kind', value: event.kind },
              { label: 'Severity', value: event.severity },
              { label: 'Time', value: `${stamp(event.ts)} UTC · ${relative(event.ts, Date.now())}` },
              { label: 'Message', value: event.message },
              { label: 'Metadata', value: event.meta ? <span className="fig">{event.meta}</span> : '—' },
            ]}
          />
          <p className="note" style={{ marginTop: 12 }}>
            An event rule can notify a webhook, ntfy, Discord, Slack or Telegram channel when events like this one occur. You can also create
            one from Alerts → New rule.
          </p>
        </div>
      </Panel>
    </>
  );
}
