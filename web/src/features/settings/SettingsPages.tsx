import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { PageHeader, Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { StatusPill } from '../../components/StatusPill';
import { Empty } from '../../components/States';
import {
  ApiError,
  useChannels,
  useCreateNode,
  useCreateToken,
  useCreateJoinCode,
  useJoinStatus,
  useDeleteChannel,
  useDeleteNode,
  useDeleteToken,
  useFleet,
  useLogout,
  useMe,
  useSettings,
  useTestAlert,
  useTestNode,
  useTokens,
  useSaveChannel,
  useUpdateNode,
} from '../../data/queries';
import { clock, relative } from '../../lib/format';

const SECTIONS = [
  { to: '/settings/nodes', label: 'Nodes' },
  { to: '/settings/alerts', label: 'Alerts' },
  { to: '/settings/tokens', label: 'Tokens' },
  { to: '/settings/retention', label: 'Retention' },
  { to: '/settings/appearance', label: 'Appearance' },
  { to: '/settings/about', label: 'About' },
];

function SettingsNav() {
  return (
    <nav className="tabs" aria-label="Settings sections">
      {SECTIONS.map((section) => (
        <NavLink key={section.to} to={section.to} className="tab">
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}

function AdminOnly() {
  const me = useMe();
  if (me.data?.admin) return null;
  return (
    <div className="panel">
      <p className="empty">
        This session is read-only ({me.data?.mode === 'token' ? `token ${me.data.token_name}` : 'no admin session'}).{' '}
        <Link className="link" to="/login">Sign in as the hub admin</Link> to change settings.
      </p>
    </div>
  );
}

function JoinPanel() {
  const create = useCreateJoinCode();
  const [os, setOs] = useState<'linux' | 'darwin' | 'manual'>('linux');
  const [form, setForm] = useState({ id: '', name: '', labels: '' });
  const [issued, setIssued] = useState<{ code: string; nodeId: string; commands: Record<string, string>; expires: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const status = useJoinStatus(issued?.nodeId ?? null);

  const generate = async () => {
    setError(null);
    setIssued(null);
    try {
      const result = await create.mutateAsync({
        id: form.id.trim(),
        name: form.name.trim() || form.id.trim(),
        labels: form.labels.split(',').map((label) => label.trim()).filter(Boolean),
      });
      setIssued({ code: result.code, nodeId: result.node_id, commands: result.commands, expires: result.expires_at });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The join code could not be created.');
    }
  };

  const command = issued?.commands[os] ?? '';

  return (
    <Panel title="Add a system" meta={issued ? `code expires ${clock(issued.expires)} UTC` : 'one command'} flush>
      <form
        className="form"
        data-testid="join-form"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <div className="form-grid">
          <label className="form-field">
            <span>Node ID (short slug)</span>
            <input className="input input-ui" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} placeholder="studio" required />
          </label>
          <label className="form-field">
            <span>Display name</span>
            <input className="input input-ui" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="studio" />
          </label>
          <label className="form-field">
            <span>Labels (comma separated)</span>
            <input className="input input-ui" value={form.labels} onChange={(event) => setForm({ ...form, labels: event.target.value })} placeholder="homelab, gpu" />
          </label>
          <label className="form-field">
            <span>Target OS</span>
            <select className="select" value={os} onChange={(event) => setOs(event.target.value as typeof os)}>
              <option value="linux">Linux (systemd)</option>
              <option value="darwin">macOS (launchd)</option>
              <option value="manual">Manual / Docker</option>
            </select>
          </label>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Generating…' : 'Generate command'}
          </button>
        </div>
      </form>

      {issued ? (
        <div className="panel-body">
          <p className="note">
            Paste this on the new machine. The code is single use and expires in 30 minutes; the agent registers itself and the hub starts polling it.
          </p>
          <pre className="output" data-testid="join-command">
            {command}
          </pre>
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(command);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy command'}
            </button>
            {status.data?.joined ? (
              <Link className="btn btn-primary" to={`/nodes/${issued.nodeId}`}>
                Open {status.data.name}
              </Link>
            ) : (
              <span className="note" role="status">
                Waiting for the agent to join… <Link className="link" to={`/nodes/${issued.nodeId}`}>pending node</Link>
              </span>
            )}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

export function NodesSettingsPage() {
  const fleet = useFleet();
  const me = useMe();
  const create = useCreateNode();
  const update = useUpdateNode();
  const test = useTestNode();
  const remove = useDeleteNode();
  const [form, setForm] = useState({ id: '', name: '', url: 'http://127.0.0.1:9797', token: '', transport: 'direct', conn: '', labels: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', labels: '', url: '', token: '', transport: 'direct', conn: '' });
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const admin = Boolean(me.data?.admin);
  const now = Date.now();

  const submit = async () => {
    setMessage(null);
    try {
      await create.mutateAsync({
        id: form.id.trim(),
        name: form.name.trim() || form.id.trim(),
        url: form.url.trim(),
        token: form.token.trim(),
        transport: form.transport as 'direct' | 'bolthole',
        conn: form.conn.trim() || undefined,
        labels: form.labels.split(',').map((label) => label.trim()).filter(Boolean),
      });
      setMessage({ kind: 'ok', text: `Node ${form.id} added. The first poll runs within a few seconds.` });
      setForm({ id: '', name: '', url: 'http://127.0.0.1:9797', token: '', transport: 'direct', conn: '', labels: '' });
    } catch (caught) {
      setMessage({ kind: 'error', text: caught instanceof ApiError ? caught.message : 'The node could not be added.' });
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        finding="Nodes the hub polls, the channels alerts go to, the API tokens you hand to scripts, and retention."
      />
      <SettingsNav />
      {admin ? <JoinPanel /> : null}
      <Panel title="Nodes" meta={`${fleet.data?.nodes.length ?? 0} registered`} flush>
        {!fleet.data || fleet.data.nodes.length === 0 ? (
          <Empty>No node yet. Add the first agent below.</Empty>
        ) : (
          <Table label="Registered nodes">
            <THead>
              <Th>Node</Th>
              <Th>Transport</Th>
              <Th>Status</Th>
              <Th num>Last seen</Th>
              <Th>Actions</Th>
            </THead>
            <TBody>
              {fleet.data.nodes.map((view) => (
                <tr key={view.node.id}>
                  <Td cell="primary">
                    <Link className="row-name" to={`/nodes/${view.node.id}`}>{view.node.name}</Link>
                    <span className="cell-sub fig">{view.node.id}</span>
                  </Td>
                  <Td cell="field" label="Transport">{view.node.transport}</Td>
                  <Td cell="field" label="Status"><StatusPill status={view.health.status} /></Td>
                  <Td num cell="field" label="Last seen">{relative(view.node.last_seen, now)}</Td>
                  <Td cell="field" label="Actions">
                    <span className="row-actions">
                      <button
                        type="button"
                        className="text-link"
                        disabled={!admin}
                        onClick={() => {
                          setEditing(view.node.id);
                          setEditForm({
                            name: view.node.name,
                            labels: view.node.labels.join(', '),
                            url: view.node.url ?? '',
                            token: '',
                            transport: view.node.transport,
                            conn: '',
                          });
                          setMessage(null);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        disabled={!admin || test.isPending}
                        onClick={async () => {
                          try {
                            await test.mutateAsync(view.node.id);
                            setMessage({ kind: 'ok', text: `${view.node.name} answered.` });
                          } catch (caught) {
                            setMessage({ kind: 'error', text: caught instanceof ApiError ? caught.message : 'No answer.' });
                          }
                        }}
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        className="text-link danger-text"
                        disabled={!admin}
                        onClick={async () => {
                          if (!window.confirm(`Remove ${view.node.name}? Its history is deleted.`)) return;
                          await remove.mutateAsync(view.node.id);
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
      {admin && editing ? (
        <Panel title={`Edit ${editing}`} flush>
          <form
            className="form"
            data-testid="edit-node-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setMessage(null);
              try {
                await update.mutateAsync({
                  id: editing,
                  input: {
                    name: editForm.name.trim() || editing,
                    labels: editForm.labels.split(',').map((label) => label.trim()).filter(Boolean),
                    url: editForm.url.trim(),
                    token: editForm.token.trim() || undefined,
                    transport: editForm.transport as 'direct' | 'bolthole',
                    conn: editForm.conn.trim() || undefined,
                  },
                });
                setMessage({ kind: 'ok', text: `${editForm.name || editing} saved.` });
                setEditing(null);
              } catch (caught) {
                setMessage({ kind: 'error', text: caught instanceof ApiError ? caught.message : 'The node could not be saved.' });
              }
            }}
          >
            <div className="form-grid">
              <label className="form-field">
                <span>Display name</span>
                <input className="input input-ui" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required />
              </label>
              <label className="form-field">
                <span>Labels (comma separated)</span>
                <input className="input input-ui" value={editForm.labels} onChange={(event) => setEditForm({ ...editForm, labels: event.target.value })} />
              </label>
              <label className="form-field">
                <span>Transport</span>
                <select className="select" value={editForm.transport} onChange={(event) => setEditForm({ ...editForm, transport: event.target.value })}>
                  <option value="direct">Direct HTTP</option>
                  <option value="bolthole">Bolthole relay</option>
                </select>
              </label>
              {editForm.transport === 'direct' ? (
                <label className="form-field">
                  <span>Agent URL</span>
                  <input className="input input-ui" value={editForm.url} onChange={(event) => setEditForm({ ...editForm, url: event.target.value })} required />
                </label>
              ) : (
                <label className="form-field">
                  <span>New connection string (blank keeps the stored one)</span>
                  <input className="input input-ui" value={editForm.conn} onChange={(event) => setEditForm({ ...editForm, conn: event.target.value })} />
                </label>
              )}
              <label className="form-field">
                <span>New agent token (blank keeps the stored one)</span>
                <input className="input input-ui" type="password" value={editForm.token} onChange={(event) => setEditForm({ ...editForm, token: event.target.value })} />
              </label>
            </div>
            {message ? <p className={message.kind === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p> : null}
            <div className="form-actions">
              <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save node'}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
      {admin ? (
        <Panel title="Add a node" flush>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="form-grid">
              <label className="form-field">
                <span>ID (short slug)</span>
                <input className="input input-ui" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} required />
              </label>
              <label className="form-field">
                <span>Display name</span>
                <input className="input input-ui" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className="form-field">
                <span>Transport</span>
                <select className="select" value={form.transport} onChange={(event) => setForm({ ...form, transport: event.target.value })}>
                  <option value="direct">Direct HTTP</option>
                  <option value="bolthole">Bolthole relay</option>
                </select>
              </label>
              {form.transport === 'direct' ? (
                <label className="form-field">
                  <span>Agent URL</span>
                  <input className="input input-ui" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} required />
                </label>
              ) : (
                <label className="form-field">
                  <span>Bolthole connection string</span>
                  <input className="input input-ui" value={form.conn} onChange={(event) => setForm({ ...form, conn: event.target.value })} required />
                </label>
              )}
              <label className="form-field">
                <span>Agent token</span>
                <input className="input input-ui" type="password" value={form.token} onChange={(event) => setForm({ ...form, token: event.target.value })} required />
              </label>
              <label className="form-field">
                <span>Labels (comma separated)</span>
                <input className="input input-ui" value={form.labels} onChange={(event) => setForm({ ...form, labels: event.target.value })} />
              </label>
            </div>
            {message ? <p className={message.kind === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p> : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Adding…' : 'Add node'}
              </button>
            </div>
          </form>
        </Panel>
      ) : (
        <AdminOnly />
      )}
      <p className="note">
        The agent token is stored encrypted with the hub key. With <span className="fig">cupola serve</span> the local agent is already registered; its config
        and actions live in <span className="fig">&lt;data-dir&gt;/local-agent.json</span>.
      </p>
    </>
  );
}

export function AlertsSettingsPage() {
  const channels = useChannels();
  const save = useSaveChannel();
  const remove = useDeleteChannel();
  const test = useTestAlert();
  const me = useMe();
  const [form, setForm] = useState({ name: '', kind: 'webhook', url: '', secret: '', token: '', chat_id: '' });
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const admin = Boolean(me.data?.admin);

  const submit = async () => {
    setMessage(null);
    try {
      await save.mutateAsync(form);
      setMessage({ kind: 'ok', text: 'Channel saved.' });
      setForm({ name: '', kind: 'webhook', url: '', secret: '', token: '', chat_id: '' });
    } catch (caught) {
      setMessage({ kind: 'error', text: caught instanceof ApiError ? caught.message : 'The channel could not be saved.' });
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        finding="Nodes the hub polls, the channels alerts go to, the API tokens you hand to scripts, and retention."
      />
      <SettingsNav />
      <Panel title="Channels" meta={`${channels.data?.length ?? 0} configured`} flush>
        {!channels.data || channels.data.length === 0 ? (
          <Empty>No channel yet. Alerts are still recorded in the app when no channel is attached.</Empty>
        ) : (
          <Table label="Alert channels">
            <THead>
              <Th>Channel</Th>
              <Th>Kind</Th>
              <Th>Target</Th>
              <Th>Secret</Th>
              <Th>Actions</Th>
            </THead>
            <TBody>
              {channels.data.map((channel) => (
                <tr key={channel.id}>
                  <Td cell="primary"><span className="row-name">{channel.name}</span></Td>
                  <Td cell="field" label="Kind">{channel.kind}</Td>
                  <Td cell="field" label="Target"><span className="fig">{channel.target || '—'}</span></Td>
                  <Td cell="field" label="Secret">{channel.has_secret ? 'HMAC set' : '—'}</Td>
                  <Td cell="field" label="Actions">
                    <span className="row-actions">
                      <button
                        type="button"
                        className="text-link"
                        disabled={!admin || test.isPending}
                        onClick={async () => {
                          try {
                            await test.mutateAsync(channel.id);
                            setMessage({ kind: 'ok', text: `Test delivered to ${channel.name}.` });
                          } catch (caught) {
                            setMessage({ kind: 'error', text: caught instanceof ApiError ? caught.message : 'Delivery failed.' });
                          }
                        }}
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        className="text-link danger-text"
                        disabled={!admin}
                        onClick={async () => {
                          if (!window.confirm(`Delete ${channel.name}? Rules using it will keep firing in-app.`)) return;
                          await remove.mutateAsync(channel.id);
                        }}
                      >
                        Delete
                      </button>
                    </span>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
      {admin ? (
        <Panel title="Add a channel" flush>
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
                <input className="input input-ui" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </label>
              <label className="form-field">
                <span>Kind</span>
                <select className="select" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                  <option value="webhook">Webhook</option>
                  <option value="ntfy">ntfy</option>
                  <option value="discord">Discord</option>
                  <option value="slack">Slack</option>
                  <option value="telegram">Telegram</option>
                </select>
              </label>
              {form.kind === 'telegram' ? (
                <>
                  <label className="form-field">
                    <span>Bot token</span>
                    <input className="input input-ui" type="password" value={form.token} onChange={(event) => setForm({ ...form, token: event.target.value })} required />
                  </label>
                  <label className="form-field">
                    <span>Chat ID</span>
                    <input className="input input-ui" value={form.chat_id} onChange={(event) => setForm({ ...form, chat_id: event.target.value })} required />
                  </label>
                </>
              ) : (
                <label className="form-field">
                  <span>URL</span>
                  <input className="input input-ui" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} required />
                </label>
              )}
              {form.kind === 'webhook' ? (
                <label className="form-field">
                  <span>HMAC secret (optional)</span>
                  <input className="input input-ui" type="password" value={form.secret} onChange={(event) => setForm({ ...form, secret: event.target.value })} />
                </label>
              ) : null}
            </div>
            {message ? <p className={message.kind === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p> : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Add channel'}
              </button>
            </div>
            <p className="note">
              Private, loopback and link-local targets are blocked unless the hub starts with <span className="fig">CUPOLA_ALLOW_PRIVATE_WEBHOOKS=1</span>. URLs
              and secrets are encrypted at rest and never logged.
            </p>
          </form>
        </Panel>
      ) : (
        <AdminOnly />
      )}
    </>
  );
}

export function TokensSettingsPage() {
  const tokens = useTokens();
  const create = useCreateToken();
  const remove = useDeleteToken();
  const me = useMe();
  const [form, setForm] = useState({ name: '', read: true, run: false, nodes: '', actions: '', days: '' });
  const [issued, setIssued] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const admin = Boolean(me.data?.admin);

  const submit = async () => {
    setMessage(null);
    setIssued(null);
    const scopes = [form.read ? 'read' : '', form.run ? 'actions:run' : ''].filter(Boolean);
    if (scopes.length === 0) {
      setMessage({ kind: 'error', text: 'Pick at least one scope.' });
      return;
    }
    try {
      const result = await create.mutateAsync({
        name: form.name.trim(),
        scopes,
        node_ids: form.nodes.split(',').map((value) => value.trim()).filter(Boolean),
        action_ids: form.actions.split(',').map((value) => value.trim()).filter(Boolean),
        expires_at: form.days ? Date.now() + Number(form.days) * 86400_000 : 0,
      });
      setIssued(result.token);
      setForm({ name: '', read: true, run: false, nodes: '', actions: '', days: '' });
    } catch (caught) {
      setMessage({ kind: 'error', text: caught instanceof ApiError ? caught.message : 'The token could not be created.' });
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        finding="Nodes the hub polls, the channels alerts go to, the API tokens you hand to scripts, and retention."
      />
      <SettingsNav />
      <Panel title="API tokens" meta={`${tokens.data?.length ?? 0} issued`} flush>
        {!tokens.data || tokens.data.length === 0 ? (
          <Empty>No token yet. Tokens are needed for curl and for a static PWA that connects to a remote hub.</Empty>
        ) : (
          <Table label="API tokens">
            <THead>
              <Th>Name</Th>
              <Th>Prefix</Th>
              <Th>Scopes</Th>
              <Th>Allowlist</Th>
              <Th num>Last used</Th>
              <Th>Actions</Th>
            </THead>
            <TBody>
              {tokens.data.map((token) => (
                <tr key={token.id}>
                  <Td cell="primary"><span className="row-name">{token.name}</span></Td>
                  <Td cell="field" label="Prefix"><span className="fig">{token.prefix}…</span></Td>
                  <Td cell="field" label="Scopes">{token.scopes.join(', ')}</Td>
                  <Td cell="field" label="Allowlist">
                    {token.node_ids.length === 0 && token.action_ids.length === 0
                      ? 'all'
                      : `${token.node_ids.join(', ') || 'all nodes'} · ${token.action_ids.join(', ') || 'all actions'}`}
                  </Td>
                  <Td num cell="field" label="Last used">{token.last_used ? relative(token.last_used, Date.now()) : 'never'}</Td>
                  <Td cell="field" label="Actions">
                    <button
                      type="button"
                      className="text-link danger-text"
                      disabled={!admin}
                      onClick={async () => {
                        if (!window.confirm(`Revoke ${token.name}?`)) return;
                        await remove.mutateAsync(token.id);
                      }}
                    >
                      Revoke
                    </button>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
      {admin ? (
        <Panel title="Create a token" flush>
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
                <input className="input input-ui" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </label>
              <div className="form-field">
                <span>Scopes</span>
                <span className="check-row">
                  <label className="check">
                    <input type="checkbox" checked={form.read} onChange={(event) => setForm({ ...form, read: event.target.checked })} />
                    read
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={form.run} onChange={(event) => setForm({ ...form, run: event.target.checked })} />
                    actions:run
                  </label>
                </span>
              </div>
              <label className="form-field">
                <span>Node allowlist (comma separated)</span>
                <input className="input input-ui" value={form.nodes} onChange={(event) => setForm({ ...form, nodes: event.target.value })} placeholder="empty = all" />
              </label>
              <label className="form-field">
                <span>Action allowlist (comma separated)</span>
                <input className="input input-ui" value={form.actions} onChange={(event) => setForm({ ...form, actions: event.target.value })} placeholder="empty = all" />
              </label>
              <label className="form-field">
                <span>Expires in (days)</span>
                <input className="input input-ui" type="number" min={0} value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })} placeholder="never" />
              </label>
            </div>
            {message ? <p className={message.kind === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p> : null}
            {issued ? (
              <div className="token-reveal">
                <p className="note">Copy this token now. It is stored hashed and cannot be shown again.</p>
                <pre className="output">{issued}</pre>
              </div>
            ) : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create token'}
              </button>
            </div>
            <p className="note">
              <span className="fig">actions:run</span> only works for actions whose agent config sets <span className="fig">allow_api: true</span> and that match the
              allowlists. Every run is audited.
            </p>
          </form>
        </Panel>
      ) : (
        <AdminOnly />
      )}
    </>
  );
}

export function RetentionSettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader title="Settings" finding="Nodes the hub polls, the channels alerts go to, the API tokens you hand to scripts, and retention." />
      <SettingsNav />
      <Panel title="Retention" flush>
        {settings.data ? (
          <div className="panel-body">
            <dl className="kv">
              <div className="kv-row"><dt>Raw samples</dt><dd>{settings.data.retention_raw_hours} h at the poll interval</dd></div>
              <div className="kv-row"><dt>1-minute rollups</dt><dd>{settings.data.retention_minute_days} days</dd></div>
              <div className="kv-row"><dt>1-hour rollups</dt><dd>{settings.data.retention_hour_months} months</dd></div>
              <div className="kv-row"><dt>Events and action runs</dt><dd>90 days</dd></div>
              <div className="kv-row"><dt>Poll interval</dt><dd>{settings.data.poll_interval_sec} s</dd></div>
              <div className="kv-row"><dt>Data directory</dt><dd className="fig">{settings.data.data_dir}</dd></div>
            </dl>
            <p className="note" style={{ marginTop: 12 }}>
              Rollups run every ten minutes: raw samples older than 48 h become 1-minute buckets, and those older than 30 days become hourly
              buckets. Values are min/avg/max.
            </p>
          </div>
        ) : (
          <Empty>Loading…</Empty>
        )}
      </Panel>
    </>
  );
}

export function AppearanceSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" finding="Nodes the hub polls, the channels alerts go to, the API tokens you hand to scripts, and retention." />
      <SettingsNav />
      <Panel title="Appearance">
        <p className="empty">
          One theme: the dark data terminal from the approved sheet (seed 956138436). Public Sans for UI, IBM Plex Mono for every figure.
          A light theme is not in v1.
        </p>
      </Panel>
    </>
  );
}

export function AboutSettingsPage() {
  const settings = useSettings();
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Settings" finding="Nodes the hub polls, the channels alerts go to, the API tokens you hand to scripts, and retention." />
      <SettingsNav />
      <div className="row">
        <div className="span-6">
          <Panel title="This hub" flush>
            <div className="panel-body">
              <dl className="kv">
                <div className="kv-row"><dt>Version</dt><dd>{settings.data?.version.version ?? '—'}</dd></div>
                <div className="kv-row"><dt>Commit</dt><dd className="fig">{settings.data?.version.commit ?? '—'}</dd></div>
                <div className="kv-row"><dt>Nodes</dt><dd>{settings.data?.node_count ?? 0}</dd></div>
                <div className="kv-row"><dt>Session</dt><dd>{me.data?.mode === 'token' ? `token ${me.data.token_name}` : 'admin'}</dd></div>
                <div className="kv-row"><dt>Public URL</dt><dd className="fig">{settings.data?.public_url || 'not set'}</dd></div>
              </dl>
              <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={async () => {
                    await logout.mutateAsync();
                    navigate('/login');
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </Panel>
        </div>
        <div className="span-6">
          <Panel title="Cupola">
            <p className="empty">
              Self-hosted monitoring for the Linux boxes you run: one agent per host, one hub, one PWA. Read-only by default; the only write
              action is a fixed script or a Wake-on-LAN packet configured on the agent.
            </p>
            <p className="note">
              Data terminal: dark, dense, monochrome figures, colour only on data and status, one 1px accent line for selection. Agent marks are
              Warren's preset set; see docs/ASSETS.md.
            </p>
          </Panel>
        </div>
      </div>
      <p className="note">Source and documentation: docs/PLAN.md, docs/API.md and docs/DEPLOY.md in the repository.</p>
    </>
  );
}
