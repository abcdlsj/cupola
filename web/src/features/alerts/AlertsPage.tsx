import type { ReactNode } from 'react';
import { ErrorPanel, LoadingPage } from '../../components/States';
import { useAlerts, useChannels, useDeliveries, useRules } from '../../data/queries';
import type { Alert, AlertRule, Delivery } from '../../data/types';
import { eventTime, relative } from '../../lib/format';
import { useIsPhone } from '../../ui/kit';
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
    <div className="rows-card">
      <div className="rows">
        {items.map((item) => (
          <VStack key={id(item)} gap={1} paddingBlock={3}>
            {render(item)}
          </VStack>
        ))}
      </div>
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
      renderCell: ({ delivery }) => (
        <HStack gap={2} vAlign="center">
          <Badge variant={delivery.ok ? 'success' : 'error'} label={delivery.ok ? 'Delivered' : delivery.status} />
          {delivery.error ? <Text type="supporting">{delivery.error}</Text> : null}
        </HStack>
      ),
    },
  ];

  const channelCount = channels.data?.length ?? 0;
  const overviewSubtitle =
    firingList.length > 0
      ? `${firingList.length} of ${ruleList.length} rules over threshold right now`
      : ruleList.length > 0
        ? `${enabled} of ${ruleList.length} ${ruleList.length === 1 ? 'rule' : 'rules'} enabled · ${channelCount} ${channelCount === 1 ? 'channel' : 'channels'}`
        : 'Metric thresholds and event triggers';

  return (
    <>
      <section className="beszel-card" aria-label="Alerts">
        <header className="beszel-card-head">
          <div className="beszel-card-title-group">
            <h1>{firingList.length > 0 ? `${firingList.length} firing` : 'Alerts'}</h1>
            <p>{overviewSubtitle}</p>
          </div>
          <div className="beszel-card-controls">
            <Badge variant={firingList.length > 0 ? 'error' : 'success'} label={firingList.length > 0 ? `${firingList.length} firing` : 'All clear'} />
            {failedDeliveries > 0 ? <Badge variant="warning" label={`${failedDeliveries} failed`} /> : null}
            <Button label="New rule" variant="primary" href="/alerts/rules/new" />
          </div>
        </header>

        {firing.isError ? (
          <ErrorPanel what="Couldn't load firing alerts." onRetry={() => void firing.refetch()} />
        ) : firingList.length > 0 ? (
          <>
            <Grid columns={{ minWidth: phone ? 260 : 360, repeat: 'fit' }}>
              {firingList.map((alert) => (
                <section className="section is-alert" key={alert.id}>
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
                      <Link href={`/nodes/${alert.node_id}`} className="role-tag code">
                        {alert.node_id}
                      </Link>
                      <Text type="supporting">value</Text>
                      <Mono secondary={!alert.value}>{alert.value ? alert.value.toFixed(1) : '—'}</Mono>
                    </HStack>
                  </VStack>
                  <div>
                    <Button label="Open rule" size="sm" href={`/alerts/rules/${alert.rule_id}`} />
                  </div>
                </section>
              ))}
            </Grid>
            <hr />
          </>
        ) : null}

        {rules.isError ? (
          <ErrorPanel what="Couldn't load rules." onRetry={() => void rules.refetch()} />
        ) : ruleList.length === 0 ? (
          <EmptyState
            title="No rule yet"
            description="Create the first rule, or add one from an event with “Alert me about this”."
            actions={<Button label="Create the first rule" href="/alerts/rules/new" size="sm" />}
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
      </section>

      <div className="chart-grid">
        <section className="beszel-card" aria-label="History">
          <header className="beszel-card-head">
            <div className="beszel-card-title-group">
              <h2>History</h2>
              <p>Firing and resolved alert transitions</p>
            </div>
            {(history.data?.length ?? 0) > 0 ? (
              <div className="beszel-card-controls">
                <Badge variant="neutral" label={`${history.data?.length ?? 0}`} />
              </div>
            ) : null}
          </header>
          {history.isError ? (
            <ErrorPanel what="Couldn't load alert history." onRetry={() => void history.refetch()} />
          ) : historyList.length === 0 ? (
            <EmptyState title="No alert has fired yet" description="Transitions appear here when a rule triggers or resolves." />
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
                    <Link href={`/nodes/${alert.node_id}`} className="role-tag code">
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
        </section>

        <section className="beszel-card" aria-label="Deliveries">
          <header className="beszel-card-head">
            <div className="beszel-card-title-group">
              <h2>Deliveries</h2>
              <p>Webhook and channel attempts</p>
            </div>
            {(deliveries.data?.length ?? 0) > 0 ? (
              <div className="beszel-card-controls">
                <Badge variant="neutral" label={`${deliveries.data?.length ?? 0}`} />
              </div>
            ) : null}
          </header>
          {deliveries.isError ? (
            <ErrorPanel what="Couldn't load deliveries." onRetry={() => void deliveries.refetch()} />
          ) : deliveryList.length === 0 ? (
            <EmptyState
              title="No delivery yet"
              description="Test a channel in Settings → Alerts."
              actions={<Button label="Open alert settings" href="/settings/alerts" size="sm" />}
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
        </section>
      </div>
    </>
  );
}
