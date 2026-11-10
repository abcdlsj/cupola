import { useParams } from 'react-router-dom';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { SeverityPill } from '../../components/StatusPill';
import { MissingThing } from '../../components/NotFoundPage';
import { ErrorPanel, LoadingPage } from '../../components/States';
import { ApiError } from '../../data/api';
import { useEvent } from '../../data/queries';
import { relative, stamp } from '../../lib/format';
import { Facts, PageHead, Section } from '../../ui/kit';
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

const back = <Link href="/events">Events</Link>;

export function EventDetailPage() {
  const { eventId } = useParams();
  const query = useEvent(eventId);
  if (query.isPending) return <LoadingPage title="Event" />;
  if (query.isError && !(query.error instanceof ApiError && query.error.status === 404)) {
    return (
      <>
        <PageHead title={`Event ${eventId ?? ''}`} leading={back} />
        <ErrorPanel what="Couldn't load this event." onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (!query.data) {
    return (
      <>
        <PageHead title="Not found" leading={back} />
        <MissingThing what={`No event has the id “${eventId ?? ''}”`} back="/events" backLabel="Back to events" />
      </>
    );
  }
  const event = query.data;
  const params = new URLSearchParams({
    kind: event.kind,
    severity: event.severity,
    node: event.node_id,
  });
  return (
    <>
      <PageHead
        leading={back}
        title={`Event ${event.id}`}
        desc={`${event.message} · ${stamp(event.ts)} UTC`}
        actions={<Button label="Alert me about this" variant="secondary" href={`/alerts/rules/new?${params.toString()}`} />}
      />
      <VStack maxWidth={760}>
        <Section title="Event" actions={<SeverityPill severity={event.severity} />}>
          <Facts
            rows={[
              {
                label: 'Node',
                value: (
                  <Link href={`/nodes/${event.node_id}/events`} type="code">
                    {event.node_id}
                  </Link>
                ),
              },
              { label: 'Kind', value: event.kind },
              { label: 'Severity', value: event.severity },
              {
                label: 'Time',
                value: `${stamp(event.ts)} UTC · ${relative(event.ts, Date.now())}`,
              },
              {
                label: 'Message',
                value: <Text justify="end">{event.message}</Text>,
              },
              { label: 'Metadata', value: event.meta ?? '' },
            ]}
          />
          <Text type="supporting">
            An event rule can notify a webhook, ntfy, Discord, Slack or Telegram channel when events like this one occur. You can
            also create one from Alerts → New rule.
          </Text>
        </Section>
      </VStack>
    </>
  );
}
