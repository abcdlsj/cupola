import { useEffect, useRef, useState } from 'react';
import * as Icon from '@phosphor-icons/react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { Theme } from '@astryxdesign/core/theme';
import { VStack } from '@astryxdesign/core/VStack';
import { Chart } from './Chart';
import { nodes, series, timestamps, units } from './fixtures';
import { cupolaTheme } from './theme';

type Mode = 'light' | 'dark';

function level(value: number | null): 'accent' | 'warning' | 'error' | 'neutral' {
  if (value == null) return 'neutral';
  if (value >= 90) return 'error';
  if (value >= 75) return 'warning';
  return 'accent';
}

function Figure({ value, digits = 1 }: { value: number | null; digits?: number }) {
  return (
    <Text type="code" hasTabularNumbers textWrap="nowrap">
      {value == null ? '—' : `${value.toFixed(digits)}`}
    </Text>
  );
}

function Meter({ value, label }: { value: number | null; label: string }) {
  return (
    <HStack gap={2} vAlign="center">
      <ProgressBar
        label={label}
        value={value ?? 0}
        variant={level(value)}
        isLabelHidden
        isDisabled={value == null}
      />
      <HStack gap={0.5} vAlign="center">
        <Figure value={value} />
        <Text type="supporting">%</Text>
      </HStack>
    </HStack>
  );
}

/** Astryx has no breakpoint hook; the shell's phone range starts at 900 px. */
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches,
  );
  useEffect(() => {
    const list = window.matchMedia('(max-width: 899px)');
    const onChange = () => setPhone(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return phone;
}

function DemoNav() {
  return (
    <SideNav
      collapsible
      header={<SideNavHeading heading="cupola" subheading="four systems" />}
      footerIcons={
        <>
          <IconButton icon={<Icon.MagnifyingGlass />} label="Search" variant="ghost" />
          <IconButton icon={<Icon.Moon />} label="Theme" variant="ghost" />
          <IconButton icon={<Icon.Wrench />} label="Settings" variant="ghost" />
        </>
      }
    >
      <SideNavSection title="Fleet">
        <SideNavItem label="Systems" icon={Icon.HardDrives} isSelected />
        <SideNavItem label="Services" icon={Icon.Rows} />
      </SideNavSection>
      <SideNavSection title="Work">
        <SideNavItem label="Apps" icon={Icon.PlayCircle} />
        <SideNavItem label="Alerts" icon={Icon.Bell} endContent={<Badge label="2" variant="error" />} />
        <SideNavItem label="Events" icon={Icon.ListBullets} />
      </SideNavSection>
    </SideNav>
  );
}

/** Below 900 px a table stops being readable: the same data becomes one row per system. */
function NodeRows() {
  return (
    <VStack gap={0}>
      {nodes.map((node) => (
        <VStack key={node.id} gap={2} paddingBlock={3}>
          <HStack gap={2} vAlign="center" hAlign="between">
            <HStack gap={1.5} vAlign="center">
              <StatusDot
                variant={node.state === 'healthy' ? 'success' : node.state === 'degraded' ? 'warning' : 'neutral'}
                label={node.state}
              />
              <Text>{node.name}</Text>
              <Badge label={node.role} variant="neutral" />
            </HStack>
            <Text type="supporting">{node.uptime}</Text>
          </HStack>
          <VStack gap={1.5}>
            {(
              [
                ['CPU', node.cpu],
                ['Memory', node.memory],
                ['Disk', node.disk],
              ] as const
            ).map(([label, value]) => (
              <HStack key={label} gap={2} vAlign="center">
                <VStack width={72}>
                  <Text type="supporting">{label}</Text>
                </VStack>
                <Meter value={value} label={`${node.name} ${label}`} />
              </HStack>
            ))}
          </VStack>
        </VStack>
      ))}
    </VStack>
  );
}

export function Demo() {
  const [mode, setMode] = useState<Mode>('dark');
  const phone = useIsPhone();

  return (
    <Theme theme={cupolaTheme} mode={mode}>
      <AppShell sideNav={<DemoNav />} contentPadding={4} height="auto">
        <VStack gap={4} maxWidth={1440}>
          <HStack hAlign="between" vAlign="center" gap={3} wrap={phone ? 'wrap' : 'nowrap'}>
            <VStack gap={1}>
              <Heading level={1}>Systems</Heading>
              <Text type="supporting">
                4 systems · 2 need attention · beelink is at 93 % disk · 1 unit failed
              </Text>
            </VStack>
            <SegmentedControl
              label="Colour mode"
              value={mode}
              onChange={(value) => setMode(value as Mode)}
            >
              <SegmentedControlItem value="light" label="Light" />
              <SegmentedControlItem value="dark" label="Dark" />
            </SegmentedControl>
          </HStack>

          <Card padding={phone ? 3 : 0}>
            {phone ? (
              <NodeRows />
            ) : (
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
                {nodes.map((node) => (
                  <TableRow key={node.id}>
                    <TableCell>
                      <HStack gap={2} vAlign="center">
                        <StatusDot
                          variant={
                            node.state === 'healthy'
                              ? 'success'
                              : node.state === 'degraded'
                                ? 'warning'
                                : 'neutral'
                          }
                          label={node.state}
                          tooltip={`${node.name}: ${node.state}`}
                        />
                        <VStack gap={0}>
                          <HStack gap={1.5} vAlign="center">
                            <Text>{node.name}</Text>
                            <Badge label={node.role} variant="neutral" />
                            {node.mode === 'push' ? <Badge label="push" variant="info" /> : null}
                          </HStack>
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
                      <Text type="code" hasTabularNumbers>
                        {node.state === 'offline' ? '—' : `${node.load.toFixed(1)} / ${node.cores}`}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <Text type="supporting">{node.uptime}</Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </Card>

          <Grid columns={{ minWidth: 320, max: 3 }} gap={3}>
            <ChartCard
              title="CPU"
              desc="beelink · 8 cores · last hour"
              series={[
                { label: 'system', data: series(7, 62, 26) },
                { label: 'iowait', data: series(11, 9, 14) },
              ]}
            />
            <ChartCard
              title="Memory"
              desc="beelink · 12.4 of 16 GiB · last hour"
              series={[
                { label: 'used', data: series(23, 84, 9) },
                { label: 'cache', data: series(29, 42, 12) },
              ]}
            />
            <ChartCard
              title="Disk I/O"
              desc="atlas · nvme0n1 · last hour"
              series={[{ label: 'read', data: series(31, 14, 20) }]}
            />
          </Grid>

          <Card>
            <VStack gap={3}>
              <Heading level={2}>Services</Heading>
              <Text type="supporting">4 units across 3 systems · 1 failed</Text>
              <VStack gap={2}>
                {units.map((unit) => (
                  <HStack key={`${unit.node}/${unit.unit}`} gap={2} vAlign="center" hAlign="between">
                    <HStack gap={2} vAlign="center">
                      <StatusDot
                        variant={unit.state === 'failed' ? 'error' : 'success'}
                        label={unit.state}
                      />
                      <Text type="code">{unit.unit}</Text>
                      <Text type="supporting">on {unit.node}</Text>
                    </HStack>
                    <Text type="supporting">{unit.since}</Text>
                  </HStack>
                ))}
              </VStack>
            </VStack>
          </Card>

          <Text type="supporting">
            Cupola · Astryx demo · raw 48 h, 1 m 30 d, 1 h 13 mo
          </Text>
        </VStack>
      </AppShell>
    </Theme>
  );
}

function ChartCard({
  title,
  desc,
  series: lines,
}: {
  title: string;
  desc: string;
  series: { label: string; data: number[] }[];
}) {
  const holder = useRef<HTMLDivElement>(null);
  return (
    <Card>
      <VStack gap={2}>
        <VStack gap={0.5}>
          <Heading level={2}>{title}</Heading>
          <Text type="supporting">{desc}</Text>
        </VStack>
        <div ref={holder}>
          <Chart host={holder} timestamps={timestamps} series={lines} />
        </div>
      </VStack>
    </Card>
  );
}
