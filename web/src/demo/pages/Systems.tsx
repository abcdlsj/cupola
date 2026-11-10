import { useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useIsPhone } from '../Chrome';
import { nodes, units, type DemoNode } from '../fixtures';
import { CardSection, ChartCard, Figure, Meter, PageHead } from '../ui';

function tone(state: DemoNode['state']) {
  return state === 'healthy' ? 'success' : state === 'degraded' ? 'warning' : 'neutral';
}

function SystemName({ node }: { node: DemoNode }) {
  return (
    <HStack gap={1.5} vAlign="center">
      <a href={`#/nodes/${node.id}`}>{node.name}</a>
      <Text type="supporting">{node.role}</Text>
      {node.mode === 'push' ? <Text type="supporting">· push</Text> : null}
    </HStack>
  );
}

function SystemsTable({ shown }: { shown: DemoNode[] }) {
  return (
    <Table density="compact" dividers="rows" hasHover>
      <TableHeader>
        <TableRow>
          <TableHeaderCell>System</TableHeaderCell>
          <TableHeaderCell>CPU</TableHeaderCell>
          <TableHeaderCell>Memory</TableHeaderCell>
          <TableHeaderCell>Disk</TableHeaderCell>
          <TableHeaderCell>Load</TableHeaderCell>
          <TableHeaderCell>Up</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shown.map((node) => (
          <TableRow key={node.id}>
            <TableCell>
              <HStack gap={2} vAlign="center">
                <StatusDot variant={tone(node.state)} label={node.state} tooltip={`${node.name}: ${node.state}`} />
                <VStack gap={0}>
                  <SystemName node={node} />
                  <Text type="supporting">{node.os}</Text>
                </VStack>
              </HStack>
            </TableCell>
            <TableCell>
              <Meter value={node.cpu} label={`${node.name} CPU`} />
            </TableCell>
            <TableCell>
              <Meter value={node.memory} label={`${node.name} memory`} />
            </TableCell>
            <TableCell>
              <Meter value={node.disk} label={`${node.name} root filesystem`} />
            </TableCell>
            <TableCell>
              <Figure value={node.state === 'offline' ? null : node.load} unit={`/ ${node.cores}`} />
            </TableCell>
            <TableCell>
              <Text type="supporting">{node.uptime}</Text>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Below 900 px a table stops being readable: the same data becomes one block per system. */
function SystemRows({ shown }: { shown: DemoNode[] }) {
  return (
    <VStack gap={0}>
      {shown.map((entry) => (
        <VStack key={entry.id} gap={2} paddingBlock={3}>
          <HStack gap={2} vAlign="center" hAlign="between">
            <HStack gap={1.5} vAlign="center">
              <StatusDot variant={tone(entry.state)} label={entry.state} />
              <SystemName node={entry} />
            </HStack>
            <Text type="supporting">{entry.uptime}</Text>
          </HStack>
          {(
            [
              ['CPU', entry.cpu],
              ['Memory', entry.memory],
              ['Disk', entry.disk],
            ] as const
          ).map(([label, value]) => (
            <HStack key={label} gap={2} vAlign="center">
              <VStack width={72}>
                <Text type="supporting">{label}</Text>
              </VStack>
              <Meter value={value} label={`${entry.name} ${label}`} />
            </HStack>
          ))}
        </VStack>
      ))}
    </VStack>
  );
}

export function SystemsPage() {
  const phone = useIsPhone();
  const [query, setQuery] = useState('');
  const shown = nodes.filter((entry) => entry.name.includes(query.trim().toLowerCase()));
  const failed = units.filter((unit) => unit.state === 'failed');

  return (
    <>
      <PageHead
        title="Systems"
        desc="4 systems · 2 need attention · beelink is at 93 % disk · 1 unit failed"
        actions={
          <>
            <Button label="Settings" variant="secondary" onClick={() => { location.hash = '#/settings/nodes'; }} />
            <Button label="Refresh" variant="ghost" onClick={() => undefined} />
          </>
        }
      />

      <VStack maxWidth={320}>
        <TextInput
          label="Filter systems"
          isLabelHidden
          type="search"
          value={query}
          onChange={setQuery}
          placeholder="Filter systems…"
        />
      </VStack>

      <Card padding={phone ? 3 : 0}>
        {shown.length === 0 ? (
          <Text type="supporting">No system matches “{query}”.</Text>
        ) : phone ? (
          <SystemRows shown={shown} />
        ) : (
          <SystemsTable shown={shown} />
        )}
      </Card>

      <Grid columns={{ minWidth: 320, max: 4 }} gap={3}>
        <ChartCard
          title="CPU"
          desc="beelink · 8 cores · system and iowait · last hour"
          lines={[
            { label: 'system', seed: 7, base: 62, swing: 26 },
            { label: 'iowait', seed: 11, base: 9, swing: 14 },
          ]}
        />
        <ChartCard
          title="Memory"
          desc="beelink · used and cache · last hour"
          lines={[
            { label: 'used', seed: 23, base: 84, swing: 9 },
            { label: 'cache', seed: 29, base: 42, swing: 12 },
          ]}
        />
        <ChartCard
          title="Disk I/O"
          desc="atlas · nvme0n1 · read · last hour"
          lines={[{ label: 'read', seed: 31, base: 14, swing: 20 }]}
        />
        <ChartCard
          title="Network"
          desc="atlas · eno1 · receive · last hour"
          lines={[{ label: 'rx', seed: 43, base: 36, swing: 28 }]}
        />
      </Grid>

      <CardSection
        title="Services"
        padding={phone ? 3 : 0}
        desc={`${units.length} units across 4 systems · ${failed.length} failed`}
        actions={
          <Button label="View all" variant="ghost" onClick={() => { location.hash = '#/services'; }} />
        }
      >
        <VStack gap={0} padding={phone ? 0 : 3}>
          {units.slice(0, 5).map((unit) => (
            <HStack
              key={`${unit.node}/${unit.unit}`}
              gap={2}
              vAlign="center"
              hAlign="between"
              paddingBlock={2}
            >
              <HStack gap={2} vAlign="center">
                <StatusDot
                  variant={unit.state === 'failed' ? 'error' : unit.state === 'inactive' ? 'neutral' : 'success'}
                  label={unit.state}
                />
                <Text type="code">{unit.unit}</Text>
                <Text type="supporting">on {unit.node}</Text>
                {unit.state === 'failed' ? <Badge label="failed" variant="error" /> : null}
              </HStack>
              <Text type="supporting">{unit.since}</Text>
            </HStack>
          ))}
        </VStack>
      </CardSection>

    </>
  );
}
