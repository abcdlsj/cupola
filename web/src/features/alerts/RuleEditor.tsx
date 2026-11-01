import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader, Panel } from '../../components/Panel';
import { Empty } from '../../components/States';
import { useChannels, useDeleteRule, useFleet, useMe, useRule, useSaveRule, ApiError } from '../../data/queries';
import type { AlertRule, Severity } from '../../data/types';

const METRICS = ['cpu', 'mem', 'load', 'disk', 'inode', 'temp', 'psi_cpu', 'psi_io'];
const KINDS = ['node', 'service', 'container', 'system', 'network', 'action', 'disk', 'agent'];
const SEVERITIES: Severity[] = ['info', 'warning', 'critical'];

export function RuleEditorPage() {
  const { ruleId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const me = useMe();
  const editing = Boolean(ruleId && ruleId !== 'new');
  const existing = useRule(editing ? ruleId : undefined);
  const fleet = useFleet();
  const channels = useChannels();
  const save = useSaveRule();
  const remove = useDeleteRule();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<AlertRule>>({
    name: '',
    type: params.get('kind') ? 'event' : 'metric',
    metric: 'cpu',
    comparator: 'gt',
    threshold: 90,
    duration_sec: 60,
    severity: (params.get('severity') as Severity) ?? 'warning',
    node_id: params.get('node') ?? '',
    kinds: params.get('kind') ? [params.get('kind') as string] : ['service', 'container', 'node'],
    channel_id: '',
    enabled: true,
    cooldown_sec: 300,
  });

  useEffect(() => {
    if (existing.data) setForm(existing.data);
  }, [existing.data]);

  const update = <K extends keyof AlertRule>(key: K, value: AlertRule[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setError(null);
    try {
      const saved = await save.mutateAsync(form);
      navigate(`/alerts/rules/${saved.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The rule could not be saved.');
    }
  };

  const admin = Boolean(me.data?.admin);

  if (editing && existing.isError) {
    return (
      <Panel title="Not found">
        <Empty>No such rule. <Link className="link" to="/alerts">Back to alerts</Link>.</Empty>
      </Panel>
    );
  }

  return (
    <>
      <PageHeader
        title={editing ? form.name || 'Rule' : 'New rule'}
        finding={
          form.type === 'event'
            ? 'Notify a channel when an event kind arrives (unit failed, container restarted, node offline, port opened).'
            : 'Notify a channel when a metric crosses a threshold for the configured duration.'
        }
      />
      {!admin ? (
        <Panel title="Read-only">
          <Empty>This session uses an API token. Sign in as the hub admin to edit rules.</Empty>
        </Panel>
      ) : (
        <Panel title="Rule" flush>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="form-grid">
              <label className="form-field">
                <span>Name</span>
                <input className="input input-ui" value={form.name ?? ''} onChange={(event) => update('name', event.target.value)} required />
              </label>
              <label className="form-field">
                <span>Type</span>
                <select className="select" value={form.type} onChange={(event) => update('type', event.target.value as AlertRule['type'])}>
                  <option value="metric">Metric threshold</option>
                  <option value="event">Event</option>
                </select>
              </label>
              <label className="form-field">
                <span>Severity</span>
                <select className="select" value={form.severity} onChange={(event) => update('severity', event.target.value as Severity)}>
                  {SEVERITIES.map((severity) => (
                    <option key={severity} value={severity}>{severity}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Node</span>
                <select className="select" value={form.node_id ?? ''} onChange={(event) => update('node_id', event.target.value)}>
                  <option value="">All nodes</option>
                  {(fleet.data?.nodes ?? []).map((view) => (
                    <option key={view.node.id} value={view.node.id}>{view.node.name}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Channel</span>
                <select className="select" value={form.channel_id ?? ''} onChange={(event) => update('channel_id', event.target.value)}>
                  <option value="">In-app only</option>
                  {(channels.data ?? []).map((channel) => (
                    <option key={channel.id} value={channel.id}>{channel.name}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Cooldown (s)</span>
                <input
                  className="input input-ui"
                  type="number"
                  min={0}
                  value={form.cooldown_sec ?? 300}
                  onChange={(event) => update('cooldown_sec', Number(event.target.value))}
                />
              </label>
            </div>

            {form.type === 'metric' ? (
              <div className="form-grid">
                <label className="form-field">
                  <span>Metric</span>
                  <select className="select" value={form.metric} onChange={(event) => update('metric', event.target.value)}>
                    {METRICS.map((metric) => (
                      <option key={metric} value={metric}>{metric}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Comparator</span>
                  <select className="select" value={form.comparator} onChange={(event) => update('comparator', event.target.value as 'gt' | 'lt')}>
                    <option value="gt">above</option>
                    <option value="lt">below</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Threshold</span>
                  <input
                    className="input input-ui"
                    type="number"
                    step="0.1"
                    value={form.threshold ?? 0}
                    onChange={(event) => update('threshold', Number(event.target.value))}
                  />
                </label>
                <label className="form-field">
                  <span>Duration (s)</span>
                  <input
                    className="input input-ui"
                    type="number"
                    min={0}
                    value={form.duration_sec ?? 0}
                    onChange={(event) => update('duration_sec', Number(event.target.value))}
                  />
                </label>
              </div>
            ) : (
              <fieldset className="fieldset">
                <legend className="field-label">Event kinds</legend>
                <div className="check-row">
                  {KINDS.map((kind) => {
                    const checked = (form.kinds ?? []).includes(kind);
                    return (
                      <label className="check" key={kind}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const current = new Set(form.kinds ?? []);
                            if (event.target.checked) current.add(kind);
                            else current.delete(kind);
                            update('kinds', [...current]);
                          }}
                        />
                        {kind}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <label className="check">
              <input type="checkbox" checked={form.enabled ?? true} onChange={(event) => update('enabled', event.target.checked)} />
              Enabled
            </label>

            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {save.isError && !error ? <p className="form-error" role="alert">{save.error instanceof Error ? save.error.message : 'Save failed'}</p> : null}

            <div className="form-actions">
              {editing ? (
                <button
                  type="button"
                  className="btn btn-quiet danger-text"
                  onClick={async () => {
                    if (!ruleId) return;
                    if (!window.confirm('Delete this rule? Alerts already sent stay in the history.')) return;
                    await remove.mutateAsync(ruleId);
                    navigate('/alerts');
                  }}
                >
                  Delete rule
                </button>
              ) : null}
              <Link className="btn btn-quiet" to="/alerts">
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save rule'}
              </button>
            </div>
          </form>
        </Panel>
      )}
      <p className="note">
        Metric rules evaluate on every poll and need the condition to hold for the duration. Event rules evaluate as events arrive. Webhook
        URLs and channel secrets are encrypted at rest; delivery is signed with HMAC-SHA256 when a secret is set.
      </p>
    </>
  );
}
