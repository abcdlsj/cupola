import { Fig } from '../../components/Fig';
import { Link } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { Empty, PageSkeleton } from '../../components/States';
import { useAlerts, useChannels, useDeliveries, useRules } from '../../data/queries';
import { clock, relative } from '../../lib/format';

export function AlertsPage() {
  const firing = useAlerts('firing');
  const history = useAlerts('all');
  const rules = useRules();
  const channels = useChannels();
  const deliveries = useDeliveries();
  const channelName = (id: string) => channels.data?.find((channel) => channel.id === id)?.name ?? (id ? id : 'in-app only');

  if (rules.isPending || firing.isPending) return <PageSkeleton title="Alerts" />;

  return (
    <>
      <Panel
        title="Alerts"
        level={1}
        desc={`${firing.data?.length ?? 0} firing · ${history.data?.length ?? 0} in history · ${rules.data?.length ?? 0} rules · ${channels.data?.length ?? 0} channels`}
        meta={
          <Link className="btn" to="/alerts/rules/new">
            New rule
          </Link>
        }
        flush
      >
      <div className="kpi-row" data-count="3">
        <div className="kpi-cell">
          <div className="kpi-label">Firing</div>
          <div className="kpi-value"><Fig>{firing.data?.length ?? 0}</Fig></div>
          <div className="kpi-sub">unresolved now</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Rules</div>
          <div className="kpi-value"><Fig>{rules.data?.length ?? 0}</Fig></div>
          <div className="kpi-sub">metric and event</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Deliveries</div>
          <div className="kpi-value"><Fig>{deliveries.data?.length ?? 0}</Fig></div>
          <div className="kpi-sub">recent attempts</div>
        </div>
      </div>
      </Panel>
      <Panel title="Firing" desc="Rules that are over their threshold right now." meta={`${firing.data?.length ?? 0} alerts`} flush>
        {!firing.data || firing.data.length === 0 ? (
          <Empty>Nothing is firing. Rules evaluate on every poll; an event rule fires as soon as its event arrives.</Empty>
        ) : (
          <Table label="Firing alerts">
            <THead>
              <Th>Alert</Th>
              <Th>Node</Th>
              <Th num>Value</Th>
              <Th num>Since</Th>
            </THead>
            <TBody>
              {firing.data.map((alert) => (
                <tr key={alert.id}>
                  <Td cell="primary">
                    <span className="row-name">{alert.rule_name || alert.rule_id}</span>
                    <span className="cell-sub">{alert.message}</span>
                  </Td>
                  <Td cell="field" label="Node">
                    <Link className="link" to={`/nodes/${alert.node_id}`}>{alert.node_id}</Link>
                  </Td>
                  <Td num cell="key">{alert.value ? alert.value.toFixed(1) : '—'}</Td>
                  <Td num cell="field" label="Since">
                    {relative(alert.ts, Date.now())}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
      <Panel title="Rules" desc="Metric thresholds, event matches and delivery targets." meta={`${rules.data?.length ?? 0} rules`} flush>
        {!rules.data || rules.data.length === 0 ? (
          <Empty>
            No rule yet. <Link className="link" to="/alerts/rules/new">Create the first rule</Link> or add one from an event.
          </Empty>
        ) : (
          <Table label="Alert rules">
            <THead>
              <Th>Rule</Th>
              <Th>Type</Th>
              <Th>Condition</Th>
              <Th>Channel</Th>
              <Th>State</Th>
              <Th num>Cooldown</Th>
            </THead>
            <TBody>
              {rules.data.map((rule) => (
                <tr key={rule.id}>
                  <Td cell="primary">
                    <Link className="row-name" to={`/alerts/rules/${rule.id}`}>{rule.name}</Link>
                  </Td>
                  <Td cell="field" label="Type">{rule.type}</Td>
                  <Td cell="field" label="Condition">
                    {rule.type === 'metric'
                      ? `${rule.metric} ${rule.comparator === 'lt' ? '<' : '>'} ${rule.threshold}${rule.duration_sec ? ` for ${rule.duration_sec}s` : ''}`
                      : `${(rule.kinds ?? []).join(', ') || 'any kind'} · ${rule.severity}`}
                  </Td>
                  <Td cell="field" label="Channel">{channelName(rule.channel_id ?? '')}</Td>
                  <Td cell="key">
                    <span className="pill" data-tone={rule.enabled ? 'positive' : 'neutral'}>{rule.enabled ? 'Enabled' : 'Off'}</span>
                  </Td>
                  <Td num cell="field" label="Cooldown">{rule.cooldown_sec}s</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
      <Panel title="History" desc="Every alert that fired, newest first." meta={`${history.data?.length ?? 0} alerts`} flush>
        {!history.data || history.data.length === 0 ? (
          <Empty>No alert has fired yet.</Empty>
        ) : (
          <Table label="Alert history">
            <THead>
              <Th>Alert</Th>
              <Th>Node</Th>
              <Th num>Time</Th>
              <Th>State</Th>
            </THead>
            <TBody>
              {history.data.slice(0, 30).map((alert) => (
                <tr key={alert.id}>
                  <Td cell="primary">
                    <span className="row-name">{alert.rule_name || alert.rule_id}</span>
                    <span className="cell-sub">{alert.message}</span>
                  </Td>
                  <Td cell="field" label="Node">{alert.node_id}</Td>
                  <Td num cell="field" label="Time">{clock(alert.ts)}</Td>
                  <Td cell="key">
                    <span className="pill" data-tone={alert.state === 'firing' ? 'negative' : 'positive'}>{alert.state}</span>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
      <Panel title="Deliveries" desc="Webhook and channel attempts, with their status." meta={`${deliveries.data?.length ?? 0} attempts`} flush>
        {!deliveries.data || deliveries.data.length === 0 ? (
          <Empty>No delivery yet. Test a channel in Settings → Alerts.</Empty>
        ) : (
          <Table label="Alert deliveries">
            <THead>
              <Th>Channel</Th>
              <Th num>Time</Th>
              <Th num>Attempts</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {deliveries.data.slice(0, 20).map((delivery) => (
                <tr key={delivery.id}>
                  <Td cell="primary"><span className="row-name">{channelName(delivery.channel_id)}</span></Td>
                  <Td num cell="field" label="Time">{clock(delivery.ts)}</Td>
                  <Td num cell="field" label="Attempts">{delivery.attempts}</Td>
                  <Td cell="key">
                    <span className="pill" data-tone={delivery.ok ? 'positive' : 'negative'}>{delivery.ok ? 'Delivered' : delivery.status}</span>
                    {delivery.error ? <span className="cell-sub">{delivery.error}</span> : null}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
