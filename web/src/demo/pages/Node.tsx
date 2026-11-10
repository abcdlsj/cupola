import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Tab, TabList } from '@astryxdesign/core/TabList';
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
import { VStack } from '@astryxdesign/core/VStack';
import {
  agents,
  containers,
  cores,
  events,
  filesystems,
  interfaces,
  node,
  nodes,
  processes,
  type DemoNode,
  units,
  actions,
} from '../fixtures';
import { CardSection, ChartCard, Figure, Meter, PageHead, Stat } from '../ui';

const TABS = [
  'cpu',
  'memory',
  'storage',
  'network',
  'processes',
  'agents',
  'services',
  'containers',
  'apps',
  'events',
] as const;

interface ProcRow extends Record<string, unknown> {
  pid: number;
  name: string;
  user: string;
  cpu: number;
  memory: number;
  rss: string;
}

const procRows = processes as unknown as ProcRow[];

/** Data-driven columns so a wide screen does not stretch five cells across it. */
function procColumns(nodeId: string): TableColumn<ProcRow>[] {
  return [
    {
      key: 'pid',
      header: 'PID',
      width: pixel(88),
      renderCell: (row) => (
        <Text type="code" hasTabularNumbers>
          {row.pid}
        </Text>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      width: proportional(2, { minWidth: 220 }),
      renderCell: (row) => (
        <VStack gap={0}>
          <a href={`#/nodes/${nodeId}/processes`}>{row.name}</a>
          <Text type="supporting">{row.user}</Text>
        </VStack>
      ),
    },
    {
      key: 'cpu',
      header: 'CPU',
      width: pixel(120),
      renderCell: (row) => <Figure value={row.cpu} unit="%" />,
    },
    {
      key: 'memory',
      header: 'Memory',
      width: pixel(240),
      renderCell: (row) => <Meter value={row.memory} label={`${row.name} memory`} />,
    },
    {
      key: 'rss',
      header: 'RSS',
      width: pixel(120),
      renderCell: (row) => (
        <Text type="code" hasTabularNumbers>
          {row.rss}
        </Text>
      ),
    },
  ];
}

function tone(state: DemoNode['state']) {
  return state === 'healthy' ? 'success' : state === 'degraded' ? 'warning' : 'neutral';
}

function NodeHead({ entry, tab }: { entry: DemoNode; tab: string }) {
  const meta = [
    entry.os,
    entry.kernel,
    `${entry.cores} cores`,
    entry.agent,
    entry.mode === 'push' ? 'push' : `pull ${entry.address}`,
  ];
  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <a href="#/">← Systems</a>
        <StatusDot variant={tone(entry.state)} label={entry.state} tooltip={entry.state} />
        <Heading level={1}>{entry.name}</Heading>
        <Text type="supporting">{entry.role}</Text>
        {entry.state === 'degraded' ? <Badge label="degraded" variant="warning" /> : null}
        {entry.state === 'offline' ? <Badge label="offline" variant="neutral" /> : null}
      </HStack>
      <HStack gap={2} vAlign="center" wrap="wrap">
        {meta.map((item) => (
          <Text key={item} type="supporting">
            {item}
          </Text>
        ))}
        <Text type="supporting">· {entry.uptime}</Text>
      </HStack>
      <TabList value={tab} onChange={() => undefined} hasDivider size="sm">
        {TABS.map((slug) => (
          <Tab
            key={slug}
            value={slug}
            label={slug.charAt(0).toUpperCase() + slug.slice(1)}
            href={`#/nodes/${entry.id}/${slug}`}
          />
        ))}
      </TabList>
    </VStack>
  );
}

function Kpis({ entry }: { entry: DemoNode }) {
  return (
    <Card>
      <Grid columns={{ minWidth: 160, max: 6 }} gap={4}>
        <Stat label="CPU" value={entry.cpu?.toFixed(1) ?? '—'} suffix="%" meter={entry.cpu} />
        <Stat label="Memory" value={entry.memory?.toFixed(1) ?? '—'} suffix="%" meter={entry.memory} />
        <Stat label="Disk" value={entry.disk?.toFixed(1) ?? '—'} suffix="%" meter={entry.disk} />
        <Stat
          label="Load"
          value={entry.state === 'offline' ? '—' : `${entry.load.toFixed(1)}`}
          suffix={`/ ${entry.cores}`}
          caption="1 min average"
        />
        <Stat label="Temperature" value={entry.temp == null ? '—' : `${entry.temp}`} suffix="°C" />
        <Stat label="Uptime" value={entry.uptime.replace('up ', '')} caption="since boot" />
      </Grid>
    </Card>
  );
}

function UnitList({ rows }: { rows: typeof units }) {
  return (
    <VStack gap={0}>
      {rows.map((unit) => (
        <HStack key={`${unit.node}/${unit.unit}`} gap={2} vAlign="center" hAlign="between" paddingBlock={2}>
          <HStack gap={2} vAlign="center">
            <StatusDot
              variant={unit.state === 'failed' ? 'error' : unit.state === 'inactive' ? 'neutral' : 'success'}
              label={unit.state}
            />
            <VStack gap={0}>
              <Text type="code">{unit.unit}</Text>
              <Text type="supporting">{unit.description}</Text>
            </VStack>
          </HStack>
          <Text type="supporting">{unit.since}</Text>
        </HStack>
      ))}
    </VStack>
  );
}

export function NodePage({ nodeId, tab = 'overview' }: { nodeId: string; tab?: string }) {
  const entry = node(nodeId);
  const nodeUnits = units.filter((unit) => unit.node === entry.id);
  const nodeEvents = events.filter((event) => event.node === entry.id);
  const nodeActions = actions.filter((action) => action.node === entry.id);

  const body = () => {
    switch (tab) {
      case 'cpu':
        return (
          <>
            <ChartCard
              title="CPU"
              desc="system, user, iowait · last hour"
              lines={[
                { label: 'system', seed: 5, base: entry.cpu ?? 0, swing: 22 },
                { label: 'user', seed: 9, base: (entry.cpu ?? 0) / 2, swing: 14 },
                { label: 'iowait', seed: 15, base: 6, swing: 10 },
              ]}
            />
            <CardSection title="Per core" desc={`${cores.length} cores · busy %`} padding={0}>
              <Table density="compact" dividers="rows">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Core</TableHeaderCell>
                    <TableHeaderCell>Busy</TableHeaderCell>
                    <TableHeaderCell>MHz</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cores.map((core) => (
                    <TableRow key={core.core}>
                      <TableCell>
                        <Text type="code">{core.core}</Text>
                      </TableCell>
                      <TableCell>
                        <Meter value={core.busy} label={`${core.core} busy`} />
                      </TableCell>
                      <TableCell>
                        <Figure value={core.mhz} digits={0} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardSection>
          </>
        );
      case 'memory':
        return (
          <>
            <ChartCard
              title="Memory"
              desc="used, cache · last hour"
              lines={[
                { label: 'used', seed: 21, base: entry.memory ?? 0, swing: 8 },
                { label: 'cache', seed: 27, base: 38, swing: 12 },
              ]}
            />
            <CardSection title="Breakdown" desc="GiB, as reported by the agent">
              <Grid columns={{ minWidth: 180, max: 4 }} gap={4}>
                <Stat label="Used" value="12.4" suffix="GiB" meter={entry.memory} />
                <Stat label="Cache" value="4.8" suffix="GiB" />
                <Stat label="Free" value="2.1" suffix="GiB" />
                <Stat label="Swap used" value="0.4" suffix="GiB" />
              </Grid>
            </CardSection>
          </>
        );
      case 'storage':
        return (
          <CardSection title="Filesystems" desc={`${filesystems.length} mounted filesystems`} padding={0}>
            <Table density="compact" dividers="rows">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Mount</TableHeaderCell>
                  <TableHeaderCell>Device</TableHeaderCell>
                  <TableHeaderCell>Used</TableHeaderCell>
                  <TableHeaderCell>Free</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filesystems.map((fs) => (
                  <TableRow key={fs.mount}>
                    <TableCell>
                      <VStack gap={0}>
                        <Text type="code">{fs.mount}</Text>
                        <Text type="supporting">{fs.fs}</Text>
                      </VStack>
                    </TableCell>
                    <TableCell>
                      <Text type="code">{fs.device}</Text>
                    </TableCell>
                    <TableCell>
                      <Meter value={fs.used} label={`${fs.mount} used`} />
                    </TableCell>
                    <TableCell>
                      <HStack gap={1}>
                        <Figure value={fs.free} digits={0} />
                        <Text type="supporting">of {fs.size}</Text>
                      </HStack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardSection>
        );
      case 'network':
        return (
          <>
            <ChartCard
              title="Network"
              desc="eno1 receive and transmit · last hour"
              lines={[
                { label: 'rx', seed: 33, base: 44, swing: 26 },
                { label: 'tx', seed: 37, base: 18, swing: 18 },
              ]}
            />
            <CardSection title="Interfaces" padding={0}>
              <Table density="compact" dividers="rows">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Interface</TableHeaderCell>
                    <TableHeaderCell>Speed</TableHeaderCell>
                    <TableHeaderCell>Receive</TableHeaderCell>
                    <TableHeaderCell>Transmit</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interfaces.map((nic) => (
                    <TableRow key={nic.name}>
                      <TableCell>
                        <HStack gap={1.5} vAlign="center">
                          <StatusDot
                            variant={nic.state === 'up' ? 'success' : 'neutral'}
                            label={nic.state}
                          />
                          <Text type="code">{nic.name}</Text>
                          <Text type="supporting">{nic.address}</Text>
                        </HStack>
                      </TableCell>
                      <TableCell>
                        <Text>{nic.speed}</Text>
                      </TableCell>
                      <TableCell>
                        <Text type="code" hasTabularNumbers>
                          {nic.rx}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text type="code" hasTabularNumbers>
                          {nic.tx}
                        </Text>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardSection>
          </>
        );
      case 'processes':
        return (
          <CardSection title="Processes" desc={`${procRows.length} of 214 · arguments redacted`} padding={0}>
            <Table
              data={procRows}
              columns={procColumns(entry.id)}
              idKey="pid"
              density="compact"
              dividers="rows"
              hasHover
            />
          </CardSection>
        );
      case 'agents':
        return (
          <CardSection title="Agent sessions" desc="detected from running processes; prompts never collected">
            <VStack gap={0}>
              {agents.map((session) => (
                <HStack
                  key={session.id}
                  gap={3}
                  vAlign="center"
                  hAlign="between"
                  paddingBlock={2}
                  wrap="wrap"
                >
                  <HStack gap={2} vAlign="center">
                    <StatusDot
                      variant={session.status === 'working' ? 'accent' : 'neutral'}
                      label={session.status}
                      isPulsing={session.status === 'working'}
                    />
                    <VStack gap={0}>
                      <HStack gap={1.5} vAlign="center">
                        <Text type="code">{session.tool}</Text>
                        <Text type="code">{session.id}</Text>
                        <Text type="supporting">{session.model}</Text>
                      </HStack>
                      <Text type="supporting">{session.cwd}</Text>
                    </VStack>
                  </HStack>
                  <HStack gap={3}>
                    <Text type="supporting">{session.runtime}</Text>
                    <Text type="supporting">{session.started}</Text>
                  </HStack>
                </HStack>
              ))}
            </VStack>
          </CardSection>
        );
      case 'services':
        return (
          <CardSection title="Units" desc={`${nodeUnits.length} units on ${entry.name}`}>
            <UnitList rows={nodeUnits} />
          </CardSection>
        );
      case 'containers':
        return (
          <CardSection title="Containers" desc="Docker over the unix socket" padding={0}>
            <Table density="compact" dividers="rows">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Container</TableHeaderCell>
                  <TableHeaderCell>State</TableHeaderCell>
                  <TableHeaderCell>CPU</TableHeaderCell>
                  <TableHeaderCell>Memory</TableHeaderCell>
                  <TableHeaderCell>Up</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((box) => (
                  <TableRow key={box.id}>
                    <TableCell>
                      <VStack gap={0}>
                        <Text type="code">{box.name}</Text>
                        <Text type="supporting">{box.image}</Text>
                      </VStack>
                    </TableCell>
                    <TableCell>
                      <HStack gap={1.5} vAlign="center">
                        <StatusDot
                          variant={
                            box.state === 'running' ? 'success' : box.state === 'exited' ? 'neutral' : 'warning'
                          }
                          label={box.state}
                        />
                        <Text type="supporting">{box.state}</Text>
                      </HStack>
                    </TableCell>
                    <TableCell>
                      <Figure value={box.cpu} unit="%" />
                    </TableCell>
                    <TableCell>
                      <Meter value={box.memory} label={`${box.name} memory`} />
                    </TableCell>
                    <TableCell>
                      <Text type="supporting">{box.uptime}</Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardSection>
        );
      case 'apps':
        return (
          <CardSection title="Actions" desc="defined in the agent config, never by the hub">
            <Grid columns={{ minWidth: 240, max: 3 }} gap={3}>
              {nodeActions.length === 0 ? (
                <Text type="supporting">No actions configured on {entry.name}.</Text>
              ) : (
                nodeActions.map((action) => (
                  <Card key={action.id}>
                    <VStack gap={2}>
                      <HStack gap={2} vAlign="center" hAlign="between">
                        <Heading level={3}>{action.label}</Heading>
                        <Badge label={action.type} variant="neutral" />
                      </HStack>
                      <Text type="supporting">{action.detail}</Text>
                      <Text type="supporting">last run {action.lastRun}</Text>
                      <Button label="Run" variant="secondary" onClick={() => undefined} />
                    </VStack>
                  </Card>
                ))
              )}
            </Grid>
          </CardSection>
        );
      case 'events':
        return (
          <CardSection title="Events" desc={`${nodeEvents.length} in the last hour`}>
            <VStack gap={0}>
              {nodeEvents.length === 0 ? (
                <Text type="supporting">Nothing reported by {entry.name} yet.</Text>
              ) : (
                nodeEvents.map((event) => (
                  <HStack key={event.id} gap={2} vAlign="center" hAlign="between" paddingBlock={2}>
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
                      <Text type="code">{event.kind}</Text>
                      <Text>{event.message}</Text>
                    </HStack>
                    <Text type="supporting">{event.ago}</Text>
                  </HStack>
                ))
              )}
            </VStack>
          </CardSection>
        );
      default:
        return (
          <>
            <Kpis entry={entry} />
            <Grid columns={{ minWidth: 320, max: 3 }} gap={3}>
              <ChartCard
                title="CPU"
                desc="system, iowait · last hour"
                lines={[
                  { label: 'system', seed: 5, base: entry.cpu ?? 0, swing: 20 },
                  { label: 'iowait', seed: 15, base: 6, swing: 10 },
                ]}
              />
              <ChartCard
                title="Memory"
                desc="used, cache · last hour"
                lines={[
                  { label: 'used', seed: 21, base: entry.memory ?? 0, swing: 8 },
                  { label: 'cache', seed: 27, base: 38, swing: 12 },
                ]}
              />
              <ChartCard
                title="Network"
                desc="eno1 receive · last hour"
                lines={[{ label: 'rx', seed: 33, base: 44, swing: 26 }]}
              />
            </Grid>
            <Grid columns={{ minWidth: 320, max: 2 }} gap={3}>
              <CardSection title="Units" desc={`${nodeUnits.length} on this system`}>
                <UnitList rows={nodeUnits} />
              </CardSection>
              <CardSection title="Recent events" desc="last 6">
                <VStack gap={2}>
                  {nodeEvents.slice(0, 4).map((event) => (
                    <HStack key={event.id} gap={2} vAlign="center">
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
                      <Text type="code">{event.kind}</Text>
                      <Text>{event.message}</Text>
                    </HStack>
                  ))}
                  {nodeEvents.length === 0 ? (
                    <Text type="supporting">No events.</Text>
                  ) : null}
                </VStack>
              </CardSection>
            </Grid>
          </>
        );
    }
  };

  return (
    <>
      <NodeHead entry={entry} tab={tab} />
      {body()}
      <Card>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="supporting">Systems:</Text>
          {nodes.map((other) => (
            <a key={other.id} href={`#/nodes/${other.id}/${tab === 'overview' ? '' : tab}`}>
              {other.name}
            </a>
          ))}
        </HStack>
      </Card>
    </>
  );
}

export function NodeIndexPage() {
  return <PageHead title="Systems" desc="Pick a system from the table." />;
}
