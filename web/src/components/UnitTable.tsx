// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useState, type MouseEvent } from 'react';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { FleetService, Service } from '../data/types';
import { duration } from '../lib/format';
import { useIsPhone } from '../ui/kit';

type Row = Service | FleetService;

function isFleet(row: Row): row is FleetService {
  return 'node_id' in row;
}

const STATE_WORD: Record<string, string> = {
  active: 'running',
  inactive: 'inactive',
  failed: 'failed',
  activating: 'starting',
  deactivating: 'stopping',
  reloading: 'reloading',
};

export function unitTone(state: string): 'ok' | 'fail' | 'idle' {
  if (state === 'failed') return 'fail';
  if (state === 'active') return 'ok';
  return 'idle';
}

function dotVariant(state: string): 'success' | 'error' | 'neutral' {
  const tone = unitTone(state);
  return tone === 'ok' ? 'success' : tone === 'fail' ? 'error' : 'neutral';
}

function stateWord(state: string): string {
  return STATE_WORD[state] ?? state;
}

/** A unit's state as a dot and its word. */
export function UnitPill({ state }: { state: string }) {
  const word = stateWord(state);
  return (
    <HStack gap={1.5} vAlign="center">
      <StatusDot variant={dotVariant(state)} label={word} />
      <Text type="supporting" textWrap="nowrap">
        {word}
      </Text>
    </HStack>
  );
}

/** The states present in the list, as a segmented filter with honest counts. */
export function UnitState({
  units,
  value,
  onChange,
}: {
  units: Row[];
  value?: string;
  onChange?: (next: string) => void;
}) {
  const phone = useIsPhone();
  const [local, setLocal] = useState('all');
  const active = value ?? local;
  const set = onChange ?? setLocal;
  const counts: Record<string, number> = { all: units.length, failed: 0, active: 0, inactive: 0 };
  for (const unit of units) counts[unit.active_state] = (counts[unit.active_state] ?? 0) + 1;
  const all: Array<[string, string]> = [
    ['all', 'All'],
    ['failed', 'Failed'],
    ['active', 'Running'],
    ['inactive', 'Inactive'],
  ];
  const options = all
    .filter(([key]) => key === 'all' || key === active || (counts[key] ?? 0) > 0)
    .map(([key, label]) => ({ value: key, label: `${label} ${counts[key] ?? 0}` }));
  if (phone) {
    return (
      <Selector
        label="Filter by state"
        isLabelHidden
        size="md"
        variant="secondary"
        value={active}
        options={options}
        onChange={(next) => set(next ?? 'all')}
      />
    );
  }
  return (
    <SegmentedControl label="Filter by state" size="sm" value={active} onChange={set}>
      {options.map((option) => (
        <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
      ))}
    </SegmentedControl>
  );
}

function since(value?: number): string {
  if (!value) return '—';
  const age = (Date.now() - value) / 1000;
  return age < 0 ? '—' : `${duration(age)} ago`;
}

interface UnitRow extends Record<string, unknown> {
  key: string;
  unit: Row;
  nodeId: string;
  nodeName: string;
  changed: string;
}

function unitHref(nodeId: string, name: string): string {
  return `/nodes/${encodeURIComponent(nodeId)}/services/${encodeURIComponent(name)}`;
}

/**
 * One row per unit: the name over its description, the system, the state and
 * the figures right-aligned. Below 900 px every unit becomes one block, so no
 * field is dropped. The unit name links to its detail route.
 */
export function UnitTable({
  rows,
  onOpen,
  nodeId,
  showNode = true,
  showSubState = false,
}: {
  rows: Row[];
  /** called instead of following the unit link */
  onOpen?: (unit: Row) => void;
  /** the node these rows belong to, for rows that do not carry their own */
  nodeId?: string;
  showNode?: boolean;
  showSubState?: boolean;
}) {
  const phone = useIsPhone();
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No unit matches this filter"
        description="Clear the filter or pick another state to see more units."
        isCompact
        headingLevel={3}
      />
    );
  }

  const data: UnitRow[] = rows.map((unit) => {
    const fleet = isFleet(unit);
    const id = fleet ? unit.node_id : (nodeId ?? '');
    return {
      key: `${id}-${unit.name}`,
      unit,
      nodeId: id,
      nodeName: fleet ? unit.node_name : '',
      changed: since(unit.since),
    };
  });

  const open = onOpen
    ? (unit: Row) => (event: MouseEvent) => {
        event.preventDefault();
        onOpen(unit);
      }
    : undefined;

  const name = (row: UnitRow) =>
    row.nodeId || open ? (
      <Link href={row.nodeId ? unitHref(row.nodeId, row.unit.name) : '#'} onClick={open?.(row.unit)} maxLines={1}>
        <Text type="code">{row.unit.name}</Text>
      </Link>
    ) : (
      <Text type="code" maxLines={1}>
        {row.unit.name}
      </Text>
    );

  if (phone) {
    return (
      <VStack gap={0}>
        {data.map((row, index) => (
          <VStack key={row.key} gap={0}>
            {index > 0 ? <Divider /> : null}
            <VStack gap={1} paddingBlock={3}>
              <HStack gap={2} vAlign="center" hAlign="between">
                <HStack gap={1.5} vAlign="center">
                  <StatusDot variant={dotVariant(row.unit.active_state)} label={stateWord(row.unit.active_state)} />
                  {name(row)}
                </HStack>
                <Text type="code" size="sm" hasTabularNumbers textWrap="nowrap" color="secondary">
                  {row.changed}
                </Text>
              </HStack>
              {row.unit.description ? (
                <Text type="supporting" maxLines={1}>
                  {row.unit.description}
                </Text>
              ) : null}
              <Text type="supporting" maxLines={1}>
                {[
                  showNode ? row.nodeName : null,
                  stateWord(row.unit.active_state),
                  showSubState && row.unit.sub_state !== stateWord(row.unit.active_state) && row.unit.sub_state !== row.unit.active_state
                    ? row.unit.sub_state
                    : null,
                  row.unit.enabled,
                  `${row.unit.restarts ?? 0} ${row.unit.restarts === 1 ? 'restart' : 'restarts'}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </VStack>
          </VStack>
        ))}
      </VStack>
    );
  }

  const columns: TableColumn<UnitRow>[] = [
    {
      key: 'unit',
      header: 'Unit',
      width: pixel(380),
      renderCell: (row) => (
        <HStack gap={2} vAlign="center">
          <StatusDot variant={dotVariant(row.unit.active_state)} label={stateWord(row.unit.active_state)} />
          <VStack gap={0}>
            {name(row)}
            {row.unit.description ? (
              <Text type="supporting" maxLines={1}>
                {row.unit.description}
              </Text>
            ) : null}
          </VStack>
        </HStack>
      ),
    },
  ];
  if (showNode) {
    columns.push({
      key: 'node',
      header: 'System',
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) =>
        row.nodeName && row.nodeId ? (
          <Link href={`/nodes/${encodeURIComponent(row.nodeId)}/services`} maxLines={1}>
            {row.nodeName}
          </Link>
        ) : (
          <Text type="code" color="secondary">
            —
          </Text>
        ),
    });
  }
  columns.push({
    key: 'state',
    header: 'State',
    width: pixel(120),
    renderCell: (row) => (
      <Text type="supporting" textWrap="nowrap">
        {stateWord(row.unit.active_state)}
      </Text>
    ),
  });
  if (showSubState) {
    columns.push({
      key: 'sub',
      header: 'Sub state',
      width: pixel(120),
      renderCell: (row) => (
        <Text type="supporting" textWrap="nowrap">
          {row.unit.sub_state || '—'}
        </Text>
      ),
    });
  }
  columns.push(
    {
      key: 'restarts',
      header: 'Restarts',
      width: pixel(96),
      align: 'end',
      renderCell: (row) => (
        <Text type="code" hasTabularNumbers color={row.unit.restarts ? undefined : 'secondary'}>
          {row.unit.restarts ? `${row.unit.restarts}×` : '0'}
        </Text>
      ),
    },
    {
      key: 'changed',
      header: 'Changed',
      width: pixel(120),
      align: 'end',
      renderCell: (row) => (
        <Text type="code" hasTabularNumbers textWrap="nowrap" color={row.changed === '—' ? 'secondary' : undefined}>
          {row.changed}
        </Text>
      ),
    },
  );

  return <Table data={data} columns={columns} idKey="key" density="compact" dividers="rows" hasHover />;
}
