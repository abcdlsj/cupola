import { Fig } from '../../components/Fig';
import { useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
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
  useTailnetPeers,
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
  useChangePassword,
  useUpdateNode,
} from '../../data/queries';
import { clock, relative } from '../../lib/format';

const SECTIONS = [
  { to: '/settings/nodes', label: 'Nodes' },
  { to: '/settings/alerts', label: 'Alerts' },
  { to: '/settings/tokens', label: 'Tokens' },
  { to: '/settings/retention', label: 'Retention' },
  { to: '/settings/appearance', label: 'Appearance' },
  { to: '/settings/account', label: 'Account' },
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

function slugifyPeer(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  return slug || 'node';
}

function JoinPanel() {
  const create = useCreateJoinCode();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: 'manual' | 'tailnet' = searchParams.get('add') === 'tailnet' ? 'tailnet' : 'manual';
  const setMode = (next: 'manual' | 'tailnet') => {
    setError(null);
    if (next === 'tailnet') setOs((current) => (current === 'manual' ? 'linux' : current));
    setSearchParams(next === 'tailnet' ? { add: 'tailnet' } : {}, { replace: true });
  };
  const [os, setOs] = useState<'linux' | 'darwin' | 'manual'>('linux');
  const [form, setForm] = useState({ id: '', name: '', labels: '' });
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    code: string;
    nodeId: string;
    commands: Record<string, string>;
    expires: number;
    hubUrl: string;
    tailnet: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const peers = useTailnetPeers(mode === 'tailnet');
  const status = useJoinStatus(issued?.nodeId ?? null);

  const generate = async (options: { id: string; name: string; labels: string[]; advertise?: string }) => {
    setError(null);
    setIssued(null);
    try {
      const result = await create.mutateAsync(options);
      setIssued({
        code: result.code,
        nodeId: result.node_id,
        commands: result.commands,
        expires: result.expires_at,
        hubUrl: result.hub_url,
        tailnet: Boolean(options.advertise),
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The join code could not be created.');
    }
  };

  const generateForPeer = async (peer: { name: string; ipv4: string }) => {
    if (create.isPending) return;
    setSelected(peer.ipv4);
    await generate({
      id: slugifyPeer(peer.name),
      name: peer.name,
      labels: [],
      advertise: `http://${peer.ipv4}:9797`,
    });
  };

  const command = issued?.commands[os] ?? (issued ? issued.commands.linux : '');

  return (
    <Panel title="Add a system" meta={issued ? `code expires ${clock(issued.expires)} UTC` : mode === 'tailnet' ? `${peers.data?.peers.length ?? 0} peers` : 'one command'} flush>
      <div className="join-modes" role="group" aria-label="Add-system mode">
        <button
          type="button"
          className="range-btn"
          aria-pressed={mode === 'manual'}
          onClick={() => setMode('manual')}
        >
          Manual
        </button>
        <button
          type="button"
          className="range-btn"
          aria-pressed={mode === 'tailnet'}
          onClick={() => setMode('tailnet')}
        >
          Tailnet
        </button>
      </div>

      {mode === 'manual' ? (
        <form
          className="form"
          data-testid="join-form"
          onSubmit={(event) => {
            event.preventDefault();
            void generate({
              id: form.id.trim(),
              name: form.name.trim() || form.id.trim(),
              labels: form.labels.split(',').map((label) => label.trim()).filter(Boolean),
            });
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
      ) : (
        <div className="panel-body" data-testid="tailnet-panel">
          <div className="tailnet-bar">
            <input
              className="input input-ui"
              aria-label="Filter peers"
              placeholder="Filter peers"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <button type="button" className="btn btn-ghost" onClick={() => void peers.refetch()} disabled={peers.isFetching}>
              {peers.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {peers.isLoading ? <p className="empty">Reading the tailnet…</p> : null}
          {peers.isError ? (
            <p className="form-error" role="alert">
              {peers.error instanceof ApiError ? peers.error.message : 'The tailnet could not be read.'}
            </p>
          ) : null}
          {peers.data && !peers.data.available ? (
            <p className="empty">
              {peers.data.error || 'Tailscale is not available on the hub.'} Set CUPOLA_TAILSCALE_BIN if the binary lives elsewhere.
            </p>
          ) : null}
          {peers.data?.available ? (
            (() => {
              const needle = filter.trim().toLowerCase();
              const visible = peers.data.peers.filter(
                (peer) =>
                  !needle ||
                  peer.name.toLowerCase().includes(needle) ||
                  peer.ipv4.includes(needle) ||
                  peer.os.toLowerCase().includes(needle),
              );
              if (visible.length === 0) {
                return <p className="empty">{needle ? 'No peer matches that filter.' : 'No other machine is in this tailnet.'}</p>;
              }
              return (
                <div className="peer-list" data-testid="tailnet-peers">
                  {visible.map((peer) => (
                    <button
                      key={peer.dns_name || peer.ipv4}
                      type="button"
                      className="peer-row"
                      aria-pressed={selected === peer.ipv4}
                      data-testid={`tailnet-peer-${peer.name}`}
                      onClick={() => void generateForPeer(peer)}
                    >
                      <span className="peer-name">{peer.name}</span>
                      <span className="peer-ip">{peer.ipv4}</span>
                      <span className="peer-os">{peer.os || '—'}</span>
                      <span className="peer-state" data-online={peer.online}>
                        {peer.online ? 'online' : 'offline'}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()
          ) : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      )}

      {issued ? (
        <div className="panel-body">
          {mode === 'tailnet' ? (
            <div className="form-actions" style={{ justifyContent: 'flex-start', paddingTop: 12 }}>
              <label className="form-field">
                <span>Target OS</span>
                <select className="select" value={os} onChange={(event) => setOs(event.target.value as typeof os)}>
                  <option value="linux">Linux (systemd)</option>
                  <option value="darwin">macOS (launchd)</option>
                </select>
              </label>
            </div>
          ) : null}
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
          {issued.tailnet ? (
            <p className="note">This machine must reach {issued.hubUrl} over the tailnet or the internet.</p>
          ) : null}
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
  const [form, setForm] = useState({ id: '', name: '', url: 'http://127.0.0.1:9797', token: '', mode: 'pull', labels: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', labels: '', url: '', token: '', mode: 'pull' });
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
        mode: form.mode as 'pull' | 'push',
        labels: form.labels.split(',').map((label) => label.trim()).filter(Boolean),
      });
      setMessage({ kind: 'ok', text: `Node ${form.id} added. The first poll runs within a few seconds.` });
      setForm({ id: '', name: '', url: 'http://127.0.0.1:9797', token: '', mode: 'pull', labels: '' });
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
              <Th>Mode</Th>
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
                  <Td cell="field" label="Mode">{view.node.mode}</Td>
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
                            mode: view.node.mode === 'push' ? 'push' : 'pull',
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
                    mode: editForm.mode as 'pull' | 'push',
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
                <span>Mode</span>
                <select className="select" value={editForm.mode} onChange={(event) => setEditForm({ ...editForm, mode: event.target.value })}>
                  <option value="pull">Pull (the hub can reach this agent)</option>
                  <option value="push">Push (the agent reports out)</option>
                </select>
              </label>
              {editForm.mode === 'pull' ? (
                <label className="form-field">
                  <span>Agent URL</span>
                  <input className="input input-ui" value={editForm.url} onChange={(event) => setEditForm({ ...editForm, url: event.target.value })} required />
                </label>
              ) : (
                <label className="form-field">
                  <span>URL is unused in push mode</span>
                  <input className="input input-ui" value={editForm.url} disabled />
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
                <span>Mode</span>
                <select className="select" value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}>
                  <option value="pull">Pull (the hub can reach this agent)</option>
                  <option value="push">Push (the agent reports out)</option>
                </select>
              </label>
              {form.mode === 'pull' ? (
                <label className="form-field">
                  <span>Agent URL</span>
                  <input className="input input-ui" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} required />
                </label>
              ) : (
                <label className="form-field">
                  <span>URL is unused in push mode</span>
                  <input className="input input-ui" value={form.url} disabled />
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
                  <Td cell="field" label="Scopes">{(token.scopes ?? []).join(', ')}</Td>
                  <Td cell="field" label="Allowlist">
                    {(token.node_ids ?? []).length === 0 && (token.action_ids ?? []).length === 0
                      ? 'all'
                      : `${(token.node_ids ?? []).join(', ') || 'all nodes'} · ${(token.action_ids ?? []).join(', ') || 'all actions'}`}
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
                <pre className="output">{issued}</pre>
              </div>
            ) : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create token'}
              </button>
            </div>
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
              <div className="kv-row"><dt>Raw samples</dt><dd><Fig>{settings.data.retention_raw_hours} h at the poll interval</Fig></dd></div>
              <div className="kv-row"><dt>1-minute rollups</dt><dd><Fig>{settings.data.retention_minute_days} days</Fig></dd></div>
              <div className="kv-row"><dt>1-hour rollups</dt><dd><Fig>{settings.data.retention_hour_months} months</Fig></dd></div>
              <div className="kv-row"><dt>Events and action runs</dt><dd><Fig>90 days</Fig></dd></div>
              <div className="kv-row"><dt>Poll interval</dt><dd><Fig>{settings.data.poll_interval_sec} s</Fig></dd></div>
              <div className="kv-row"><dt>Data directory</dt><dd className="fig">{settings.data.data_dir}</dd></div>
            </dl>
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
          
        </div>
      </div>
    </>
  );
}

export function AccountSettingsPage() {
  const me = useMe();
  const change = useChangePassword();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  return (
    <>
      <PageHeader
        title="Settings"
        finding="Nodes the hub polls, the channels alerts go to, the API tokens you hand to scripts, and retention."
      />
      <SettingsNav />
      <Panel title="Password" flush>
        {me.data?.mode === 'token' ? (
          <p className="empty">Sign in with the admin password to change it.</p>
        ) : (
          <form
            className="form"
            data-testid="password-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setMessage(null);
              if (form.next !== form.confirm) {
                setMessage({ kind: 'error', text: 'The new passwords do not match.' });
                return;
              }
              try {
                await change.mutateAsync({ current_password: form.current, new_password: form.next });
                setMessage({ kind: 'ok', text: 'Password changed.' });
                setForm({ current: '', next: '', confirm: '' });
              } catch (caught) {
                setMessage({ kind: 'error', text: caught instanceof ApiError ? caught.message : 'The password could not be changed.' });
              }
            }}
          >
            <div className="form-grid">
              <label className="form-field">
                <span>Current password</span>
                <input className="input input-ui" type="password" autoComplete="current-password" value={form.current} onChange={(event) => setForm({ ...form, current: event.target.value })} required />
              </label>
              <span />
              <label className="form-field">
                <span>New password (at least 10 characters)</span>
                <input className="input input-ui" type="password" autoComplete="new-password" minLength={10} value={form.next} onChange={(event) => setForm({ ...form, next: event.target.value })} required />
              </label>
              <label className="form-field">
                <span>Repeat the new password</span>
                <input className="input input-ui" type="password" autoComplete="new-password" minLength={10} value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} required />
              </label>
            </div>
            {message ? <p className={message.kind === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p> : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={change.isPending}>
                {change.isPending ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </form>
        )}
      </Panel>
    </>
  );
}
