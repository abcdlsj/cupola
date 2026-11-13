// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorPanel, LoadingRows } from '../../components/States';
import { StatusPill } from '../../components/StatusPill';
import {
  useCreateJoinCode,
  useCreateNode,
  useDeleteNode,
  useFleet,
  useJoinStatus,
  useMe,
  useTailnetPeers,
  useTestNode,
  useUpdateNode,
} from '../../data/queries';
import type { NodeView, TailnetPeer } from '../../data/types';
import { clock, relative } from '../../lib/format';
import { Band } from '../../ui/kit';
import {
  Banner,
  Button,
  CodeBlock,
  EmptyState,
  HStack,
  Link,
  StatusDot,
  Text,
  VStack,
  type TableColumn,
} from '../../ui/primitives';
import { Dialog, SegmentedControl, SegmentedControlItem, Select, TextInput } from '../../ui/controls';
import {
  AdminOnly,
  errorText,
  Fields,
  Notice,
  required,
  RowsTable,
  SettingsPage,
  splitList,
  Two,
  type Message,
} from './settingsKit';

type Os = 'linux' | 'darwin' | 'manual';
type Mode = 'pull' | 'push';

const OS_OPTIONS = [
  { value: 'linux', label: 'Linux (systemd)' },
  { value: 'darwin', label: 'macOS (launchd)' },
  { value: 'manual', label: 'Manual / Docker' },
];

const MODE_OPTIONS = [
  { value: 'pull', label: 'Pull (the hub can reach this agent)' },
  { value: 'push', label: 'Push (the agent reports out)' },
];

function slugifyPeer(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  return slug || 'node';
}

type PeerRow = { id: string; peer: TailnetPeer };

function PeerTable({
  peers,
  selected,
  busy,
  onPick,
}: {
  peers: TailnetPeer[];
  selected: string | null;
  busy: boolean;
  onPick: (peer: TailnetPeer) => void;
}) {
  const columns: Array<TableColumn<PeerRow>> = [
    {
      key: 'name',
      header: 'Peer',
      renderCell: ({ peer }) => <Text weight="medium">{peer.name}</Text>,
    },
    {
      key: 'ipv4',
      header: 'Address',
      renderCell: ({ peer }) => <Text type="code">{peer.ipv4}</Text>,
    },
    {
      key: 'os',
      header: 'OS',
      width: '110px',
      renderCell: ({ peer }) => <Text type="supporting">{peer.os || '—'}</Text>,
    },
    {
      key: 'online',
      header: 'State',
      width: '110px',
      renderCell: ({ peer }) => (
        <HStack gap={1.5} vAlign="center">
          <StatusDot variant={peer.online ? 'success' : 'neutral'} label={peer.online ? 'online' : 'offline'} />
          <Text type="supporting">{peer.online ? 'online' : 'offline'}</Text>
        </HStack>
      ),
    },
    {
      key: 'pick',
      header: '',
      width: '150px',
      align: 'end',
      renderCell: ({ peer }) => (
        <Button
          label={selected === peer.ipv4 ? 'Selected' : 'Get command'}
          aria-pressed={selected === peer.ipv4}
          isDisabled={busy}
          data-testid={`tailnet-peer-${peer.name}`}
          onClick={() => onPick(peer)}
        />
      ),
    },
  ];
  return (
    <RowsTable
      label="Tailnet peers"
      testId="tailnet-peers"
      data={peers.map((peer) => ({ id: peer.dns_name || peer.ipv4, peer }))}
      columns={columns}
      idKey={(row) => row.id}
    />
  );
}

function JoinBand() {
  const create = useCreateJoinCode();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: 'manual' | 'tailnet' = searchParams.get('add') === 'tailnet' ? 'tailnet' : 'manual';
  const [os, setOs] = useState<Os>('linux');
  const [form, setForm] = useState({ id: '', name: '', labels: '' });
  const [tried, setTried] = useState(false);
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
  const peers = useTailnetPeers(mode === 'tailnet');
  const status = useJoinStatus(issued?.nodeId ?? null);

  const setMode = (next: string) => {
    setError(null);
    if (next === 'tailnet') setOs((current) => (current === 'manual' ? 'linux' : current));
    setSearchParams(next === 'tailnet' ? { add: 'tailnet' } : {}, { replace: true });
  };

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
      setError(errorText(caught, 'The join code could not be created.'));
    }
  };

  const generateForPeer = async (peer: TailnetPeer) => {
    if (create.isPending) return;
    setSelected(peer.ipv4);
    await generate({ id: slugifyPeer(peer.name), name: peer.name, labels: [], advertise: `http://${peer.ipv4}:9797` });
  };

  const command = issued?.commands[os] ?? (issued ? issued.commands.linux : '');
  const needle = filter.trim().toLowerCase();
  const visible = (peers.data?.peers ?? []).filter(
    (peer) =>
      !needle || peer.name.toLowerCase().includes(needle) || peer.ipv4.includes(needle) || peer.os.toLowerCase().includes(needle),
  );

  const left =
    mode === 'manual' ? (
      <form
        noValidate
        data-testid="join-form"
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          if (!form.id.trim()) return;
          void generate({ id: form.id.trim(), name: form.name.trim() || form.id.trim(), labels: splitList(form.labels) });
        }}
      >
        <VStack gap={4}>
          <Fields>
            <TextInput
              label="Node ID (short slug)"
              value={form.id}
              onChange={(id) => setForm({ ...form, id })}
              placeholder="studio"
              autoCapitalize="none"
              isRequired
              status={required(form.id, tried)}
            />
            <TextInput label="Display name" value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="studio" />
            <TextInput
              label="Labels"
              value={form.labels}
              onChange={(labels) => setForm({ ...form, labels })}
              placeholder="homelab, gpu"
            />
            <Select label="Target OS" value={os} options={OS_OPTIONS} onChange={(value) => setOs(value as Os)} />
          </Fields>
          {error ? <Notice message={{ kind: 'error', text: error }} /> : null}
          <HStack>
            <Button type="submit" label="Generate command" variant="primary" isLoading={create.isPending} />
          </HStack>
        </VStack>
      </form>
    ) : (
      <VStack gap={3} data-testid="tailnet-panel">
        <HStack gap={2} vAlign="end">
          <span className="search" style={{ width: '100%' }}>
            <input
              className="input input-search"
              type="search"
              aria-label="Filter peers"
              placeholder="Filter peers"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </span>
          <Button label="Refresh" isLoading={peers.isFetching} onClick={() => void peers.refetch()} />
        </HStack>
        {peers.isLoading ? <LoadingRows rows={3} columns={4} /> : null}
        {peers.isError ? <ErrorPanel what={errorText(peers.error, 'The tailnet could not be read.')} onRetry={() => void peers.refetch()} /> : null}
        {peers.data && !peers.data.available ? (
          <EmptyState
            title={peers.data.error || 'Tailscale is not available on the hub.'}
            description="Set CUPOLA_TAILSCALE_BIN if the binary lives elsewhere."
          />
        ) : null}
        {peers.data?.available ? (
          visible.length === 0 ? (
            <EmptyState title={needle ? 'No peer matches that filter.' : 'No other machine is in this tailnet.'} />
          ) : (
            <PeerTable peers={visible} selected={selected} busy={create.isPending} onPick={(peer) => void generateForPeer(peer)} />
          )
        ) : null}
        {error ? <Notice message={{ kind: 'error', text: error }} /> : null}
      </VStack>
    );

  return (
    <Band
      title="Install on a new machine"
      desc={
        issued
          ? `Code expires ${clock(issued.expires)} UTC`
          : mode === 'tailnet'
            ? `${peers.data?.peers.length ?? 0} peers in the tailnet`
            : 'One command installs the agent and joins it to this hub'
      }
      actions={
        <SegmentedControl label="Add-system mode" value={mode} onChange={setMode}>
          <SegmentedControlItem value="manual" label="Manual" />
          <SegmentedControlItem value="tailnet" label="Tailnet" />
        </SegmentedControl>
      }
    >
      <Two>
        {left}
        {issued ? (
          <VStack gap={3}>
            {mode === 'tailnet' ? (
              <Select label="Target OS" value={os} options={OS_OPTIONS.slice(0, 2)} onChange={(value) => setOs(value as Os)} />
            ) : null}
            <div data-testid="join-command">
              <CodeBlock code={command} title="Install command" />
            </div>
            {status.data?.joined ? (
              <HStack>
                <Button label={`Open ${status.data.name}`} variant="primary" href={`/nodes/${issued.nodeId}`} />
              </HStack>
            ) : (
              <HStack gap={2} vAlign="center" role="status" wrap>
                <StatusDot variant="neutral" label="Waiting" isPulsing />
                <span className="muted small">Waiting for the agent to join.</span>
                <Link href={`/nodes/${issued.nodeId}`}>Pending node</Link>
              </HStack>
            )}
            {issued.tailnet ? (
              <Text type="supporting">
                This machine must reach <span className="code">{issued.hubUrl}</span> over the tailnet or the internet.
              </Text>
            ) : null}
          </VStack>
        ) : null}
      </Two>
    </Band>
  );
}

type NodeRow = { id: string; view: NodeView };

const EMPTY_NODE = { id: '', name: '', url: 'http://127.0.0.1:9797', token: '', mode: 'pull' as Mode, labels: '' };

export function NodesSettingsPage() {
  const fleet = useFleet();
  const me = useMe();
  const create = useCreateNode();
  const update = useUpdateNode();
  const test = useTestNode();
  const remove = useDeleteNode();
  const [form, setForm] = useState(EMPTY_NODE);
  const [tried, setTried] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', labels: '', url: '', token: '', mode: 'pull' as Mode });
  const [editTried, setEditTried] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<NodeView | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [addMessage, setAddMessage] = useState<Message>(null);
  const admin = Boolean(me.data?.admin);
  const now = Date.now();
  const nodes = fleet.data?.nodes ?? [];

  const submit = async () => {
    setTried(true);
    setAddMessage(null);
    if (!form.id.trim() || !form.token.trim() || (form.mode === 'pull' && !form.url.trim())) return;
    try {
      await create.mutateAsync({
        id: form.id.trim(),
        name: form.name.trim() || form.id.trim(),
        url: form.url.trim(),
        token: form.token.trim(),
        mode: form.mode,
        labels: splitList(form.labels),
      });
      setAddMessage({ kind: 'ok', text: `Node ${form.id} added. The first poll runs within a few seconds.` });
      setForm(EMPTY_NODE);
      setTried(false);
    } catch (caught) {
      setAddMessage({ kind: 'error', text: errorText(caught, 'The node could not be added.') });
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setEditTried(true);
    setEditError(null);
    if (!editForm.name.trim() || (editForm.mode === 'pull' && !editForm.url.trim())) return;
    try {
      await update.mutateAsync({
        id: editing,
        input: {
          name: editForm.name.trim() || editing,
          labels: splitList(editForm.labels),
          url: editForm.url.trim(),
          token: editForm.token.trim() || undefined,
          mode: editForm.mode,
        },
      });
      setMessage({ kind: 'ok', text: `${editForm.name || editing} saved.` });
      setEditing(null);
    } catch (caught) {
      setEditError(errorText(caught, 'The node could not be saved.'));
    }
  };

  const columns: Array<TableColumn<NodeRow>> = [
    {
      key: 'node',
      header: 'Node',
      width: '100%',
      renderCell: ({ view }) => (
        <VStack gap={0}>
          <Link href={`/nodes/${view.node.id}`}>{view.node.name}</Link>
          {view.node.id !== view.node.name ? <Text type="code" color="secondary">{view.node.id}</Text> : null}
        </VStack>
      ),
    },
    {
      key: 'mode',
      header: 'Mode',
      width: '90px',
      renderCell: ({ view }) => <Text type="supporting">{view.node.mode}</Text>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      renderCell: ({ view }) => <StatusPill status={view.health.status} />,
    },
    {
      key: 'seen',
      header: 'Last seen',
      width: '120px',
      align: 'end',
      renderCell: ({ view }) => (
        <Text type="code" color={view.node.last_seen ? undefined : 'secondary'}>
          {view.node.last_seen ? relative(view.node.last_seen, now) : '—'}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '220px',
      align: 'end',
      renderCell: ({ view }) => (
        <HStack gap={1} hAlign="end">
          <Button
            label="Edit"
            variant="ghost"
            size="sm"
            isDisabled={!admin}
            onClick={() => {
              setEditing(view.node.id);
              setEditTried(false);
              setEditError(null);
              setEditForm({
                name: view.node.name,
                labels: view.node.labels.join(', '),
                url: view.node.url ?? '',
                token: '',
                mode: view.node.mode === 'push' ? 'push' : 'pull',
              });
              setMessage(null);
            }}
          />
          <Button
            label="Test"
            variant="ghost"
            size="sm"
            isDisabled={!admin || test.isPending}
            onClick={async () => {
              setMessage(null);
              try {
                await test.mutateAsync(view.node.id);
                setMessage({ kind: 'ok', text: `${view.node.name} answered.` });
              } catch (caught) {
                setMessage({ kind: 'error', text: errorText(caught, 'No answer.') });
              }
            }}
          />
          <Button label="Remove" variant="ghost" size="sm" isDisabled={!admin} onClick={() => setRemoving(view)} />
        </HStack>
      ),
    },
  ];

  return (
    <SettingsPage>
      <Band title="Registered" desc={fleet.data ? `${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'}` : undefined} first>
        <Notice message={message} />
        {fleet.isLoading ? (
          <LoadingRows rows={3} columns={5} />
        ) : fleet.isError && !fleet.data ? (
          <ErrorPanel what="The node list could not be loaded." onRetry={() => void fleet.refetch()} />
        ) : nodes.length === 0 ? (
          <EmptyState title="No node yet" description={admin ? 'Add the first agent below.' : undefined} />
        ) : (
          <RowsTable label="Registered nodes" data={nodes.map((view) => ({ id: view.node.id, view }))} columns={columns} idKey={(row) => row.id} />
        )}
      </Band>

      {admin ? <JoinBand /> : null}

      {admin ? (
        <Band title="Register an existing agent" desc="The agent is installed and has its own token">
          <Two>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <VStack gap={4}>
                <Fields>
                  <TextInput
                    label="ID (short slug)"
                    value={form.id}
                    onChange={(id) => setForm({ ...form, id })}
                    autoCapitalize="none"
                    isRequired
                    status={required(form.id, tried)}
                  />
                  <TextInput label="Display name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
                  <Select label="Mode" value={form.mode} options={MODE_OPTIONS} onChange={(mode) => setForm({ ...form, mode: mode as Mode })} />
                  {form.mode === 'pull' ? (
                    <TextInput
                      label="Agent URL"
                      type="url"
                      value={form.url}
                      onChange={(url) => setForm({ ...form, url })}
                      isRequired
                      status={required(form.url, tried)}
                    />
                  ) : (
                    <TextInput label="Agent URL" description="Unused in push mode" value={form.url} onChange={() => undefined} isDisabled />
                  )}
                  <TextInput
                    label="Agent token"
                    type="password"
                    autoComplete="off"
                    value={form.token}
                    onChange={(token) => setForm({ ...form, token })}
                    isRequired
                    status={required(form.token, tried)}
                  />
                  <TextInput label="Labels" value={form.labels} onChange={(labels) => setForm({ ...form, labels })} placeholder="homelab, gpu" />
                </Fields>
                <Notice message={addMessage} />
                <HStack>
                  <Button type="submit" label="Add node" variant="primary" isLoading={create.isPending} />
                </HStack>
              </VStack>
            </form>
            <div />
          </Two>
        </Band>
      ) : (
        <AdminOnly />
      )}

      <Dialog
        open={admin && editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit ${editing ?? ''}`}
        width={560}
      >
        <form
          id="edit-node-form"
          noValidate
          data-testid="edit-node-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdit();
          }}
        >
          <VStack gap={4}>
            <Fields>
              <TextInput
                label="Display name"
                value={editForm.name}
                onChange={(name) => setEditForm({ ...editForm, name })}
                isRequired
                status={required(editForm.name, editTried)}
              />
              <TextInput
                label="Labels"
                value={editForm.labels}
                onChange={(labels) => setEditForm({ ...editForm, labels })}
                placeholder="homelab, gpu"
              />
              <Select label="Mode" value={editForm.mode} options={MODE_OPTIONS} onChange={(mode) => setEditForm({ ...editForm, mode: mode as Mode })} />
              {editForm.mode === 'pull' ? (
                <TextInput
                  label="Agent URL"
                  type="url"
                  value={editForm.url}
                  onChange={(url) => setEditForm({ ...editForm, url })}
                  isRequired
                  status={required(editForm.url, editTried)}
                />
              ) : (
                <TextInput label="Agent URL" description="Unused in push mode" value={editForm.url} onChange={() => undefined} isDisabled />
              )}
              <TextInput
                label="New agent token"
                description="Blank keeps the stored one"
                type="password"
                autoComplete="off"
                value={editForm.token}
                onChange={(token) => setEditForm({ ...editForm, token })}
              />
            </Fields>
            {editError ? <Notice message={{ kind: 'error', text: editError }} /> : null}
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" onClick={() => setEditing(null)} />
              <Button type="submit" label="Save node" variant="primary" isLoading={update.isPending} />
            </HStack>
          </VStack>
        </form>
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.node.name ?? ''}?`}
        width={420}
        footer={
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" onClick={() => setRemoving(null)} />
            <Button
              label="Remove node"
              variant="danger"
              isLoading={remove.isPending}
              onClick={async () => {
                if (!removing) return;
                try {
                  await remove.mutateAsync(removing.node.id);
                  setMessage({ kind: 'ok', text: `${removing.node.name} removed.` });
                } catch (caught) {
                  setMessage({ kind: 'error', text: errorText(caught, 'The node could not be removed.') });
                }
                setRemoving(null);
              }}
            />
          </HStack>
        }
      >
        <Banner status="warning" title="Its history is deleted." />
      </Dialog>
    </SettingsPage>
  );
}
