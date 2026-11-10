import { useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import {
  pixel,
  proportional,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  type TableColumn,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { actions, events, rules, units } from '../fixtures';
import { useIsPhone } from '../Chrome';
import { CardSection, PageHead } from '../ui';

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
    width: proportional(2, { minWidth: 260 }),
    renderCell: (row) => (
      <VStack gap={0}>
        <Text type="code">{row.unit}</Text>
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
    width: pixel(160),
    renderCell: (row) => (
      <HStack gap={1.5} vAlign="center">
        <StatusDot
          variant={row.state === 'failed' ? 'error' : row.state === 'inactive' ? 'neutral' : 'success'}
          label={row.state}
        />
        <Text type="supporting">{row.state}</Text>
      </HStack>
    ),
  },
  {
    key: 'since',
    header: 'Since',
    width: pixel(120),
    renderCell: (row) => <Text type="supporting">{row.since}</Text>,
  },
];

export function ServicesPage() {
  const phone = useIsPhone();
  const [query, setQuery] = useState('');
  const shown = units.filter((unit) => `${unit.node} ${unit.unit}`.includes(query.trim().toLowerCase()));
  const failed = units.filter((unit) => unit.state === 'failed').length;

  return (
    <>
      <PageHead title="Services" desc={`${units.length} units across 4 systems · ${failed} failed`} />
      <VStack maxWidth={320}>
        <TextInput
          label="Filter units"
          isLabelHidden
          type="search"
          value={query}
          onChange={setQuery}
          placeholder="Filter units…"
        />
      </VStack>
      <Card padding={phone ? 3 : 0}>
        {phone ? (
          <VStack gap={0}>
            {shown.map((unit) => (
              <VStack key={`${unit.node}/${unit.unit}`} gap={1} paddingBlock={2}>
                <HStack gap={1.5} vAlign="center">
                  <StatusDot
                    variant={unit.state === 'failed' ? 'error' : unit.state === 'inactive' ? 'neutral' : 'success'}
                    label={unit.state}
                  />
                  <Text type="code">{unit.unit}</Text>
                </HStack>
                <Text type="supporting">
                  {unit.node} · {unit.state} · {unit.since}
                </Text>
              </VStack>
            ))}
          </VStack>
        ) : (
          <Table
            data={shown as unknown as UnitRow[]}
            columns={unitColumns}
            idKey={(row) => `${row.node}/${row.unit}`}
            density="compact"
            dividers="rows"
            hasHover
          />
        )}
      </Card>
    </>
  );
}

export function AppsPage() {
  return (
    <>
      <PageHead
        title="Apps"
        desc={`${actions.length} actions · defined in the agent config, run by the hub`}
        actions={<Button label="How actions work" variant="ghost" onClick={() => { location.hash = '#/settings/about'; }} />}
      />
      <Grid columns={{ minWidth: 260, max: 3 }} gap={3}>
        {actions.map((action) => (
          <Card key={action.id}>
            <VStack gap={3}>
              <HStack gap={2} vAlign="center" hAlign="between">
                <Heading level={2}>{action.label}</Heading>
                <Badge label={action.type} variant={action.type === 'wol' ? 'info' : 'neutral'} />
              </HStack>
              <VStack gap={1}>
                <Text type="supporting">{action.detail}</Text>
                <HStack gap={1.5} vAlign="center">
                  <a href={`#/nodes/${action.node}/apps`}>{action.node}</a>
                  <Text type="supporting">· last run {action.lastRun}</Text>
                </HStack>
              </VStack>
              <HStack gap={2}>
                <Button label="Run" variant="secondary" onClick={() => undefined} />
                <Button label="History" variant="ghost" onClick={() => undefined} />
              </HStack>
            </VStack>
          </Card>
        ))}
      </Grid>
    </>
  );
}

export function AlertsPage() {
  const firing = rules.filter((rule) => rule.state === 'firing');
  return (
    <>
      <PageHead
        title="Alerts"
        desc={`${firing.length} firing · ${rules.length} rules · webhook and ntfy`}
        actions={<Button label="New rule" variant="primary" onClick={() => undefined} />}
      />
      <CardSection title="Firing" desc="What is wrong right now">
        <VStack gap={0}>
          {firing.length === 0 ? (
            <Text type="supporting">Nothing is firing.</Text>
          ) : (
            firing.map((rule) => (
              <HStack key={rule.id} gap={2} vAlign="center" hAlign="between" paddingBlock={2}>
                <HStack gap={2} vAlign="center">
                  <StatusDot variant="error" label="firing" isPulsing />
                  <Text>{rule.what}</Text>
                  <Text type="supporting">
                    {rule.scope} · {rule.when}
                  </Text>
                </HStack>
                <Text type="supporting">{rule.channel}</Text>
              </HStack>
            ))
          )}
        </VStack>
      </CardSection>
      <CardSection title="Rules" desc="Metric, event and prediction rules" padding={0}>
        <Table density="compact" dividers="rows" hasHover>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Rule</TableHeaderCell>
              <TableHeaderCell>When</TableHeaderCell>
              <TableHeaderCell>Channel</TableHeaderCell>
              <TableHeaderCell>State</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>
                  <VStack gap={0}>
                    <Text>{rule.what}</Text>
                    <Text type="supporting">{rule.scope}</Text>
                  </VStack>
                </TableCell>
                <TableCell>
                  <Text type="code">{rule.when}</Text>
                </TableCell>
                <TableCell>
                  <Text type="supporting">{rule.channel}</Text>
                </TableCell>
                <TableCell>
                  <HStack gap={1.5} vAlign="center">
                    <StatusDot
                      variant={rule.state === 'firing' ? 'error' : rule.state === 'muted' ? 'neutral' : 'success'}
                      label={rule.state}
                    />
                    <Text type="supporting">{rule.state}</Text>
                  </HStack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardSection>
    </>
  );
}

export function EventsPage() {
  const [kind, setKind] = useState<string | null>(null);
  const kinds = [...new Set(events.map((event) => event.kind))];
  const shown = kind ? events.filter((event) => event.kind === kind) : events;

  return (
    <>
      <PageHead title="Events" desc={`${events.length} in the last hour · grouped by kind`} />
      <HStack gap={2} wrap="wrap">
        <Button
          label="All"
          variant={kind === null ? 'primary' : 'ghost'}
          onClick={() => setKind(null)}
        />
        {kinds.map((entry) => (
          <Button
            key={entry}
            label={entry}
            variant={kind === entry ? 'primary' : 'ghost'}
            onClick={() => setKind(entry)}
          />
        ))}
      </HStack>
      <CardSection padding={0}>
        <VStack gap={0}>
          {shown.map((event, index) => (
            <VStack key={event.id} gap={0}>
              {index > 0 ? <Divider /> : null}
              <HStack gap={3} vAlign="center" hAlign="between" padding={3} wrap="wrap">
                <HStack gap={2} vAlign="center">
                  <StatusDot
                    variant={
                      event.severity === 'critical'
                        ? 'error'
                        : event.severity === 'warning'
                          ? 'warning'
                          : 'neutral'
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
      </CardSection>
    </>
  );
}

export function NotFoundPage() {
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={1}>Not found</Heading>
        <Text type="supporting">This demo has no page at {location.hash || '#/'}.</Text>
        <Button label="Back to systems" variant="secondary" onClick={() => { location.hash = '#/'; }} />
      </VStack>
    </Card>
  );
}
