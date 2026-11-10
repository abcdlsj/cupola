import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandPalette as Palette } from '@astryxdesign/core/CommandPalette';
import { HStack } from '@astryxdesign/core/HStack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { createStaticSource, type SearchableItem } from '@astryxdesign/core/Typeahead';
import { useFleet } from '../data/queries';
import type { NodeStatus } from '../data/types';
import { statusLabel, statusTone } from './StatusPill';

type Item = SearchableItem<{ group: 'Screens' | 'Systems'; to: string; hint?: string; status?: NodeStatus }>;

const SCREENS: Item[] = [
  ['Systems', '/'],
  ['Services', '/services'],
  ['Apps', '/apps'],
  ['Alerts', '/alerts'],
  ['Events', '/events'],
  ['Settings', '/settings/nodes'],
].map(([label, to]) => ({ id: `screen:${to}`, label, auxiliaryData: { group: 'Screens', to } }));

/** ⌘K: every screen, then every system with its CPU and memory and its state. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const fleet = useFleet();

  const items = useMemo<Item[]>(() => {
    const nodes: Item[] = (fleet.data?.nodes ?? []).map((view) => ({
      id: `node:${view.node.id}`,
      label: view.node.name,
      auxiliaryData: {
        group: 'Systems',
        to: `/nodes/${view.node.id}`,
        status: view.health.status,
        hint:
          view.health.status === 'offline'
            ? 'offline'
            : `${Math.round(view.health.cpu_pct)}% CPU · ${Math.round(view.health.mem_pct)}% memory`,
      },
    }));
    return [...SCREENS, ...nodes];
  }, [fleet.data]);

  const source = useMemo(() => createStaticSource(items, { keywords: (item) => [item.auxiliaryData?.hint ?? ''] }), [items]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  return (
    <Palette<Item>
      isOpen={open}
      onOpenChange={onOpenChange}
      label="Search systems and screens"
      searchSource={source}
      width={560}
      emptySearchText="No screen or system matches."
      onValueChange={(id) => {
        const item = byId.get(id);
        if (!item?.auxiliaryData) return;
        onOpenChange(false);
        navigate(item.auxiliaryData.to);
      }}
      renderItem={(item) => (
        <HStack gap={2} vAlign="center" hAlign="between" width="100%">
          <HStack gap={2} vAlign="center">
            {item.auxiliaryData?.status ? (
              <StatusDot variant={statusTone(item.auxiliaryData.status)} label={statusLabel(item.auxiliaryData.status)} />
            ) : null}
            <Text>{item.label}</Text>
          </HStack>
          {item.auxiliaryData?.hint ? (
            <Text type="code" size="xsm" color="secondary" hasTabularNumbers>
              {item.auxiliaryData.hint}
            </Text>
          ) : null}
        </HStack>
      )}
    />
  );
}
