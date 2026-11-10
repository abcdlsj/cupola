import { useEffect, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import {
  actions,
  containers,
  cores,
  events,
  filesystems,
  interfaces,
  node,
  processes,
  type DemoNode,
  units,
} from '../fixtures';
import { Band, ChartCard, FindingRow, Figure, Kpi, KpiGrid, Meter, PageHead } from '../ui';

const TABS = [
  'overview',
  'cpu',
  'memory',
  'storage',
  'network',
  'processes',
  'services',
  'containers',
  'apps',
  'events',
] as const;

const RANGES = ['1 h', '24 h', '7 d'] as const;

const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  overview: 'Overview',
  cpu: 'CPU',
  memory: 'Memory',
  storage: 'Storage',
  network: 'Network',
  processes: 'Processes',
  services: 'Services',
  containers: 'Containers',
  apps: 'Apps',
  events: 'Events',
};

function tone(state: DemoNode['state']) {
  return state === 'healthy' ? 'success' : state === 'degraded' ? 'warning' : 'neutral';
}

function NodeHead({ entry, tab }: { entry: DemoNode; tab: string }) {
  const [range, setRange] = useState<string>('1 h');
  return (
    <VStack gap={3}>
      <PageHead
        title={entry.name}
        desc={[entry.os, entry.kernel, `${entry.cores} cores`, entry.agent, entry.mode === 'push' ? 'push' : `pull · ${entry.address}`].join(' · ')}
        leading={
          <HStack gap={2} vAlign="center" wrap="wrap">
            <a href="#/">Fleet</a>
            <Text type="supporting">/</Text>
            <StatusDot variant={tone(entry.state)} label={entry.state} tooltip={entry.state} />
            <Text type="supporting">{entry.state}</Text>
            <Text type="supporting">· {entry.uptime}</Text>
          </HStack>
        }
        actions={
          <>
            <SegmentedControl label="Range" size="sm" value={range} onChange={setRange}>
              {RANGES.map((item) => (
                <SegmentedControlItem key={item} value={item} label={item} />
              ))}
            </SegmentedControl>
          </>
        }
      />
      <TabList value={tab} onChange={() => undefined} hasDivider size="sm">
        {TABS.map((slug) => (
          <Tab
            key={slug}
            value={slug}
            label={TAB_LABEL[slug]}
            href={`#/nodes/${entry.id}${slug === 'overview' ? '' : `/${slug}`}`}
          />
        ))}
      </TabList>
    </VStack>
  );
}

function Kpis({ entry }: { entry: DemoNode }) {
  return (
    <KpiGrid>
      <Kpi
        label="CPU"
        value={entry.cpu}
        unit="%"
        state={entry.state === 'offline' ? 'neutral' : 'accent'}
        meter={entry.cpu}
        digits={1}
        note={`${entry.cores} cores · load ${entry.load.toFixed(1)}`}
      />
      <Kpi
        label="Memory"
        value={entry.memory}
        unit="%"
        state={entry.state === 'offline' ? 'neutral' : entry.memory && entry.memory > 85 ? 'warning' : 'accent'}
        meter={entry.memory}
        digits={1}
        note="12.4 of 16 GiB · 4.8 cache"
      />
      <Kpi
        label="Disk"
        value={entry.disk}
        unit="%"
        state={entry.state === 'offline' ? 'neutral' : entry.disk && entry.disk > 90 ? 'error' : 'accent'}
        meter={entry.disk}
        digits={1}
        note="root · 4 filesystems"
      />
      <Kpi
        label="Temperature"
        value={entry.temp}
        unit="°C"
        state={entry.temp && entry.temp > 70 ? 'warning' : 'success'}
        note="package, hottest sensor"
      />
      <Kpi label="Uptime" value={entry.uptime.replace('up ', '')} note="since boot" />
    </KpiGrid>
  );
}

interface ProcRow extends Record<string, unknown> {
  pid: number;
  name: string;
  user: string;
  cpu: number;
  memory: number;
  rss: string;
  threads: number;
  cmd: string;
}

function ProcessesTab() {
  const [picked, setPicked] = useState<ProcRow | null>(null);
  const rows = processes as unknown as ProcRow[];
  const columns: TableColumn<ProcRow>[] = [
    {
      key: 'pid',
      header: 'PID',
      width: pixel(84),
      renderCell: (row) => (
        <Text type="code" hasTabularNumbers>
          {row.pid}
        </Text>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      width: proportional(1, { minWidth: 240 }),
      renderCell: (row) => (
        <VStack gap={0}>
          <Text weight={picked?.pid === row.pid ? 'semibold' : 'normal'}>{row.name}</Text>
          <Text type="supporting">{row.user}</Text>
        </VStack>
      ),
    },
    {
      key: 'cpu',
      header: 'CPU',
      width: pixel(110),
      renderCell: (row) => <Figure value={row.cpu} unit="%" />,
    },
    {
      key: 'memory',
      header: 'Memory',
      width: proportional(1, { minWidth: 180 }),
      renderCell: (row) => <Meter value={row.memory} label={`${row.name} memory`} width={72} />,
    },
    {
      key: 'threads',
      header: 'Threads',
      width: pixel(100),
      renderCell: (row) => (
        <Text type="code" hasTabularNumbers>
          {row.threads}
        </Text>
      ),
    },
    {
      key: 'rss',
      header: 'RSS',
      width: pixel(110),
      renderCell: (row) => (
        <Text type="code" hasTabularNumbers>
          {row.rss}
        </Text>
      ),
    },
    {
      key: 'inspect',
      header: '',
      width: pixel(118),
      renderCell: (row) => (
        <Button label="Inspect" variant="ghost" size="sm" onClick={() => setPicked(row)} />
      ),
    },
  ];

  return (
    <VStack gap={3}>
      <Band title="Processes" desc="214 running · arguments redacted" first>
        <Table
          data={rows}
          columns={columns}
          idKey="pid"
          density="compact"
          dividers="rows"
          hasHover
        />
      </Band>
      {picked ? (
        <Card>
          <VStack gap={3}>
            <HStack gap={2} vAlign="center" hAlign="between">
              <HStack gap={2} vAlign="center">
                <Heading level={3}>{picked.name}</Heading>
                <Badge label={`pid ${picked.pid}`} variant="neutral" />
                <Text type="supporting">{picked.user}</Text>
              </HStack>
              <Button label="Close" variant="ghost" size="sm" onClick={() => setPicked(null)} />
            </HStack>
            <Divider />
            <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={4}>
              <VStack gap={1}>
                <Text type="supporting">CPU</Text>
                <Figure value={picked.cpu} unit="%" />
              </VStack>
              <VStack gap={1}>
                <Text type="supporting">Memory</Text>
                <Figure value={picked.memory} unit="%" />
              </VStack>
              <VStack gap={1}>
                <Text type="supporting">RSS</Text>
                <Figure value={picked.rss} />
              </VStack>
              <VStack gap={1}>
                <Text type="supporting">Threads</Text>
                <Figure value={picked.threads} digits={0} />
              </VStack>
            </Grid>
            <VStack gap={1}>
              <Text type="supporting">Command line</Text>
              <Text type="code">{picked.cmd}</Text>
            </VStack>
            <Text type="supporting">Signals are not available in v1.</Text>
          </VStack>
        </Card>
      ) : null}
    </VStack>
  );
}

function StorageTab() {
  return (
    <Band title="Filesystems" desc="4 mounted · sorted by fill" first>
      <VStack gap={0}>
        {[...filesystems]
          .sort((a, b) => b.used - a.used)
          .map((fs) => (
            <HStack
              key={fs.mount}
              gap={3}
              vAlign="center"
              hAlign="between"
              paddingBlock={3}
              wrap="wrap"
            >
              <VStack gap={0.5}>
                <Text type="code">{fs.mount}</Text>
                <Text type="supporting">
                  {fs.device} · {fs.fs}
                </Text>
              </VStack>
              <Meter value={fs.used} label={`${fs.mount} used`} width={280} />
              <Text type="supporting">
                {fs.free} free of {fs.size}
              </Text>
            </HStack>
          ))}
      </VStack>
    </Band>
  );
}

function CpuTab({ entry }: { entry: DemoNode }) {
  return (
    <>
      <Band title="CPU" desc="system, user and iowait · last hour" first>
        <ChartCard
          title="Usage"
          desc="busy percentage per second, rolled up to one minute"
          lines={[
            { label: 'system', seed: 5, base: entry.cpu ?? 0, swing: 22 },
            { label: 'user', seed: 9, base: (entry.cpu ?? 0) / 2, swing: 14 },
            { label: 'iowait', seed: 15, base: 6, swing: 10 },
          ]}
          height={220}
          yMax={60}
        />
      </Band>
      <Band title="Per core" desc="8 cores">
        <Grid columns={{ minWidth: 240, repeat: 'fit' }} gap={3}>
          {cores.map((core) => (
            <Card key={core.core} padding={3}>
              <VStack gap={2}>
                <HStack gap={2} vAlign="center" hAlign="between">
                  <Text type="code">{core.core}</Text>
                  <Text type="supporting">{core.mhz} MHz</Text>
                </HStack>
                <Meter value={core.busy} label={`${core.core} busy`} width={160} />
              </VStack>
            </Card>
          ))}
        </Grid>
      </Band>
    </>
  );
}

function MemoryTab({ entry }: { entry: DemoNode }) {
  return (
    <>
      <Band title="Memory" desc="used, cache and swap · last hour" first>
        <ChartCard
          title="Usage"
          desc="of 16 GiB, one minute rollup"
          lines={[
            { label: 'used', seed: 21, base: entry.memory ?? 0, swing: 8 },
            { label: 'cache', seed: 27, base: 38, swing: 12 },
          ]}
          height={220}
        />
      </Band>
      <Band title="Breakdown" desc="GiB, as the agent reports it">
        <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={3}>
          <Card padding={4}>
            <VStack gap={2}>
              <Text type="label" color="secondary">
                Used
              </Text>
              <Figure value="12.4" unit="GiB" size="heading" />
              <Meter value={entry.memory} label="memory used" width={140} showValue={false} />
            </VStack>
          </Card>
          <Card padding={4}>
            <VStack gap={2}>
              <Text type="label" color="secondary">
                Cache
              </Text>
              <Figure value="4.8" unit="GiB" size="heading" />

            </VStack>
          </Card>
          <Card padding={4}>
            <VStack gap={2}>
              <Text type="label" color="secondary">
                Free
              </Text>
              <Figure value="2.1" unit="GiB" size="heading" />

            </VStack>
          </Card>
          <Card padding={4}>
            <VStack gap={2}>
              <Text type="label" color="secondary">
                Swap
              </Text>
              <Figure value="0.4" unit="GiB" size="heading" />
              <Text type="supporting">of 4 GiB</Text>
            </VStack>
          </Card>
        </Grid>
      </Band>
    </>
  );
}

function NetworkTab() {
  return (
    <>
      <Band title="Network" desc="eno1 receive and transmit · last hour" first>
        <ChartCard
          title="Throughput"
          desc="MiB per second, one minute rollup"
          lines={[
            { label: 'rx', seed: 33, base: 44, swing: 26 },
            { label: 'tx', seed: 37, base: 18, swing: 18 },
          ]}
          height={220}
        />
      </Band>
      <Band title="Interfaces" desc="3 links · loopback hidden">
        <Grid columns={{ minWidth: 260, repeat: 'fit' }} gap={3}>
          {interfaces.map((nic) => (
            <Card key={nic.name} padding={4}>
              <VStack gap={2}>
                <HStack gap={2} vAlign="center" hAlign="between">
                  <HStack gap={1.5} vAlign="center">
                    <StatusDot variant={nic.state === 'up' ? 'success' : 'neutral'} label={nic.state} />
                    <Text type="code">{nic.name}</Text>
                  </HStack>
                  <Text type="supporting">{nic.speed}</Text>
                </HStack>
                <Text type="supporting">{nic.address}</Text>
                <HStack gap={4}>
                  <VStack gap={0.5}>
                    <Text type="supporting">receive</Text>
                    <Text type="code">{nic.rx}</Text>
                  </VStack>
                  <VStack gap={0.5}>
                    <Text type="supporting">transmit</Text>
                    <Text type="code">{nic.tx}</Text>
                  </VStack>
                </HStack>
              </VStack>
            </Card>
          ))}
        </Grid>
      </Band>
    </>
  );
}

export function NodePage({ nodeId, tab = 'overview' }: { nodeId: string; tab?: string }) {
  const entry = node(nodeId);
  const nodeUnits = units.filter((unit) => unit.node === entry.id);
  const nodeEvents = events.filter((event) => event.node === entry.id);
  const nodeActions = actions.filter((action) => action.node === entry.id);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [nodeId, tab]);

  const body = () => {
    switch (tab) {
      case 'cpu':
        return <CpuTab entry={entry} />;
      case 'memory':
        return <MemoryTab entry={entry} />;
      case 'storage':
        return <StorageTab />;
      case 'network':
        return <NetworkTab />;
      case 'processes':
        return <ProcessesTab />;
      case 'services':
        return (
          <Band title="Units" desc={`${nodeUnits.length} units on ${entry.name}`} first>
            <VStack gap={0}>
              {nodeUnits.map((unit) => (
                <FindingRow
                  key={unit.unit}
                  state={unit.state === 'failed' ? 'error' : unit.state === 'inactive' ? 'neutral' : 'success'}
                  what={unit.unit}
                  where={`${unit.description} · ${unit.state}`}
                  ago={unit.since}
                  href={`#/nodes/${entry.id}/services`}
                />
              ))}
            </VStack>
          </Band>
        );
      case 'containers':
        return (
          <Band title="Containers" desc={`${containers.length} containers · Docker over the unix socket`} first>
            <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={3}>
              {containers.map((box) => (
                <Card key={box.id} padding={4}>
                  <VStack gap={3}>
                    <HStack gap={2} vAlign="center" hAlign="between">
                      <HStack gap={1.5} vAlign="center">
                        <StatusDot
                          variant={box.state === 'running' ? 'success' : box.state === 'exited' ? 'neutral' : 'warning'}
                          label={box.state}
                        />
                        <Text>{box.name}</Text>
                      </HStack>
                      <Text type="supporting">{box.uptime}</Text>
                    </HStack>
                    <Text type="code">{box.image}</Text>
                    {box.cpu != null ? (
                      <HStack gap={4}>
                        <VStack gap={0.5}>
                          <Text type="supporting">CPU</Text>
                          <Figure value={box.cpu} unit="%" />
                        </VStack>
                        <VStack gap={1}>
                          <Text type="supporting">Memory</Text>
                          <Meter value={box.memory} label={`${box.name} memory`} width={96} />
                        </VStack>
                      </HStack>
                    ) : (
                      <Text type="supporting">not running · ports {box.ports}</Text>
                    )}
                  </VStack>
                </Card>
              ))}
            </Grid>
          </Band>
        );
      case 'apps':
        return (
          <Band
            title="Apps"
            desc="Actions live in the agent config and are run by the hub"
            first
          >
            <VStack gap={0}>
              {nodeActions.length === 0 ? (
                <Text type="supporting">No actions configured on {entry.name}.</Text>
              ) : (
                nodeActions.map((action) => (
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
                      </HStack>
                      <Text type="supporting">{action.detail} · last run {action.lastRun}</Text>
                    </VStack>
                    <Button label="Run" variant="secondary" size="sm" onClick={() => undefined} />
                  </HStack>
                ))
              )}
            </VStack>
          </Band>
        );
      case 'events':
        return (
          <Band title="Events" desc={`${nodeEvents.length} in the last hour`} first>
            <VStack gap={0}>
              {nodeEvents.length === 0 ? (
                <Text type="supporting">Nothing reported by {entry.name} yet.</Text>
              ) : (
                nodeEvents.map((event) => (
                  <FindingRow
                    key={event.id}
                    state={
                      event.severity === 'critical' ? 'error' : event.severity === 'warning' ? 'warning' : 'neutral'
                    }
                    what={event.message}
                    where={`${event.kind} · ${event.node}`}
                    ago={event.ago}
                    href={`#/events`}
                  />
                ))
              )}
            </VStack>
          </Band>
        );
      default:
        return (
          <>
            <Kpis entry={entry} />
            <Band title="Last hour" desc="CPU, memory and network">
              <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={3}>
                <ChartCard
                  title="CPU"
                  desc="system and iowait"
                  lines={[
                    { label: 'system', seed: 5, base: entry.cpu ?? 0, swing: 20 },
                    { label: 'iowait', seed: 15, base: 6, swing: 10 },
                  ]}
                />
                <ChartCard
                  title="Memory"
                  desc="used and cache"
                  lines={[
                    { label: 'used', seed: 21, base: entry.memory ?? 0, swing: 8 },
                    { label: 'cache', seed: 27, base: 38, swing: 12 },
                  ]}
                />
                <ChartCard
                  title="Network"
                  desc="eno1 receive"
                  lines={[{ label: 'rx', seed: 33, base: 44, swing: 26 }]}
                />
              </Grid>
            </Band>
            <Band
              title="What changed"
              desc={`${nodeEvents.length} events · newest first`}
              actions={<Button label="All events" variant="ghost" onClick={() => { location.hash = '#/events'; }} />}
            >
              <VStack gap={0}>
                {nodeEvents.map((event) => (
                  <FindingRow
                    key={event.id}
                    state={
                      event.severity === 'critical' ? 'error' : event.severity === 'warning' ? 'warning' : 'neutral'
                    }
                    what={event.message}
                    where={event.kind}
                    ago={event.ago}
                  />
                ))}
                {nodeEvents.length === 0 ? <Text type="supporting">No events in the last hour.</Text> : null}
              </VStack>
            </Band>
            <Band
              title="Units"
              desc={`${nodeUnits.length} on this system`}
              actions={<Button label="All units" variant="ghost" onClick={() => { location.hash = `#/nodes/${entry.id}/services`; }} />}
            >
              <VStack gap={0}>
                {nodeUnits.map((unit) => (
                  <FindingRow
                    key={unit.unit}
                    state={unit.state === 'failed' ? 'error' : unit.state === 'inactive' ? 'neutral' : 'success'}
                    what={unit.unit}
                    where={unit.description}
                    ago={unit.since}
                  />
                ))}
              </VStack>
            </Band>
          </>
        );
    }
  };

  return (
    <>
      <NodeHead entry={entry} tab={tab} />
      {body()}
    </>
  );
}
