import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { nodes, units, type DemoNode } from '../fixtures';
import { Band, ChartCard, FindingRow, Figure, Kpi, KpiGrid, Meter, PageHead } from '../ui';

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
    width: proportional(1, { minWidth: 200 }),
    renderCell: (row) => (
      <HStack gap={2} vAlign="center">
        <StatusDot variant={tone(row.state)} label={row.state} tooltip={`${row.name}: ${row.state}`} />
        <VStack gap={0}>
          <HStack gap={1.5} vAlign="center">
            <a href={`#/nodes/${row.id}`}>{row.name}</a>
            <Text type="supporting">{row.role}</Text>
          </HStack>
          <Text type="supporting">
            {row.os} · {row.mode}
          </Text>
        </VStack>
      </HStack>
    ),
  },
  {
    key: 'cpu',
    header: 'CPU',
    width: proportional(1, { minWidth: 190 }),
    renderCell: (row) => <Meter value={row.cpu} label={`${row.name} CPU`} width={72} />,
  },
  {
    key: 'memory',
    header: 'Memory',
    width: proportional(1, { minWidth: 190 }),
    renderCell: (row) => <Meter value={row.memory} label={`${row.name} memory`} width={72} />,
  },
  {
    key: 'disk',
    header: 'Disk',
    width: proportional(1, { minWidth: 190 }),
    renderCell: (row) => <Meter value={row.disk} label={`${row.name} root filesystem`} width={72} />,
  },
  {
    key: 'load',
    header: 'Load',
    width: pixel(110),
    renderCell: (row) => <Figure value={row.state === 'offline' ? null : row.load} unit={`/ ${row.cores}`} />,
  },
  {
    key: 'uptime',
    header: 'Up',
    width: pixel(130),
    renderCell: (row) => <Text type="supporting">{row.uptime}</Text>,
  },
];

const RANGES = ['1 h', '24 h', '7 d'] as const;

export function SystemsPage() {
  const [range, setRange] = useState<string>('1 h');
  const failed = units.filter((unit) => unit.state === 'failed');
  const offline = nodes.filter((node) => node.state === 'offline');
  const worst = [...nodes]
    .filter((node) => node.state !== 'offline')
    .sort((a, b) => (b.disk ?? 0) - (a.disk ?? 0))[0];
  const strained = nodes.filter((node) => node.state === 'degraded').length;

  return (
    <>
      <PageHead
        title="Fleet"
        desc="Four machines, one page. Anything not green is listed before the charts."
        actions={
          <>
            <HStack gap={2} vAlign="center" paddingInline={2}>
              <StatusDot variant="success" label="Live" isPulsing tooltip="Polling every 5 s" />
              <Text type="supporting">last ingest 2 s ago</Text>
            </HStack>
            <SegmentedControl
              label="Range"
              size="sm"
              value={range}
              onChange={(value) => setRange(value)}
            >
              {RANGES.map((entry) => (
                <SegmentedControlItem key={entry} value={entry} label={entry} />
              ))}
            </SegmentedControl>
            <Button label="Refresh" variant="secondary" onClick={() => undefined} />
          </>
        }
      />

      <KpiGrid>
        <Kpi
          label="Online"
          value={`${nodes.length - offline.length}`}
          unit={`of ${nodes.length}`}
          state={offline.length ? 'warning' : 'success'}
          note={offline.length ? `${offline[0].name} silent for 14 m` : 'all systems reporting'}
        />
        <Kpi
          label="Needs attention"
          value={strained}
          state={strained ? 'warning' : 'success'}
          note={strained ? 'beelink is degraded' : 'nothing strained'}
        />
        <Kpi
          label="Failed units"
          value={failed.length}
          state={failed.length ? 'error' : 'success'}
          note={failed.map((unit) => unit.unit).join(', ') || 'all units active'}
        />
        <Kpi
          label="Tightest disk"
          value={worst?.disk ?? null}
          unit="%"
          digits={1}
          state="error"
          meter={worst?.disk ?? null}
          note={`${worst?.name} · ${range} window`}
        />
      </KpiGrid>

      <Band
        title="Needs attention"
        desc="beelink is degraded, loft has gone silent"
        actions={
          <Button label="All events" variant="ghost" onClick={() => { location.hash = '#/events'; }} />
        }
        first
      >
        <VStack gap={0}>
          <FindingRow
            state="error"
            what="cupola-agent.service failed"
            where="beelink · exit 1 · 203.0.113.24"
            ago="14 m"
            href="#/nodes/beelink/services"
          />
          <FindingRow
            state="warning"
            what="Root filesystem at 93 %"
            where="beelink · 18.4 of 19.8 GiB · fills in 21 days"
            value={93.1}
            label="beelink root filesystem"
            href="#/nodes/beelink/storage"
          />
          <FindingRow
            state="warning"
            what="Memory pressure"
            where="beelink · 87.6 % for 12 minutes"
            value={87.6}
            label="beelink memory"
            href="#/nodes/beelink/memory"
          />
          <FindingRow
            state="neutral"
            what="loft went silent"
            where="push · last contact 14 m ago · expected hourly"
            ago="14 m"
            href="#/nodes/loft"
          />
        </VStack>
      </Band>

      <Band
        title="Fleet load"
        desc={`CPU and memory across all systems · ${range}`}
        actions={
          <Button label="Per system" variant="ghost" onClick={() => { location.hash = '#/nodes/beelink/cpu'; }} />
        }
      >
        <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={3}>
          <ChartCard
            title="CPU"
            desc="busiest system (beelink) against the fleet median"
            lines={[
              { label: 'beelink', seed: 7, base: 62, swing: 26 },
              { label: 'median', seed: 11, base: 19, swing: 12 },
            ]}
            height={200}
          />
          <ChartCard
            title="Memory"
            desc="used memory, beelink against the fleet median"
            lines={[
              { label: 'beelink', seed: 23, base: 84, swing: 9 },
              { label: 'median', seed: 29, base: 34, swing: 10 },
            ]}
            height={200}
          />
        </Grid>
      </Band>

      <Band title="Systems" desc="Every machine, worst disk first">
        <Table
          data={[...rows].sort((a, b) => (b.disk ?? -1) - (a.disk ?? -1))}
          columns={columns}
          idKey="id"
          density="compact"
          dividers="rows"
          hasHover
        />
      </Band>

      <Band
        title="Units"
        desc={`${units.length} across the fleet · failed first`}
        actions={<Button label="All services" variant="ghost" onClick={() => { location.hash = '#/services'; }} />}
      >
        <VStack gap={0}>
          {[...units]
            .sort((a, b) => (a.state === 'failed' ? -1 : 0) - (b.state === 'failed' ? -1 : 0))
            .slice(0, 5)
            .map((unit) => (
              <FindingRow
                key={`${unit.node}/${unit.unit}`}
                state={unit.state === 'failed' ? 'error' : unit.state === 'inactive' ? 'neutral' : 'success'}
                what={unit.unit}
                where={`${unit.node} · ${unit.description}`}
                ago={unit.since}
                href={`#/nodes/${unit.node}/services`}
              />
            ))}
        </VStack>
      </Band>
    </>
  );
}
