import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { MissingThing } from '../../components/NotFoundPage';
import { LoadingPage } from '../../components/States';
import { useChannels, useDeleteRule, useFleet, useMe, useRule, useSaveRule, ApiError } from '../../data/queries';
import type { AlertRule, Severity } from '../../data/types';
import { PageHead, Section, useIsPhone } from '../../ui/kit';

const METRICS = ['cpu', 'mem', 'load', 'disk', 'inode', 'temp', 'psi_cpu', 'psi_io'];
const KINDS = ['node', 'service', 'container', 'system', 'network', 'action', 'disk', 'agent'];
const SEVERITIES: Severity[] = ['info', 'warning', 'critical'];
/** Selector options need a non-empty value; the rule stores "" for these. */
const ANY = 'any';

const back = <Link href="/alerts">Alerts</Link>;

export function RuleEditorPage() {
  const { ruleId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const me = useMe();
  const editing = Boolean(ruleId && ruleId !== 'new');
  const existing = useRule(editing ? ruleId : undefined);
  const fleet = useFleet();
  const channels = useChannels();
  const save = useSaveRule();
  const remove = useDeleteRule();
  const [error, setError] = useState<string | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
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
    if (!form.name?.trim()) {
      setNameMissing(true);
      return;
    }
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
      <>
        <PageHead title="Not found" leading={back} />
        <MissingThing what={`No rule has the id “${ruleId ?? ''}”`} back="/alerts" backLabel="Back to alerts" />
      </>
    );
  }
  if ((editing && existing.isPending) || me.isPending) return <LoadingPage title="Rule" />;

  const fieldGrid = { minWidth: 220, repeat: 'fit' as const };
  const size = phone ? 'lg' : 'md';

  return (
    <>
      <PageHead
        leading={back}
        title={editing ? form.name || 'Rule' : 'New rule'}
        desc={
          form.type === 'event'
            ? 'Notify a channel when an event kind arrives (unit failed, container restarted, node offline, port opened).'
            : 'Notify a channel when a metric crosses a threshold for the configured duration.'
        }
      />
      {!admin ? (
        <Banner
          status="info"
          title="Read-only"
          description="This session uses an API token. Sign in as the hub admin to edit rules."
          collapsible={false}
        />
      ) : (
        <VStack maxWidth={880}>
          <Section title="Rule">
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <VStack gap={5}>
                <Grid columns={fieldGrid} gap={4}>
                  <TextInput
                    label="Name"
                    isRequired
                    value={form.name ?? ''}
                    status={nameMissing && !form.name?.trim() ? { type: 'error', message: 'A rule needs a name.' } : undefined}
                    onChange={(value) => update('name', value)}
                  />
                  <VStack gap={1}>
                    <Text type="label">Type</Text>
                    <SegmentedControl
                      label="Type"
                      value={form.type ?? 'metric'}
                      onChange={(value) => update('type', value as AlertRule['type'])}
                    >
                      <SegmentedControlItem value="metric" label="Metric threshold" />
                      <SegmentedControlItem value="event" label="Event" />
                    </SegmentedControl>
                  </VStack>
                  <Selector
                    label="Severity"
                    value={form.severity ?? 'warning'}
                    options={SEVERITIES}
                    onChange={(value) => update('severity', value as Severity)}
                  />
                  <Selector
                    label="Node"
                    value={form.node_id || ANY}
                    options={[
                      { value: ANY, label: 'All nodes' },
                      ...(fleet.data?.nodes ?? []).map((view) => ({ value: view.node.id, label: view.node.name })),
                    ]}
                    onChange={(value) => update('node_id', value === ANY ? '' : value)}
                  />
                  <Selector
                    label="Channel"
                    value={form.channel_id || ANY}
                    options={[
                      { value: ANY, label: 'In-app only' },
                      ...(channels.data ?? []).map((channel) => ({ value: channel.id, label: channel.name })),
                    ]}
                    onChange={(value) => update('channel_id', value === ANY ? '' : value)}
                  />
                  <NumberInput
                    label="Cooldown"
                    units="s"
                    min={0}
                    isIntegerOnly
                    value={form.cooldown_sec ?? 300}
                    onChange={(value) => update('cooldown_sec', value)}
                  />
                </Grid>

                {form.type === 'metric' ? (
                  <Grid columns={fieldGrid} gap={4}>
                    <Selector
                      label="Metric"
                      value={form.metric ?? 'cpu'}
                      options={METRICS}
                      onChange={(value) => update('metric', value)}
                    />
                    <VStack gap={1}>
                      <Text type="label">Comparator</Text>
                      <SegmentedControl
                        label="Comparator"
                        value={form.comparator ?? 'gt'}
                        onChange={(value) => update('comparator', value as 'gt' | 'lt')}
                      >
                        <SegmentedControlItem value="gt" label="above" />
                        <SegmentedControlItem value="lt" label="below" />
                      </SegmentedControl>
                    </VStack>
                    <NumberInput
                      label="Threshold"
                      step={0.1}
                      value={form.threshold ?? 0}
                      onChange={(value) => update('threshold', value)}
                    />
                    <NumberInput
                      label="Duration"
                      units="s"
                      min={0}
                      isIntegerOnly
                      value={form.duration_sec ?? 0}
                      onChange={(value) => update('duration_sec', value)}
                    />
                  </Grid>
                ) : (
                  <CheckboxList
                    label="Event kinds"
                    value={form.kinds ?? []}
                    onChange={(values) => update('kinds', values)}
                  >
                    <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={0}>
                      {KINDS.map((kind) => (
                        <CheckboxListItem key={kind} value={kind} label={kind} />
                      ))}
                    </Grid>
                  </CheckboxList>
                )}

                <Switch label="Enabled" value={form.enabled ?? true} onChange={(checked) => update('enabled', checked)} />

                {error ? <Banner status="error" title={error} collapsible={false} /> : null}
                {save.isError && !error ? (
                  <Banner
                    status="error"
                    title={save.error instanceof Error ? save.error.message : 'Save failed'}
                    collapsible={false}
                  />
                ) : null}

                <HStack gap={2} vAlign="center" hAlign="end" wrap="wrap">
                  {editing ? (
                    <Button
                      label="Delete rule"
                      variant="destructive"
                      size={size}
                      isLoading={remove.isPending}
                      onClick={async () => {
                        if (!ruleId) return;
                        if (!window.confirm('Delete this rule? Alerts already sent stay in the history.')) return;
                        await remove.mutateAsync(ruleId);
                        navigate('/alerts');
                      }}
                    />
                  ) : null}
                  <Button label="Cancel" variant="ghost" size={size} href="/alerts" />
                  <Button type="submit" label="Save rule" variant="primary" size={size} isLoading={save.isPending} />
                </HStack>
              </VStack>
            </form>
          </Section>
        </VStack>
      )}
      <VStack maxWidth={880}>
        <Text type="supporting">
          Metric rules evaluate on every poll and need the condition to hold for the duration. Event rules evaluate as events arrive. Webhook
          URLs and channel secrets are encrypted at rest; delivery is signed with HMAC-SHA256 when a secret is set.
        </Text>
      </VStack>
    </>
  );
}
