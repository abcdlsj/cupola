// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useState } from 'react';
import { ErrorPanel, LoadingRows } from '../../components/States';
import {
  useChannels,
  useCreateToken,
  useDeleteChannel,
  useDeleteToken,
  useMe,
  useSaveChannel,
  useSettings,
  useTestAlert,
  useTokens,
} from '../../data/queries';
import type { APIToken, Channel } from '../../data/types';
import { relative } from '../../lib/format';
import { Band } from '../../ui/kit';
import {
  Banner,
  Button,
  CodeBlock,
  EmptyState,
  HStack,
  Text,
  VStack,
  type TableColumn,
} from '../../ui/primitives';
import { CheckboxGroup, Dialog, NumberInput, Select, TextInput } from '../../ui/controls';
import {
  AdminOnly,
  Aside,
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

const KIND_OPTIONS = [
  { value: 'webhook', label: 'Webhook' },
  { value: 'ntfy', label: 'ntfy' },
  { value: 'discord', label: 'Discord' },
  { value: 'slack', label: 'Slack' },
  { value: 'telegram', label: 'Telegram' },
];

const EMPTY_CHANNEL = { name: '', kind: 'webhook', url: '', secret: '', token: '', chat_id: '' };

type ChannelRow = { id: string; channel: Channel };

export function AlertsSettingsPage() {
  const channels = useChannels();
  const settings = useSettings();
  const save = useSaveChannel();
  const remove = useDeleteChannel();
  const test = useTestAlert();
  const me = useMe();
  const [form, setForm] = useState(EMPTY_CHANNEL);
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [addMessage, setAddMessage] = useState<Message>(null);
  const [deleting, setDeleting] = useState<Channel | null>(null);
  const admin = Boolean(me.data?.admin);
  const list = channels.data ?? [];
  const telegram = form.kind === 'telegram';

  const submit = async () => {
    setTried(true);
    setAddMessage(null);
    const missing = !form.name.trim() || (telegram ? !form.token.trim() || !form.chat_id.trim() : !form.url.trim());
    if (missing) return;
    try {
      await save.mutateAsync(form);
      setAddMessage({ kind: 'ok', text: 'Channel saved.' });
      setForm(EMPTY_CHANNEL);
      setTried(false);
    } catch (caught) {
      setAddMessage({ kind: 'error', text: errorText(caught, 'The channel could not be saved.') });
    }
  };

  const columns: Array<TableColumn<ChannelRow>> = [
    {
      key: 'name',
      header: 'Channel',
      width: '200px',
      renderCell: ({ channel }) => <Text weight="medium">{channel.name}</Text>,
    },
    { key: 'kind', header: 'Kind', width: '100px', renderCell: ({ channel }) => <Text type="supporting">{channel.kind}</Text> },
    {
      key: 'target',
      header: 'Target',
      width: '100%',
      renderCell: ({ channel }) => (
        <Text type="code" color={channel.target ? undefined : 'secondary'}>
          {channel.target || '—'}
        </Text>
      ),
    },
    {
      key: 'secret',
      header: 'Secret',
      width: '100px',
      renderCell: ({ channel }) => (
        <Text type="supporting" color={channel.has_secret ? undefined : 'secondary'}>
          {channel.has_secret ? 'HMAC set' : '—'}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '150px',
      align: 'end',
      renderCell: ({ channel }) => (
        <HStack gap={1} hAlign="end">
          <Button
            label="Test"
            variant="ghost"
            size="sm"
            isDisabled={!admin || test.isPending}
            onClick={async () => {
              setMessage(null);
              try {
                await test.mutateAsync(channel.id);
                setMessage({ kind: 'ok', text: `Test delivered to ${channel.name}.` });
              } catch (caught) {
                setMessage({ kind: 'error', text: errorText(caught, 'Delivery failed.') });
              }
            }}
          />
          <Button label="Delete" variant="ghost" size="sm" isDisabled={!admin} onClick={() => setDeleting(channel)} />
        </HStack>
      ),
    },
  ];

  return (
    <SettingsPage>
      <Band title="Channels" desc={channels.data ? `${list.length} configured` : undefined} first>
        <Notice message={message} />
        {channels.isLoading ? (
          <LoadingRows rows={3} columns={4} />
        ) : channels.isError ? (
          <ErrorPanel what="The channels could not be loaded." onRetry={() => void channels.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState title="No channel yet" description="Alerts are still recorded in the app when no channel is attached." />
        ) : (
          <RowsTable label="Alert channels" data={list.map((channel) => ({ id: channel.id, channel }))} columns={columns} idKey={(row) => row.id} />
        )}
      </Band>

      <Band title="Add a channel">
        <Two>
          {admin ? (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <VStack gap={4}>
                <Fields>
                  <TextInput label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} isRequired status={required(form.name, tried)} />
                  <Select label="Kind" value={form.kind} options={KIND_OPTIONS} onChange={(kind) => setForm({ ...form, kind })} />
                  {telegram ? (
                    <>
                      <TextInput
                        label="Bot token"
                        type="password"
                        autoComplete="off"
                        value={form.token}
                        onChange={(token) => setForm({ ...form, token })}
                        isRequired
                        status={required(form.token, tried)}
                      />
                      <TextInput
                        label="Chat ID"
                        value={form.chat_id}
                        onChange={(chat_id) => setForm({ ...form, chat_id })}
                        isRequired
                        status={required(form.chat_id, tried)}
                      />
                    </>
                  ) : (
                    <TextInput
                      label="URL"
                      type="url"
                      value={form.url}
                      onChange={(url) => setForm({ ...form, url })}
                      isRequired
                      status={required(form.url, tried)}
                    />
                  )}
                  {form.kind === 'webhook' ? (
                    <TextInput
                      label="HMAC secret"
                      type="password"
                      autoComplete="off"
                      value={form.secret}
                      onChange={(secret) => setForm({ ...form, secret })}
                      isOptional
                    />
                  ) : null}
                </Fields>
                <Notice message={addMessage} />
                <HStack>
                  <Button type="submit" label="Add channel" variant="primary" isLoading={save.isPending} />
                </HStack>
              </VStack>
            </form>
          ) : (
            <AdminOnly />
          )}
          <Aside
            title="Delivery"
            rows={[
              ['Timeout', '5 s'],
              ['Retries', '3'],
              ['Signature', 'X-Cupola-Signature'],
              ['Private targets', settings.data ? (settings.data.allow_private_webhooks ? 'allowed' : 'blocked') : null],
            ]}
          />
        </Two>
      </Band>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        width={420}
        footer={
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" onClick={() => setDeleting(null)} />
            <Button
              label="Delete channel"
              variant="danger"
              isLoading={remove.isPending}
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.id);
                  setMessage({ kind: 'ok', text: `${deleting.name} deleted.` });
                } catch (caught) {
                  setMessage({ kind: 'error', text: errorText(caught, 'The channel could not be deleted.') });
                }
                setDeleting(null);
              }}
            />
          </HStack>
        }
      >
        <Banner status="warning" title="Rules using it will keep firing in-app." />
      </Dialog>
    </SettingsPage>
  );
}

function allowlist(token: APIToken): string {
  const nodes = token.node_ids ?? [];
  const actions = token.action_ids ?? [];
  if (nodes.length === 0 && actions.length === 0) return 'all';
  return `${nodes.join(', ') || 'all nodes'} · ${actions.join(', ') || 'all actions'}`;
}

type TokenRow = { id: string; token: APIToken };

const EMPTY_TOKEN = { name: '', scopes: ['read'] as string[], nodes: '', actions: '', days: null as number | null };

export function TokensSettingsPage() {
  const tokens = useTokens();
  const create = useCreateToken();
  const remove = useDeleteToken();
  const me = useMe();
  const [form, setForm] = useState(EMPTY_TOKEN);
  const [tried, setTried] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [addMessage, setAddMessage] = useState<Message>(null);
  const [revoking, setRevoking] = useState<APIToken | null>(null);
  const admin = Boolean(me.data?.admin);
  const list = tokens.data ?? [];
  const now = Date.now();

  const submit = async () => {
    setTried(true);
    setAddMessage(null);
    setIssued(null);
    if (!form.name.trim()) return;
    if (form.scopes.length === 0) {
      setAddMessage({ kind: 'error', text: 'Pick at least one scope.' });
      return;
    }
    try {
      const result = await create.mutateAsync({
        name: form.name.trim(),
        scopes: ['read', 'actions:run'].filter((scope) => form.scopes.includes(scope)),
        node_ids: splitList(form.nodes),
        action_ids: splitList(form.actions),
        expires_at: form.days ? Date.now() + form.days * 86400_000 : 0,
      });
      setIssued(result.token);
      setForm(EMPTY_TOKEN);
      setTried(false);
    } catch (caught) {
      setAddMessage({ kind: 'error', text: errorText(caught, 'The token could not be created.') });
    }
  };

  const columns: Array<TableColumn<TokenRow>> = [
    {
      key: 'name',
      header: 'Name',
      width: '180px',
      renderCell: ({ token }) => <Text weight="medium">{token.name}</Text>,
    },
    { key: 'prefix', header: 'Prefix', width: '140px', renderCell: ({ token }) => <Text type="code">{token.prefix}…</Text> },
    {
      key: 'scopes',
      header: 'Scopes',
      width: '150px',
      renderCell: ({ token }) => <Text type="code">{(token.scopes ?? []).join(', ') || '—'}</Text>,
    },
    {
      key: 'allowlist',
      header: 'Allowlist',
      width: '100%',
      renderCell: ({ token }) => <Text type="supporting">{allowlist(token)}</Text>,
    },
    {
      key: 'used',
      header: 'Last used',
      width: '110px',
      align: 'end',
      renderCell: ({ token }) => (
        <Text type="code" color={token.last_used ? undefined : 'secondary'}>
          {token.last_used ? relative(token.last_used, now) : 'never'}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '96px',
      align: 'end',
      renderCell: ({ token }) => <Button label="Revoke" variant="ghost" size="sm" isDisabled={!admin} onClick={() => setRevoking(token)} />,
    },
  ];

  return (
    <SettingsPage>
      <Band title="API tokens" desc={tokens.data ? `${list.length} issued` : undefined} first>
        <Notice message={message} />
        {tokens.isLoading ? (
          <LoadingRows rows={3} columns={5} />
        ) : tokens.isError ? (
          <ErrorPanel what="The tokens could not be loaded." onRetry={() => void tokens.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            title="No token yet"
            description="Tokens are needed for curl and for a static PWA that connects to a remote hub."
          />
        ) : (
          <RowsTable label="API tokens" data={list.map((token) => ({ id: token.id, token }))} columns={columns} idKey={(row) => row.id} />
        )}
      </Band>

      <Band title="Create a token">
        {admin ? (
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
                  <TextInput label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} isRequired status={required(form.name, tried)} />
                  <NumberInput
                    label="Expires in"
                    units="days"
                    placeholder="never"
                    min={0}
                    value={form.days}
                    onChange={(days) => setForm({ ...form, days })}
                    isOptional
                  />
                </Fields>
                <CheckboxGroup
                  label="Scopes"
                  options={[
                    { value: 'read', label: 'read' },
                    { value: 'actions:run', label: 'actions:run' },
                  ]}
                  value={form.scopes}
                  onChange={(scopes) => setForm({ ...form, scopes })}
                />
                <Fields>
                  <TextInput
                    label="Node allowlist"
                    placeholder="Comma separated; empty = all"
                    value={form.nodes}
                    onChange={(nodes) => setForm({ ...form, nodes })}
                    isOptional
                  />
                  <TextInput
                    label="Action allowlist"
                    placeholder="Comma separated; empty = all"
                    value={form.actions}
                    onChange={(actions) => setForm({ ...form, actions })}
                    isOptional
                  />
                </Fields>
                <Notice message={addMessage} />
                <HStack>
                  <Button type="submit" label="Create token" variant="primary" isLoading={create.isPending} />
                </HStack>
              </VStack>
            </form>
            {issued ? (
              <VStack gap={3} data-testid="token-reveal">
                <Banner status="warning" title="Copy the token now" description="It is shown once; the hub keeps only its hash." />
                <CodeBlock code={issued} title="New token" />
              </VStack>
            ) : (
              <Aside
                title="Scopes"
                rows={[
                  ['read', 'GET requests'],
                  ['actions:run', 'POST …/actions/{action}/run'],
                ]}
              />
            )}
          </Two>
        ) : (
          <AdminOnly />
        )}
      </Band>

      <Dialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revoking?.name ?? ''}?`}
        width={420}
        footer={
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" onClick={() => setRevoking(null)} />
            <Button
              label="Revoke token"
              variant="danger"
              isLoading={remove.isPending}
              onClick={async () => {
                if (!revoking) return;
                try {
                  await remove.mutateAsync(revoking.id);
                  setMessage({ kind: 'ok', text: `${revoking.name} revoked.` });
                } catch (caught) {
                  setMessage({ kind: 'error', text: errorText(caught, 'The token could not be revoked.') });
                }
                setRevoking(null);
              }}
            />
          </HStack>
        }
      >
        <Banner status="warning" title="Scripts and browsers that use it stop working at once." />
      </Dialog>
    </SettingsPage>
  );
}
