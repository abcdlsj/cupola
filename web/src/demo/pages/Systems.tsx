import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { HStack } from '@astryxdesign/core/HStack';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { nodes, type DemoNode } from '../fixtures';
import { Band, ChartCard, Figure, Meter, PageHead } from '../ui';

interface SystemRow extends Record<string, unknown> {
  id: string;
  name: string;
  role: string;
  os: string;
  state: DemoNode['state'];
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  load: number;
  cores: number;
  uptime: string;
  mode: 'pull' | 'push';
}

const rows = nodes as unknown as SystemRow[];

function tone(state: DemoNode['state']) {
  return state === 'healthy' ? 'success' : state === 'degraded' ? 'warning' : 'neutral';
}

const columns: TableColumn<SystemRow>[] = [
  {
    key: 'name',
    header: 'System',
    width: proportional(1, { minWidth: 260 }),
    renderCell: (row) => (
      <HStack gap={2} vAlign="center">
        <StatusDot variant={tone(row.state)} label={row.state} tooltip={`${row.name}: ${row.state}`} />
        <VStack gap={0}>
          <HStack gap={1.5} vAlign="center">
            <a href={`#/nodes/${row.id}`}>{row.name}</a>
            <Text type="supporting">{row.role}</Text>
          </HStack>
          <Text type="supporting">{row.os}</Text>
        </VStack>
      </HStack>
    ),
  },
  {
    key: 'cpu',
    header: 'CPU',
    width: pixel(210),
    renderCell: (row) => <Meter value={row.cpu} label={`${row.name} CPU`} width={72} />,
  },
  {
    key: 'memory',
    header: 'Memory',
    width: pixel(210),
    renderCell: (row) => <Meter value={row.memory} label={`${row.name} memory`} width={72} />,
  },
  {
    key: 'disk',
    header: 'Disk',
    width: pixel(210),
    renderCell: (row) => <Meter value={row.disk} label={`${row.name} root filesystem`} width={72} />,
  },
  {
    key: 'load',
    header: 'Load',
    width: pixel(96),
    align: 'end',
    renderCell: (row) => <Figure value={row.state === 'offline' ? null : row.load} unit={`/ ${row.cores}`} />,
  },
  {
    key: 'uptime',
    header: 'Up',
    width: pixel(150),
    align: 'end',
    renderCell: (row) => <Text type="supporting">{row.uptime}</Text>,
  },
];

const RANGES = ['1 h', '24 h', '7 d'] as const;

/** A table stops being readable at 390 px: the same rows become one block each. */
function SystemBlocks() {
  return (
    <VStack gap={0}>
      {[...nodes]
        .sort((a, b) => (b.disk ?? -1) - (a.disk ?? -1))
        .map((entry) => (
          <VStack key={entry.id} gap={2} paddingBlock={3}>
            <HStack gap={2} vAlign="center" hAlign="between">
              <HStack gap={1.5} vAlign="center">
                <StatusDot variant={tone(entry.state)} label={entry.state} />
                <a href={`#/nodes/${entry.id}`}>{entry.name}</a>
                <Text type="supporting">{entry.role}</Text>
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
              <HStack key={label} gap={3} vAlign="center">
                <VStack width={72}>
                  <Text type="supporting">{label}</Text>
                </VStack>
                <Meter value={value} label={`${entry.name} ${label}`} width={200} />
              </HStack>
            ))}
          </VStack>
        ))}
    </VStack>
  );
}

export function SystemsPage() {
  const phone = useMediaQuery('(max-width: 899px)');
  const [range, setRange] = useState<string>('1 h');

  return (
    <>
      <PageHead
        title="Systems"
        desc="4 systems · polling every 5 s"
        actions={
          <>
            <HStack gap={2} vAlign="center" paddingInline={2}>
              <StatusDot variant="success" label="Live" isPulsing tooltip="Polling every 5 s" />
              <Text type="supporting">last ingest 2 s ago</Text>
            </HStack>
            <Button label="Refresh" variant="secondary" onClick={() => undefined} />
          </>
        }
      />

      <Band first>
        {phone ? (
          <SystemBlocks />
        ) : (
          <Table
            data={[...rows].sort((a, b) => (b.disk ?? -1) - (a.disk ?? -1))}
            columns={columns}
            idKey="id"
            density="compact"
            dividers="rows"
            hasHover
          />
        )}
      </Band>

      <Band
        title="Fleet"
        desc={`four systems, the two under load first · ${range}`}
        actions={
          <SegmentedControl label="Range" size="sm" value={range} onChange={setRange}>
            {RANGES.map((item) => (
              <SegmentedControlItem key={item} value={item} label={item} />
            ))}
          </SegmentedControl>
        }
      >
        <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={3}>
          <ChartCard
            title="beelink · CPU"
            desc="system time, one minute rollup"
            lines={[{ label: 'beelink', seed: 7, base: 62, swing: 26 }]}
            height={200}
          />
          <ChartCard
            title="beelink · memory"
            desc="used memory, one minute rollup"
            lines={[{ label: 'beelink', seed: 23, base: 84, swing: 9 }]}
            height={200}
          />
          <ChartCard
            title="atlas · CPU"
            desc="system time, one minute rollup"
            lines={[{ label: 'atlas', seed: 11, base: 12, swing: 10 }]}
            height={200}
          />
          <ChartCard
            title="atlas · memory"
            desc="used memory, one minute rollup"
            lines={[{ label: 'atlas', seed: 29, base: 41, swing: 10 }]}
            height={200}
          />
        </Grid>
      </Band>
    </>
  );
}
