import { useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { actions, events, rules, units } from '../fixtures';
import { useIsPhone } from '../Chrome';
import { Band, FindingRow, PageHead } from '../ui';

interface UnitRow extends Record<string, unknown> {
  node: string;
  unit: string;
  state: 'active' | 'failed' | 'inactive';
  since: string;
  description: string;
}

const unitColumns: TableColumn<UnitRow>[] = [
  {
    key: 'unit',
    header: 'Unit',
    width: proportional(2, { minWidth: 280 }),
    renderCell: (row) => (
      <VStack gap={0}>
        <HStack gap={1.5} vAlign="center">
          <StatusDot
            variant={row.state === 'failed' ? 'error' : row.state === 'inactive' ? 'neutral' : 'success'}
            label={row.state}
          />
          <Text type="code">{row.unit}</Text>
        </HStack>
        <Text type="supporting">{row.description}</Text>
      </VStack>
    ),
  },
  {
    key: 'node',
    header: 'System',
    width: proportional(1, { minWidth: 140 }),
    renderCell: (row) => <a href={`#/nodes/${row.node}/services`}>{row.node}</a>,
  },
  {
    key: 'state',
    header: 'State',
    width: pixel(140),
    renderCell: (row) => <Text type="supporting">{row.state}</Text>,
  },
  {
    key: 'since',
    header: 'Since',
    width: pixel(110),
    renderCell: (row) => <Text type="supporting">{row.since}</Text>,
  },
];

export function ServicesPage() {
  const phone = useIsPhone();
  const [query, setQuery] = useState('');
  const shown = units.filter((unit) => `${unit.node} ${unit.unit}`.includes(query.trim().toLowerCase()));
  const failed = shown.filter((unit) => unit.state === 'failed');
  const rest = shown.filter((unit) => unit.state !== 'failed');

  return (
    <>
      <PageHead
        title="Services"
        desc="systemd units the operator can act on · failed first"
        actions={
          <VStack width={260}>
            <TextInput
              label="Filter units"
              isLabelHidden
              type="search"
              value={query}
              onChange={setQuery}
              placeholder="Filter units…"
            />
          </VStack>
        }
      />

      {failed.length ? (
        <Band title="Failed" desc="Something stopped and stayed stopped" first>
          <VStack gap={0}>
            {failed.map((unit) => (
              <FindingRow
                key={`${unit.node}/${unit.unit}`}
                state="error"
                what={unit.unit}
                where={`${unit.node} · ${unit.description}`}
                ago={unit.since}
                href={`#/nodes/${unit.node}/services`}
              />
            ))}
          </VStack>
        </Band>
      ) : null}

      <Band
        title={failed.length ? 'Everything else' : 'Units'}
        desc={`${rest.length} units · ${new Set(units.map((unit) => unit.node)).size} systems`}
        first={failed.length === 0}
      >
        {phone ? (
          <VStack gap={0}>
            {rest.map((unit) => (
              <FindingRow
                key={`${unit.node}/${unit.unit}`}
                state={unit.state === 'inactive' ? 'neutral' : 'success'}
                what={unit.unit}
                where={`${unit.node} · ${unit.description}`}
                ago={unit.since}
                href={`#/nodes/${unit.node}/services`}
              />
            ))}
          </VStack>
        ) : rest.length === 0 ? (
          <EmptyState
            title="No unit matches that filter"
            description="Nothing on this fleet has that name. Clear the filter to see all units."
            isCompact
            headingLevel={3}
          />
        ) : (
          <Table
            data={rest as unknown as UnitRow[]}
            columns={unitColumns}
            idKey={(row) => `${row.node}/${row.unit}`}
            density="compact"
            dividers="rows"
            hasHover
          />
        )}
      </Band>
    </>
  );
}

export function AppsPage() {
  return (
    <>
      <PageHead
        title="Apps"
        desc="Actions the agent advertises. The hub can only run these; it cannot define them."

      />
      <Band title="Actions" desc={`${actions.length} available`} first>
        <VStack gap={0}>
          {actions.map((action) => (
            <HStack
              key={action.id}
              gap={3}
              vAlign="center"
              hAlign="between"
              paddingBlock={3}
              wrap="wrap"
            >
              <VStack gap={0.5}>
                <HStack gap={1.5} vAlign="center">
                  <Text>{action.label}</Text>
                  <Badge label={action.type} variant={action.type === 'wol' ? 'info' : 'neutral'} />
                  <a href={`#/nodes/${action.node}/apps`}>{action.node}</a>
                </HStack>
                <Text type="supporting">
                  {action.detail} · last run {action.lastRun}
                </Text>
              </VStack>
              <Button
                label={action.type === 'wol' ? 'Wake' : 'Run'}
                variant={action.type === 'wol' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => undefined}
              />
            </HStack>
          ))}
        </VStack>
      </Band>
      <Card>
        <VStack gap={2}>
          <Text type="label" color="secondary">
            Run limits
          </Text>
          <Text type="supporting">
            One run per action per node · 60 s timeout · output truncated to 8 KiB · every result is an
            event · dangerous actions require typing the action name.
          </Text>
        </VStack>
      </Card>
    </>
  );
}

interface RuleRow extends Record<string, unknown> {
  id: string;
  what: string;
  scope: string;
  when: string;
  channel: string;
  state: 'firing' | 'ok' | 'muted';
}

const ruleColumns: TableColumn<RuleRow>[] = [
  {
    key: 'what',
    header: 'Rule',
    width: proportional(1, { minWidth: 220 }),
    renderCell: (row) => <Text>{row.what}</Text>,
  },
  {
    key: 'scope',
    header: 'Applies to',
    width: pixel(160),
    renderCell: (row) => <Text type="supporting">{row.scope}</Text>,
  },
  {
    key: 'when',
    header: 'Condition',
    width: proportional(1, { minWidth: 260 }),
    renderCell: (row) => <Text type="code">{row.when}</Text>,
  },
  {
    key: 'channel',
    header: 'Channel',
    width: pixel(180),
    renderCell: (row) => <Text type="supporting">{row.channel}</Text>,
  },
  {
    key: 'state',
    header: 'State',
    width: pixel(120),
    renderCell: (row) => (
      <HStack gap={1.5} vAlign="center">
        <StatusDot
          variant={row.state === 'firing' ? 'error' : row.state === 'muted' ? 'neutral' : 'success'}
          label={row.state}
        />
        <Text type="supporting">{row.state}</Text>
      </HStack>
    ),
  },
  {
    key: 'edit',
    header: '',
    width: pixel(80),
    align: 'end',
    renderCell: () => <Button label="Edit" variant="ghost" size="sm" onClick={() => undefined} />,
  },
];

export function AlertsPage() {
  const firing = rules.filter((rule) => rule.state === 'firing');
  return (
    <>
      <PageHead
        title="Alerts"
        desc={`${firing.length} firing · ${rules.length} rules`}
        actions={<Button label="New rule" variant="primary" onClick={() => undefined} />}
      />

      <Band
        title="Firing"
        desc="What is wrong right now, newest first"
        actions={<Text type="supporting">{firing.length} of {rules.length} rules</Text>}
        first
      >
        <Grid columns={{ minWidth: 380, repeat: 'fit' }} gap={3}>
          {firing.map((rule) => (
            <Card key={rule.id}>
              <VStack gap={3}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <StatusDot variant="error" label="firing" isPulsing />
                  <Text weight="semibold">{rule.what}</Text>
                </HStack>
                <Divider />
                <VStack gap={1}>
                  <Text type="code">{rule.when}</Text>
                  <Text type="supporting">
                    {rule.scope} · {rule.channel}
                  </Text>
                </VStack>
                <Button label="Open rule" variant="secondary" size="sm" onClick={() => undefined} />
              </VStack>
            </Card>
          ))}
        </Grid>
      </Band>

      <Band
        title="All rules"
        desc="Metric, event, prediction and SMART rules"
        actions={
          <Text type="supporting">
            {rules.filter((rule) => rule.state === 'muted').length} muted
          </Text>
        }
      >
        <Table
          data={rules as unknown as RuleRow[]}
          columns={ruleColumns}
          idKey="id"
          density="compact"
          dividers="rows"
          hasHover
        />
      </Band>
    </>
  );
}

interface EventRow extends Record<string, unknown> {
  id: number;
  node: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  ago: string;
}

export function EventsPage() {
  const [kind, setKind] = useState<string | null>(null);
  const kinds = [...new Set(events.map((event) => event.kind))];
  const shown = kind ? events.filter((event) => event.kind === kind) : events;

  return (
    <>
      <PageHead
        title="Events"
        desc="Everything the hub and the agents decided was worth telling you"
        actions={
          <HStack gap={2} wrap="wrap">
            <Button label="All" variant={kind === null ? 'primary' : 'ghost'} size="sm" onClick={() => setKind(null)} />
            {kinds.map((entry) => (
              <Button
                key={entry}
                label={`${entry} (${events.filter((event) => event.kind === entry).length})`}
                variant={kind === entry ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setKind(entry)}
              />
            ))}
          </HStack>
        }
      />

      <Band
        title="By kind"
        desc="What the last hour looked like, before the timeline"
        first
      >
        <Grid columns={{ minWidth: 150, repeat: 'fit' }} gap={3}>
          {kinds.map((entry) => {
            const rows = events.filter((event) => event.kind === entry);
            const worst = rows.some((event) => event.severity === 'critical')
              ? 'error'
              : rows.some((event) => event.severity === 'warning')
                ? 'warning'
                : 'neutral';
            return (
              <HStack key={entry} gap={2} vAlign="center">
                <StatusDot variant={worst} label={entry} />
                <VStack gap={0}>
                  <Text>{entry}</Text>
                  <Text type="supporting">
                    {rows.length} · newest {rows[0]?.ago ?? '—'}
                  </Text>
                </VStack>
              </HStack>
            );
          })}
        </Grid>
      </Band>

      <Band
        title="Timeline"
        desc={`${shown.length} events · grouped by kind`}
        actions={
          <HStack gap={3} vAlign="center">
            <Text type="supporting">
              {shown.filter((event) => event.severity === 'critical').length} critical
            </Text>
            <Text type="supporting">
              {shown.filter((event) => event.severity === 'warning').length} warning
            </Text>
          </HStack>
        }
      >
        {shown.length === 0 ? (
          <EmptyState
            title="Nothing in this kind"
            description="No event of that kind in the last hour."
            isCompact
            headingLevel={3}
          />
        ) : (
          <Table
            data={shown as unknown as EventRow[]}
            columns={[
              {
                key: 'message',
                header: 'Event',
                width: proportional(1, { minWidth: 300 }),
                renderCell: (row) => (
                  <HStack gap={2} vAlign="center">
                    <StatusDot
                      variant={
                        row.severity === 'critical'
                          ? 'error'
                          : row.severity === 'warning'
                            ? 'warning'
                            : 'neutral'
                      }
                      label={row.severity}
                    />
                    <Text>{row.message}</Text>
                  </HStack>
                ),
              },
              {
                key: 'node',
                header: 'System',
                width: proportional(1, { minWidth: 120 }),
                renderCell: (row) => <a href={`#/nodes/${row.node}/events`}>{row.node}</a>,
              },
              {
                key: 'kind',
                header: 'Kind',
                width: pixel(110),
                renderCell: (row) => <Text type="supporting">{row.kind}</Text>,
              },
              {
                key: 'ago',
                header: 'When',
                width: pixel(90),
                align: 'end',
                renderCell: (row) => <Text type="supporting">{row.ago}</Text>,
              },
              {
                key: 'watch',
                header: '',
                width: pixel(170),
                align: 'end',
                renderCell: () => (
                  <Button label="Alert me about this" variant="ghost" size="sm" onClick={() => undefined} />
                ),
              },
            ]}
            idKey="id"
            density="balanced"
            dividers="rows"
            hasHover
          />
        )}
      </Band>
    </>
  );
}

export function NotFoundPage() {
  return (
    <Card>
      <VStack gap={3}>
        <Text>Not found</Text>
        <Text type="supporting">This demo has no page at {location.hash || '#/'}.</Text>
        <Button label="Back to the fleet" variant="secondary" onClick={() => { location.hash = '#/'; }} />
      </VStack>
    </Card>
  );
}
