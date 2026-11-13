import type { ReactNode } from 'react';
import { ErrorPanel, LoadingPage } from '../../components/States';
import { useAlerts, useChannels, useDeliveries, useRules } from '../../data/queries';
import type { Alert, AlertRule, Delivery } from '../../data/types';
import { eventTime, relative } from '../../lib/format';
import { Band, KpiCell, KpiStrip, PageHead, useIsPhone } from '../../ui/kit';
import {
  Badge,
  Button,
  EmptyState,
  Grid,
  HStack,
  Link,
  StatusDot,
  Table,
  Text,
  VStack,
  type TableColumn,
} from '../../ui/primitives';

/** The condition as one line of mono: `cpu > 90 for 60s`, `service, node · warning`. */
function condition(rule: AlertRule): string {
  if (rule.type === 'metric') {
    return `${rule.metric} ${rule.comparator === 'lt' ? '<' : '>'} ${rule.threshold}${rule.duration_sec ? ` for ${rule.duration_sec}s` : ''}`;
  }
  return `${(rule.kinds ?? []).join(', ') || 'any kind'} · ${rule.severity}`;
}

function Mono({ children, secondary }: { children: ReactNode; secondary?: boolean }) {
  return <span className={secondary ? 'code muted nowrap' : 'code nowrap'}>{children}</span>;
}

/** Below 900 px a table becomes stacked blocks: a title line, then the facts. */
function Blocks<T>({ items, id, render }: { items: T[]; id: (item: T) => string | number; render: (item: T) => ReactNode }) {
  return (
    <div className="rows">
      {items.map((item) => (
        <VStack key={id(item)} gap={1} paddingBlock={3}>
          {render(item)}
        </VStack>
      ))}
    </div>
  );
}

function Line({ children }: { children: ReactNode }) {
  return (
    <HStack gap={2} vAlign="center" wrap>
      {children}
    </HStack>
  );
}

const ruleName = (alert: Alert) => alert.rule_name || alert.rule_id;

interface RuleRow extends Record<string, unknown> {
  rule: AlertRule;
}
interface AlertRow extends Record<string, unknown> {
  alert: Alert;
}
interface DeliveryRow extends Record<string, unknown> {
  delivery: Delivery;
}

export function AlertsPage() {
  const phone = useIsPhone();
  const firing = useAlerts('firing');
  const history = useAlerts('all');
  const rules = useRules();
  const channels = useChannels();
  const deliveries = useDeliveries();
  const channelName = (id: string) => channels.data?.find((channel) => channel.id === id)?.name ?? (id ? id : 'in-app only');

  if (rules.isPending || firing.isPending) return <LoadingPage title="Alerts" />;

  const now = Date.now();
  const firingList = firing.data ?? [];
  const ruleList = rules.data ?? [];
  const historyList = (history.data ?? []).slice(0, 30);
  const deliveryList = (deliveries.data ?? []).slice(0, 20);
  const failedDeliveries = (deliveries.data ?? []).filter((delivery) => !delivery.ok).length;
  const enabled = ruleList.filter((rule) => rule.enabled).length;

  const ruleColumns: Array<TableColumn<RuleRow>> = [
    {
      key: 'name',
      header: 'Rule',
      width: '200px',
      renderCell: ({ rule }) => <Link href={`/alerts/rules/${rule.id}`}>{rule.name}</Link>,
    },
    {
      key: 'type',
      header: 'Type',
      width: '96px',
      renderCell: ({ rule }) => <Badge variant="neutral" label={rule.type} />,
    },
    {
      key: 'condition',
      header: 'Condition',
      width: '100%',
      renderCell: ({ rule }) => <Mono>{condition(rule)}</Mono>,
    },
    {
      key: 'scope',
      header: 'Applies to',
      width: '140px',
      renderCell: ({ rule }) => (rule.node_id ? <Mono>{rule.node_id}</Mono> : <Text type="supporting">All nodes</Text>),
    },
    {
      key: 'channel',
      header: 'Channel',
      width: '160px',
      renderCell: ({ rule }) => <Text type="supporting">{channelName(rule.channel_id ?? '')}</Text>,
    },
    {
      key: 'state',
      header: 'State',
      width: '104px',
      renderCell: ({ rule }) => (
        <HStack gap={1.5} vAlign="center">
          <StatusDot variant={rule.enabled ? 'success' : 'neutral'} label={rule.enabled ? 'Enabled' : 'Off'} />
          <Text type="supporting">{rule.enabled ? 'Enabled' : 'Off'}</Text>
        </HStack>
      ),
    },
    {
      key: 'cooldown',
      header: 'Cooldown',
      width: '96px',
      align: 'end',
      renderCell: ({ rule }) => <Mono>{`${rule.cooldown_sec}s`}</Mono>,
    },
  ];

  const historyColumns: Array<TableColumn<AlertRow>> = [
    {
      key: 'alert',
      header: 'Alert',
      width: '100%',
      renderCell: ({ alert }) => (
        <VStack gap={0}>
          <Text>{ruleName(alert)}</Text>
          <Text type="supporting">{alert.message}</Text>
        </VStack>
      ),
    },
    {
      key: 'node',
      header: 'Node',
      width: '140px',
      renderCell: ({ alert }) => (
        <Link href={`/nodes/${alert.node_id}`} type="code">
          {alert.node_id}
        </Link>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      width: '96px',
      align: 'end',
      renderCell: ({ alert }) => <Mono>{eventTime(alert.ts, now)}</Mono>,
    },
    {
      key: 'state',
      header: 'State',
      width: '112px',
      renderCell: ({ alert }) => <Badge variant={alert.state === 'firing' ? 'error' : 'success'} label={alert.state} />,
    },
  ];

  const deliveryColumns: Array<TableColumn<DeliveryRow>> = [
    {
      key: 'channel',
      header: 'Channel',
      width: '220px',
      renderCell: ({ delivery }) => <Text>{channelName(delivery.channel_id)}</Text>,
    },
    {
      key: 'time',
      header: 'Time',
      width: '96px',
      align: 'end',
      renderCell: ({ delivery }) => <Mono>{eventTime(delivery.ts, now)}</Mono>,
    },
    {
      key: 'attempts',
      header: 'Attempts',
      width: '96px',
      align: 'end',
      renderCell: ({ delivery }) => <Mono>{delivery.attempts}</Mono>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '100%',
      renderCell: ({ delivery }) => (
        <HStack gap={2} vAlign="center">
          <Badge variant={delivery.ok ? 'success' : 'error'} label={delivery.ok ? 'Delivered' : delivery.status} />
          {delivery.error ? <Text type="supporting">{delivery.error}</Text> : null}
        </HStack>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title={firingList.length > 0 ? `${firingList.length} firing` : 'Nothing firing'}
        actions={<Button label="New rule" variant="primary" href="/alerts/rules/new" />}
      />

      <KpiStrip>
        <KpiCell label="Rules" value={ruleList.length} note={`${enabled} enabled`} />
        <KpiCell label="Channels" value={channels.data?.length} note="delivery targets" />
        <KpiCell
          label="Deliveries"
          value={deliveries.data?.length}
          state={failedDeliveries > 0 ? 'warning' : undefined}
          note={failedDeliveries > 0 ? `${failedDeliveries} failed` : 'recent attempts'}
        />
      </KpiStrip>

      <Band
        title={firingList.length > 0 ? 'Firing' : undefined}
        desc={firingList.length > 0 ? 'Rules that are over their threshold right now' : undefined}
        actions={
          firingList.length > 0 ? (
            <Text type="supporting">{`${firingList.length} of ${ruleList.length} rules`}</Text>
          ) : undefined
        }
      >
        {firing.isError ? (
          <ErrorPanel what="Couldn't load firing alerts." onRetry={() => void firing.refetch()} />
        ) : firingList.length === 0 ? (
          <p className="muted small">Rules evaluate on every poll; an event rule fires as soon as its event arrives.</p>
        ) : (
          <Grid columns={{ minWidth: phone ? 260 : 360, repeat: 'fit' }}>
            {firingList.map((alert) => (
              <section className="section" key={alert.id}>
                <HStack gap={2} vAlign="center" hAlign="between" wrap>
                  <HStack gap={2} vAlign="center">
                    <StatusDot variant="error" label="Firing" isPulsing />
                    <Text weight="semibold">{ruleName(alert)}</Text>
                  </HStack>
                  <Text type="supporting">{relative(alert.ts, now)}</Text>
                </HStack>
                <VStack gap={1}>
                  <Text>{alert.message}</Text>
                  <HStack gap={2} vAlign="center" wrap>
                    <Link href={`/nodes/${alert.node_id}`} type="code">
                      {alert.node_id}
                    </Link>
                    <Text type="supporting">value</Text>
                    <Mono secondary={!alert.value}>{alert.value ? alert.value.toFixed(1) : '—'}</Mono>
                  </HStack>
                </VStack>
                <div>
                  <Button label="Open rule" href={`/alerts/rules/${alert.rule_id}`} />
                </div>
              </section>
            ))}
          </Grid>
        )}
      </Band>

      <Band
        title="Rules"
        desc="Metric thresholds, event matches and delivery targets"
        actions={<Text type="supporting">{`${ruleList.length} rules`}</Text>}
      >
        {rules.isError ? (
          <ErrorPanel what="Couldn't load rules." onRetry={() => void rules.refetch()} />
        ) : ruleList.length === 0 ? (
          <EmptyState
            title="No rule yet"
            description="Create the first rule, or add one from an event with “Alert me about this”."
            actions={<Link href="/alerts/rules/new">Create the first rule</Link>}
          />
        ) : phone ? (
          <Blocks
            items={ruleList}
            id={(rule) => rule.id}
            render={(rule) => (
              <>
                <Line>
                  <StatusDot variant={rule.enabled ? 'success' : 'neutral'} label={rule.enabled ? 'Enabled' : 'Off'} />
                  <Link href={`/alerts/rules/${rule.id}`}>{rule.name}</Link>
                  <Badge variant="neutral" label={rule.type} />
                </Line>
                <Mono>{condition(rule)}</Mono>
                <Text type="supporting">
                  {`${rule.node_id || 'All nodes'} · ${channelName(rule.channel_id ?? '')} · cooldown ${rule.cooldown_sec}s`}
                </Text>
              </>
            )}
          />
        ) : (
          <Table data={ruleList.map((rule) => ({ rule }))} columns={ruleColumns} idKey={(row) => row.rule.id} label="Rules" hasHover />
        )}
      </Band>

      <Band
        title="History"
        desc="Every alert that fired, newest first"
        actions={<Text type="supporting">{`${history.data?.length ?? 0} alerts`}</Text>}
      >
        {history.isError ? (
          <ErrorPanel what="Couldn't load alert history." onRetry={() => void history.refetch()} />
        ) : historyList.length === 0 ? (
          <EmptyState title="No alert has fired yet" />
        ) : phone ? (
          <Blocks
            items={historyList}
            id={(alert) => alert.id}
            render={(alert) => (
              <>
                <Line>
                  <Badge variant={alert.state === 'firing' ? 'error' : 'success'} label={alert.state} />
                  <Text>{ruleName(alert)}</Text>
                </Line>
                <Text type="supporting">{alert.message}</Text>
                <Line>
                  <Link href={`/nodes/${alert.node_id}`} type="code">
                    {alert.node_id}
                  </Link>
                  <Mono secondary>{eventTime(alert.ts, now)}</Mono>
                </Line>
              </>
            )}
          />
        ) : (
          <Table data={historyList.map((alert) => ({ alert }))} columns={historyColumns} idKey={(row) => String(row.alert.id)} label="Alert history" />
        )}
      </Band>

      <Band
        title="Deliveries"
        desc="Webhook and channel attempts, with their status"
        actions={<Text type="supporting">{`${deliveries.data?.length ?? 0} attempts`}</Text>}
      >
        {deliveries.isError ? (
          <ErrorPanel what="Couldn't load deliveries." onRetry={() => void deliveries.refetch()} />
        ) : deliveryList.length === 0 ? (
          <EmptyState
            title="No delivery yet"
            description="Test a channel in Settings → Alerts."
            actions={<Link href="/settings/alerts">Open alert settings</Link>}
          />
        ) : phone ? (
          <Blocks
            items={deliveryList}
            id={(delivery) => delivery.id}
            render={(delivery) => (
              <>
                <Line>
                  <Badge variant={delivery.ok ? 'success' : 'error'} label={delivery.ok ? 'Delivered' : delivery.status} />
                  <Text>{channelName(delivery.channel_id)}</Text>
                </Line>
                <Line>
                  <Mono secondary>{eventTime(delivery.ts, now)}</Mono>
                  <Text type="supporting">{`${delivery.attempts} ${delivery.attempts === 1 ? 'attempt' : 'attempts'}`}</Text>
                </Line>
                {delivery.error ? <Text type="supporting">{delivery.error}</Text> : null}
              </>
            )}
          />
        ) : (
          <Table
            data={deliveryList.map((delivery) => ({ delivery }))}
            columns={deliveryColumns}
            idKey={(row) => String(row.delivery.id)}
            label="Deliveries"
          />
        )}
      </Band>
    </>
  );
}
