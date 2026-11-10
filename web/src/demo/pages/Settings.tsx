import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Switch } from '@astryxdesign/core/Switch';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { nodes, rules } from '../fixtures';
import { Band, Figure, PageHead } from '../ui';

const SECTIONS = [
  { slug: 'nodes', label: 'Nodes' },
  { slug: 'alerts', label: 'Alerts' },
  { slug: 'tokens', label: 'Tokens' },
  { slug: 'retention', label: 'Retention' },
  { slug: 'appearance', label: 'Appearance' },
  { slug: 'about', label: 'About' },
];

function SettingsTabs({ section }: { section: string }) {
  return (
    <TabList value={section} onChange={() => undefined} hasDivider size="sm">
      {SECTIONS.map((entry) => (
        <Tab
          key={entry.slug}
          value={entry.slug}
          label={entry.label}
          href={`#/settings/${entry.slug}`}
        />
      ))}
    </TabList>
  );
}

function NodesSection() {
  return (
    <Band title="Nodes" desc="Agent tokens are stored encrypted and indexed by SHA-256" first>
      <Table density="compact" dividers="rows">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>System</TableHeaderCell>
            <TableHeaderCell>Transport</TableHeaderCell>
            <TableHeaderCell>Agent</TableHeaderCell>
            <TableHeaderCell>Token</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodes.map((node) => (
            <TableRow key={node.id}>
              <TableCell>
                <HStack gap={1.5} vAlign="center">
                  <StatusDot
                    variant={node.state === 'offline' ? 'neutral' : node.state === 'degraded' ? 'warning' : 'success'}
                    label={node.state}
                  />
                  <Text>{node.name}</Text>
                </HStack>
              </TableCell>
              <TableCell>
                <Text type="supporting">{node.mode === 'push' ? 'push' : `pull · ${node.address}`}</Text>
              </TableCell>
              <TableCell>
                <Text type="code">{node.agent}</Text>
              </TableCell>
              <TableCell>
                <HStack gap={2} vAlign="center">
                  <Text type="code">sha256:8f2a…c19d</Text>
                  <Button label="Rotate" variant="ghost" size="sm" onClick={() => undefined} />
                </HStack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Band>
  );
}

function AlertsSection() {
  const [webhook, setWebhook] = useState(true);
  return (
    <Band title="Alert delivery" desc="One webhook, five retries, signed when a secret is set" first>
      <VStack gap={4}>
        <Switch
          label="Sign deliveries"
          description="HMAC-SHA256 in X-Cupola-Signature"
          value={webhook}
          onChange={setWebhook}
        />
        <Divider />
        <VStack gap={2}>
          {rules.slice(0, 3).map((rule) => (
            <HStack key={rule.id} gap={2} vAlign="center" hAlign="between">
              <Text>{rule.what}</Text>
              <Text type="supporting">{rule.channel}</Text>
            </HStack>
          ))}
        </VStack>
      </VStack>
    </Band>
  );
}

function TokensSection() {
  return (
    <VStack gap={4}>
      <Band title="API tokens" desc="Scoped, hashed at rest, revocable" first>
        <VStack gap={3}>
          <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <TextInput label="Name" value="grafana-read" onChange={() => undefined} />
            <TextInput label="Scopes" value="read:fleet" onChange={() => undefined} />
          </Grid>
          <HStack gap={2}>
            <Button label="Create token" variant="primary" onClick={() => undefined} />
            <Text type="supporting">Shown once; only its SHA-256 is stored.</Text>
          </HStack>
        </VStack>
      </Band>
      <Band>
        <Table density="compact" dividers="rows">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Token</TableHeaderCell>
              <TableHeaderCell>Scopes</TableHeaderCell>
              <TableHeaderCell>Last used</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ['grafana-read', 'read:fleet', '2 m ago'],
              ['nightly-export', 'read:fleet, read:events', '6 h ago'],
              ['wol-bridge', 'actions:run', 'yesterday'],
            ].map(([name, scopes, used]) => (
              <TableRow key={name}>
                <TableCell>
                  <Text type="code">{name}</Text>
                </TableCell>
                <TableCell>
                  <Text type="supporting">{scopes}</Text>
                </TableCell>
                <TableCell>
                  <Text type="supporting">{used}</Text>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Band>
    </VStack>
  );
}

function RetentionSection() {
  return (
    <Band title="Retention" desc="Raw readings are dropped, rollups are kept" first>
      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <VStack gap={2}>
          <Text type="supporting">Raw</Text>
          <Figure value="5 s" />
          <Text type="supporting">kept 48 h</Text>
        </VStack>
        <VStack gap={2}>
          <Text type="supporting">Rollup</Text>
          <Figure value="1 m" />
          <Text type="supporting">kept 30 d</Text>
        </VStack>
        <VStack gap={2}>
          <Text type="supporting">Rollup</Text>
          <Figure value="1 h" />
          <Text type="supporting">kept 13 mo</Text>
        </VStack>
      </Grid>
      <Divider />
      <HStack gap={3} vAlign="center" wrap="wrap">
        <Text type="supporting">Database file</Text>
        <Text type="code">184 MiB · WAL 12 MiB</Text>
      </HStack>
    </Band>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState('dark');
  return (
    <Band title="Appearance" desc="System, light or dark" first>
      <VStack gap={3}>
        <SegmentedControl label="Theme" value={theme} onChange={setTheme}>
          <SegmentedControlItem value="system" label="System" />
          <SegmentedControlItem value="light" label="Light" />
          <SegmentedControlItem value="dark" label="Dark" />
        </SegmentedControl>
        <Text type="supporting">
          The choice is kept per browser. Every colour comes from the theme; no component holds a
          literal.
        </Text>
      </VStack>
    </Band>
  );
}

function AboutSection() {
  return (
    <Band title="About" desc="Self-hosted monitoring for the Linux boxes you run" first>
      <Grid columns={{ minWidth: 200, max: 4 }} gap={4}>
        <VStack gap={1}>
          <Text type="supporting">Hub</Text>
          <Text type="code">v1.0.0</Text>
        </VStack>
        <VStack gap={1}>
          <Text type="supporting">Agent</Text>
          <Text type="code">v1.4.2</Text>
        </VStack>
        <VStack gap={1}>
          <Text type="supporting">Transport</Text>
          <Text type="code">pull · push</Text>
        </VStack>
      </Grid>
      <Divider />
      <Text type="supporting">
        No telemetry, no accounts, no third-party runtime assets. Command lines are redacted; environment
        variables, prompts and file contents are never collected.
      </Text>
    </Band>
  );
}

export function SettingsPage({ section }: { section: string }) {
  return (
    <>
      <PageHead title="Settings" desc="Hub configuration · changes apply immediately" />
      <SettingsTabs section={section} />
      {section === 'nodes' ? <NodesSection /> : null}
      {section === 'alerts' ? <AlertsSection /> : null}
      {section === 'tokens' ? <TokensSection /> : null}
      {section === 'retention' ? <RetentionSection /> : null}
      {section === 'appearance' ? <AppearanceSection /> : null}
      {section === 'about' ? <AboutSection /> : null}
      <HStack gap={2} vAlign="center" paddingBlock={2}>
        <StatusDot variant="success" label="hub healthy" isPulsing />
        <Text type="supporting">
          Hub healthy · 4 systems · last ingest 2 s ago · SQLite 184 MiB
        </Text>
      </HStack>
    </>
  );
}
