import { useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
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
    width: pixel(140),
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

export function AlertsPage() {
  const firing = rules.filter((rule) => rule.state === 'firing');
  return (
    <>
      <PageHead
        title="Alerts"
        desc={`${firing.length} firing · ${rules.length} rules`}
        actions={<Button label="New rule" variant="primary" onClick={() => undefined} />}
      />

      <Band title="Firing" desc="What is wrong right now, newest first" first>
        <VStack gap={3}>
          {firing.map((rule) => (
            <Card key={rule.id}>
              <VStack gap={3}>
                <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                  <HStack gap={2} vAlign="center">
                    <StatusDot variant="error" label="firing" isPulsing />
                    <Text weight="semibold">{rule.what}</Text>
                    <Text type="supporting">{rule.scope}</Text>
                  </HStack>
                  <Text type="supporting">{rule.state}</Text>
                </HStack>
                <Divider />
                <HStack gap={4} vAlign="center" wrap="wrap">
                  <Text type="code">{rule.when}</Text>
                  <Text type="supporting">→ {rule.channel}</Text>
                  <Button label="Open rule" variant="secondary" size="sm" onClick={() => undefined} />
                </HStack>
              </VStack>
            </Card>
          ))}
        </VStack>
      </Band>

      <Band title="All rules" desc="Metric, event, prediction and SMART rules">
        <VStack gap={0}>
          {rules.map((rule) => (
            <FindingRow
              key={rule.id}
              state={rule.state === 'firing' ? 'error' : rule.state === 'muted' ? 'neutral' : 'success'}
              what={rule.what}
              where={`${rule.scope} · ${rule.when} · ${rule.channel}`}
              action={
                <Button label="Edit" variant="ghost" size="sm" onClick={() => undefined} />
              }
            />
          ))}
        </VStack>
      </Band>
    </>
  );
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

      <Band title="Timeline" desc={`${shown.length} events · grouped by kind`} first>
        <VStack gap={0}>
          {shown.map((event, index) => (
            <VStack key={event.id} gap={0}>
              {index > 0 ? <Divider /> : null}
              <HStack gap={3} vAlign="center" hAlign="between" padding={3} wrap="wrap">
                <HStack gap={2} vAlign="center">
                  <StatusDot
                    variant={
                      event.severity === 'critical' ? 'error' : event.severity === 'warning' ? 'warning' : 'neutral'
                    }
                    label={event.severity}
                  />
                  <VStack gap={0}>
                    <Text>{event.message}</Text>
                    <HStack gap={1}>
                      <a href={`#/nodes/${event.node}/events`}>{event.node}</a>
                      <Text type="supporting">· {event.kind}</Text>
                    </HStack>
                  </VStack>
                </HStack>
                <HStack gap={3} vAlign="center">
                  <Text type="supporting">{event.ago}</Text>
                  <Button label="Alert me about this" variant="ghost" size="sm" onClick={() => undefined} />
                </HStack>
              </HStack>
            </VStack>
          ))}
        </VStack>
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
