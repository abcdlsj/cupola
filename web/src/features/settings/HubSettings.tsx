// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { ErrorPanel, LoadingRows } from '../../components/States';
import {
  useApplyUpdate,
  useCancelUpdate,
  useChangePassword,
  useLogout,
  useMe,
  useRefreshUpdate,
  useSettings,
  useUpdateStatus,
} from '../../data/queries';
import { eventTime, relative } from '../../lib/format';
import { setThemePreference, useResolvedTheme, useThemePreference, type ThemePreference } from '../../lib/theme';
import { Band, Facts, Figure } from '../../ui/kit';
import { Aside, errorText, Fields, Notice, SettingsPage, Two, type Message } from './settingsKit';

export function RetentionSettingsPage() {
  const settings = useSettings();
  const data = settings.data;
  return (
    <SettingsPage>
      <Band title="Retention" desc="Raw samples are dropped on schedule; the rollups are kept longer" first>
        {settings.isLoading ? (
          <LoadingRows rows={4} columns={2} />
        ) : !data ? (
          <ErrorPanel what="The hub settings could not be loaded." onRetry={() => void settings.refetch()} />
        ) : (
          <Two>
            <Grid columns={{ minWidth: 140, max: 3 }} gap={4}>
              {(
                [
                  ['Raw samples', `${data.poll_interval_sec} s`, `kept ${data.retention_raw_hours} h`],
                  ['1-minute rollups', '1 m', `kept ${data.retention_minute_days} d`],
                  ['1-hour rollups', '1 h', `kept ${data.retention_hour_months} mo`],
                ] as const
              ).map(([label, step, kept]) => (
                <VStack key={label} gap={1}>
                  <Text type="supporting">{label}</Text>
                  <Figure value={step} size="heading" />
                  <Text type="code" color="secondary">
                    {kept}
                  </Text>
                </VStack>
              ))}
            </Grid>
            <Aside
              title="Hub"
              rows={[
                ['Events and action runs', '90 days'],
                ['Data directory', data.data_dir],
              ]}
            />
          </Two>
        )}
      </Band>
    </SettingsPage>
  );
}

export function AppearanceSettingsPage() {
  const preference = useThemePreference();
  const theme = useResolvedTheme();
  return (
    <SettingsPage>
      <Band title="Appearance" desc="Saved in this browser only" first>
        <Two>
          <VStack gap={3}>
            <SegmentedControl label="Theme" value={preference} onChange={(value) => setThemePreference(value as ThemePreference)}>
              <SegmentedControlItem value="system" label="System" />
              <SegmentedControlItem value="light" label="Light" />
              <SegmentedControlItem value="dark" label="Dark" />
            </SegmentedControl>
            <Text type="supporting">
              {preference === 'system' ? `Following the system, which is ${theme} now.` : `Always ${theme}, whatever the system says.`}
            </Text>
          </VStack>
          <Aside
            title="Current values"
            rows={[
              ['Preference', preference],
              ['On screen', theme],
            ]}
          />
        </Two>
      </Band>
    </SettingsPage>
  );
}

export function AccountSettingsPage() {
  const me = useMe();
  const change = useChangePassword();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const short = tried && form.next.length < 10;
  const mismatch = tried && form.confirm !== form.next;

  return (
    <SettingsPage>
      <Band title="Password" desc="The hub admin password" first>
        {me.data?.mode === 'token' ? (
          <Banner status="info" collapsible={false} title="Sign in with the admin password to change it." />
        ) : (
          <Two>
            <form
              noValidate
              data-testid="password-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setTried(true);
                setMessage(null);
                if (!form.current || form.next.length < 10) return;
                if (form.next !== form.confirm) {
                  setMessage({ kind: 'error', text: 'The new passwords do not match.' });
                  return;
                }
                try {
                  await change.mutateAsync({ current_password: form.current, new_password: form.next });
                  setMessage({ kind: 'ok', text: 'Password changed.' });
                  setForm({ current: '', next: '', confirm: '' });
                  setTried(false);
                } catch (caught) {
                  setMessage({ kind: 'error', text: errorText(caught, 'The password could not be changed.') });
                }
              }}
            >
              <VStack gap={4}>
                <TextInput
                  label="Current password"
                  type="password"
                  autoComplete="current-password"
                  value={form.current}
                  onChange={(current) => setForm({ ...form, current })}
                  status={tried && !form.current ? { type: 'error', message: 'Required' } : undefined}
                />
                <Fields>
                  <TextInput
                    label="New password (at least 10 characters)"
                    type="password"
                    autoComplete="new-password"
                    value={form.next}
                    onChange={(next) => setForm({ ...form, next })}
                    status={short ? { type: 'error', message: 'At least 10 characters' } : undefined}
                  />
                  <TextInput
                    label="Repeat the new password"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirm}
                    onChange={(confirm) => setForm({ ...form, confirm })}
                    status={mismatch && !short ? { type: 'error', message: 'Does not match' } : undefined}
                  />
                </Fields>
                <Notice message={message} />
                <HStack>
                  <Button type="submit" label="Change password" variant="primary" isLoading={change.isPending} />
                </HStack>
              </VStack>
            </form>
            <VStack />
          </Two>
        )}
      </Band>
    </SettingsPage>
  );
}

/** GitHub release bodies are markdown; show the text without the markers. */
function plainNotes(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function AboutSettingsPage() {
  const settings = useSettings();
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const updates = useUpdateStatus();
  const refresh = useRefreshUpdate();
  const apply = useApplyUpdate();
  const cancel = useCancelUpdate();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<Message>(null);

  const current = updates.data?.current.version ?? settings.data?.version.version ?? null;
  const commit = updates.data?.current.commit ?? settings.data?.version.commit ?? null;
  const latest = updates.data?.latest;
  const target = latest?.version ?? '';
  const queued = updates.data?.queued;
  const last = updates.data?.last;
  const hold = updates.data?.hold;
  const canUpgrade = Boolean(updates.data?.available && updates.data?.can_apply && target && !queued);
  const canForce = Boolean(target && updates.data?.can_apply && !queued && (hold?.version === target || !updates.data?.available));
  const notes = latest?.notes ? plainNotes(latest.notes) : '';
  const now = Date.now();

  const submit = async (force: boolean) => {
    if (!target) return;
    setMessage(null);
    try {
      await apply.mutateAsync({ version: target, force });
      setConfirming(false);
      setTyped('');
      setMessage({ kind: 'ok', text: `Queued ${target}. The root upgrader restarts the hub within a few seconds; this page reconnects on its own.` });
    } catch (caught) {
      setMessage({ kind: 'error', text: errorText(caught, 'The upgrade could not be queued.') });
    }
  };

  const updateRows: Array<{ label: string; value: ReactNode }> = [
    {
      label: 'Latest',
      value: latest?.version ?? (!updates.data?.enabled ? 'checks disabled' : updates.isLoading ? 'checking' : 'none'),
    },
    { label: 'Checked', value: updates.data?.checked_at ? relative(updates.data.checked_at, now) : 'never' },
    { label: 'Published', value: latest?.published_at ? eventTime(Date.parse(latest.published_at), now) : null },
    { label: 'Source', value: latest ? (latest.source === 'staged' ? 'staged on the hub' : 'github release') : null },
  ];
  if (last) {
    updateRows.push({
      label: 'Last run',
      value: (
        <HStack gap={2} vAlign="center" wrap="wrap" hAlign="end">
          <Badge
            variant={last.status === 'ok' ? 'success' : last.status === 'rolled_back' ? 'warning' : 'error'}
            label={last.status === 'ok' ? 'installed' : last.status === 'rolled_back' ? 'rolled back' : 'failed'}
          />
          <Text type="code">
            {last.from} → {last.to}
          </Text>
          <Text type="supporting">{relative(last.at, now)}</Text>
        </HStack>
      ),
    });
  }
  if (queued) updateRows.push({ label: 'Queued', value: `${queued.version} · ${queued.requested_by ?? 'admin'}` });
  if (hold) updateRows.push({ label: 'Held', value: `${hold.version} · ${hold.reason}` });

  return (
    <SettingsPage>
      <Two>
        <Band title="This hub" first>
          <Facts
            rows={[
              { label: 'Version', value: current },
              { label: 'Commit', value: commit },
              { label: 'Nodes', value: settings.data ? String(settings.data.node_count) : null },
              { label: 'Session', value: me.data ? (me.data.mode === 'token' ? `token ${me.data.token_name}` : 'admin') : null },
              { label: 'Public URL', value: settings.data ? settings.data.public_url || 'not set' : null },
            ]}
          />
          <HStack>
            <Button
              label="Sign out"
              variant="secondary"
              isLoading={logout.isPending}
              onClick={async () => {
                await logout.mutateAsync();
                navigate('/login');
              }}
            />
          </HStack>
        </Band>

        <Band title="Updates" desc={updates.data?.repo ? <Text type="code" color="secondary">{updates.data.repo}</Text> : undefined} first>
          <VStack data-testid="update-kv">
            <Facts rows={updateRows} />
          </VStack>
          {notes ? <CodeBlock code={notes} title={`${target} notes`} width="100%" isWrapped maxHeight={240} hasCopyButton={false} /> : null}
          {updates.data?.error ? <Notice message={{ kind: 'error', text: updates.data.error }} /> : null}
          <Notice message={message} />
          <HStack gap={2} wrap="wrap">
            <Button
              label="Check now"
              variant="secondary"
              isLoading={refresh.isPending}
              isDisabled={!updates.data?.enabled}
              onClick={() => refresh.mutate()}
            />
            {queued ? (
              <Button label={`Cancel ${queued.version}`} variant="secondary" isLoading={cancel.isPending} onClick={() => cancel.mutate()} />
            ) : (
              <Button
                label={target ? `Upgrade to ${target}` : 'Upgrade'}
                variant="primary"
                isDisabled={!canUpgrade && !canForce}
                tooltip={canUpgrade || canForce ? undefined : 'No newer release, or the hub cannot write its data directory'}
                onClick={() => {
                  setMessage(null);
                  setTyped('');
                  setConfirming(true);
                }}
              />
            )}
          </HStack>
          <Divider />
          <Text type="supporting">
            The hub writes a request; the root <Text type="code">cupola-upgrade</Text> unit verifies the checksum, swaps the binary and web
            build, restarts the service and rolls back if the health check fails.
          </Text>
        </Band>
      </Two>

      <Dialog isOpen={confirming} onOpenChange={setConfirming} purpose="form" width={440}>
        <Layout
          header={
            <DialogHeader
              title={`Upgrade to ${target}?`}
              subtitle="The hub restarts once. Polling stops for under a second and this page reconnects on its own."
              onOpenChange={setConfirming}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <TextInput
                  label={`Type ${target} to confirm`}
                  value={typed}
                  onChange={setTyped}
                  placeholder={target}
                  autoComplete="off"
                  autoCapitalize="none"
                  hasAutoCorrect={false}
                  hasSpellCheck={false}
                  onEnter={() => {
                    if (typed.trim() === target && !apply.isPending) void submit(!updates.data?.available || hold?.version === target);
                  }}
                />
                {message?.kind === 'error' ? <Notice message={message} /> : null}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Cancel" variant="secondary" onClick={() => setConfirming(false)} />
                <Button
                  label={`Upgrade to ${target}`}
                  variant="destructive"
                  isLoading={apply.isPending}
                  isDisabled={typed.trim() !== target}
                  onClick={() => void submit(!updates.data?.available || hold?.version === target)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </SettingsPage>
  );
}
