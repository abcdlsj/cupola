import { useState } from 'react';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { SeverityPill, severityTone } from '../../components/StatusPill';
import { ErrorPanel, LoadingRows } from '../../components/States';
import { useEvents } from '../../data/queries';
import type { Event, Severity } from '../../data/types';
import { eventTime, relative } from '../../lib/format';
import { groupEvents, type EventGroup } from '../../lib/events';
import { Band, PageHead, useIsPhone } from '../../ui/kit';

const ALL = 'all';
const KINDS = ['node', 'service', 'container', 'system', 'network', 'action', 'disk'];
const SEVERITIES: Severity[] = ['info', 'warning', 'critical'];

/** One word per kind, so the group header reads as a noun, not a key. */
const KIND_LABEL: Record<string, string> = {
  node: 'Node',
  service: 'Service',
  container: 'Container',
  system: 'System',
  network: 'Network',
  action: 'Action',
  disk: 'Disk',
  agent: 'Agent',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

interface KindGroup {
  kind: string;
  groups: EventGroup[];
  /** Occurrences, not rows: a folded row of twenty counts as twenty. */
  count: number;
  worst: Severity;
  newest: number;
}

/**
 * Rows grouped by kind, worst first. Time order survives inside a kind; across
 * kinds the question is "which part of the system is talking", not "what
 * happened at 14:02", so the worst kind leads.
 */
function groupByKind(groups: EventGroup[]): KindGroup[] {
  const buckets = new Map<string, EventGroup[]>();
  for (const group of groups) {
    const list = buckets.get(group.latest.kind) ?? [];
    list.push(group);
    buckets.set(group.latest.kind, list);
  }
  const out: KindGroup[] = [];
  for (const [kind, list] of buckets) {
    let worst: Severity = 'info';
    let count = 0;
    let newest = 0;
    for (const group of list) {
      count += group.count;
      newest = Math.max(newest, group.latest.ts);
      if ((SEVERITY_RANK[group.latest.severity] ?? 3) < (SEVERITY_RANK[worst] ?? 3)) {
        worst = group.latest.severity;
      }
    }
    out.push({ kind, groups: list, count, worst, newest });
  }
  return out.sort((a, b) => (SEVERITY_RANK[a.worst] ?? 3) - (SEVERITY_RANK[b.worst] ?? 3) || b.count - a.count);
}

/**
 * One table row. A folded group is its head row plus, when opened, one row per
 * older occurrence, so occurrences keep the table's columns.
 */
interface FeedRow extends Record<string, unknown> {
  id: string;
  event: Event;
  /** Set on the head row of a folded group. */
  group?: EventGroup;
  occurrence?: boolean;
}

function rowsOf(groups: EventGroup[], open: ReadonlySet<number>): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const group of groups) {
    const head = group.latest;
    if (group.count === 1) {
      rows.push({ id: String(head.id), event: head });
      continue;
    }
    rows.push({ id: String(head.id), event: head, group });
    if (open.has(head.id)) {
      for (const event of group.events.slice(1)) rows.push({ id: String(event.id), event, occurrence: true });
    }
  }
  return rows;
}

function Mono({ children, secondary }: { children: string; secondary?: boolean }) {
  return (
    <Text type="code" hasTabularNumbers textWrap="nowrap" color={secondary ? 'secondary' : undefined}>
      {children}
    </Text>
  );
}

export function EventsList({
  nodeId,
  title = 'Events',
  desc,
  level = 2,
  compact = false,
}: {
  nodeId?: string;
  title?: string;
  desc?: string;
  level?: 1 | 2;
  compact?: boolean;
}) {
  const phone = useIsPhone();
  const [params, setParams] = useSearchParams();
  const [severity, setSeverity] = useState(params.get('severity') ?? '');
  const [kind, setKind] = useState(params.get('kind') ?? '');
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  // null means "nothing has been toggled": only a critical group opens on its
  // own, everything else starts folded so the list is a summary, not a scroll.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string> | null>(null);
  const query = useEvents({
    node: nodeId,
    severity: severity || undefined,
    kind: kind || undefined,
    q: params.get('q') ?? undefined,
    limit: compact ? 8 : 100,
  });
  const now = Date.now();

  const apply = (nextSeverity: string, nextKind: string) => {
    const next = new URLSearchParams(params);
    if (nextSeverity) next.set('severity', nextSeverity);
    else next.delete('severity');
    if (nextKind) next.set('kind', nextKind);
    else next.delete('kind');
    setParams(next, { replace: true });
  };

  const events = query.data ?? [];
  const groups = groupEvents(events);
  const kinds = groupByKind(groups);
  const folded = events.length - groups.length;

  // Critical opens by itself; with nothing critical the worst kind opens, so a
  // quiet fleet is one readable group rather than a stack of closed lids.
  const defaultFolded = (): ReadonlySet<string> => {
    const critical = kinds.filter((entry) => entry.worst === 'critical');
    const opened = critical.length > 0 ? critical : kinds.slice(0, 1);
    return new Set(kinds.filter((entry) => !opened.includes(entry)).map((entry) => entry.kind));
  };

  const isFolded = (entry: KindGroup) => (collapsed === null ? defaultFolded().has(entry.kind) : collapsed.has(entry.kind));

  const toggleKind = (entry: KindGroup) => {
    setCollapsed((current) => {
      // the first toggle materialises the default, so one click opens exactly
      // the group that was clicked
      const next = new Set(current ?? defaultFolded());
      if (next.has(entry.kind)) next.delete(entry.kind);
      else next.add(entry.kind);
      return next;
    });
  };

  const toggle = (id: number) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const message = (row: FeedRow) => {
    const { event, group } = row;
    if (!group) {
      return (
        <Link href={`/events/${event.id}`} tooltip={event.message}>
          {event.message}
        </Link>
      );
    }
    const expanded = open.has(event.id);
    return (
      <HStack gap={2} vAlign="center">
        <Button
          variant="ghost"
          size={phone ? 'lg' : 'sm'}
          isIconOnly
          label={`${expanded ? 'Hide' : 'Show'} ${group.count} occurrences of ${event.message}`}
          aria-expanded={expanded}
          icon={expanded ? <CaretDown size={14} aria-hidden="true" /> : <CaretRight size={14} aria-hidden="true" />}
          onClick={() => toggle(event.id)}
        />
        <Link href={`/events/${event.id}`} tooltip={event.message}>
          {event.message}
        </Link>
        <Text type="code" hasTabularNumbers textWrap="nowrap" color="secondary">
          {`×${group.count}`}
        </Text>
      </HStack>
    );
  };

  const columns: TableColumn<FeedRow>[] = [
    {
      key: 'when',
      header: 'When',
      width: pixel(112),
      renderCell: (row) => <Mono secondary={row.occurrence}>{eventTime(row.event.ts, now)}</Mono>,
    },
    {
      key: 'system',
      header: 'System',
      width: pixel(128),
      renderCell: (row) =>
        row.occurrence ? null : (
          <Link href={`/nodes/${row.event.node_id}/events`} type="code">
            {row.event.node_id}
          </Link>
        ),
    },
    {
      key: 'severity',
      header: 'Severity',
      width: pixel(104),
      renderCell: (row) => (row.occurrence ? null : <SeverityPill severity={row.event.severity} />),
    },
    {
      key: 'event',
      header: 'Event',
      width: proportional(1, { minWidth: 280 }),
      renderCell: (row) =>
        row.occurrence ? (
          <HStack gap={2} vAlign="center" paddingInlineStart={8}>
            {message(row)}
          </HStack>
        ) : (
          message(row)
        ),
    },
    {
      key: 'age',
      header: 'Age',
      width: pixel(96),
      align: 'end',
      renderCell: (row) => (
        <Text type="supporting" textWrap="nowrap">
          {relative(row.event.ts, now)}
        </Text>
      ),
    },
  ];

  /** Below 900 px a row is a block: the message, then where and when. */
  const blocks = (rows: FeedRow[]) => (
    <VStack gap={0}>
      {rows.map((row, index) => (
        <VStack key={row.id} gap={0}>
          {index > 0 ? <Divider /> : null}
          <VStack gap={1} paddingBlock={3} paddingInlineStart={row.occurrence ? 6 : 0}>
            {message(row)}
            <HStack gap={2} vAlign="center" wrap="wrap" paddingInlineStart={row.group ? 10 : 0}>
              {row.occurrence ? null : <SeverityPill severity={row.event.severity} />}
              {row.occurrence ? null : (
                <Link href={`/nodes/${row.event.node_id}/events`} type="code">
                  {row.event.node_id}
                </Link>
              )}
              <Mono secondary>{eventTime(row.event.ts, now)}</Mono>
              <Text type="supporting">{relative(row.event.ts, now)}</Text>
            </HStack>
          </VStack>
        </VStack>
      ))}
    </VStack>
  );

  const filters = compact ? null : (
    <>
      <Selector
        label="Severity"
        isLabelHidden
        size="sm"
        variant="secondary"
        value={severity || ALL}
        options={[
          { value: ALL, label: 'All severities' },
          ...SEVERITIES.map((value) => ({
            value,
            label: SEVERITY_LABEL[value],
          })),
        ]}
        onChange={(value) => {
          const next = value === ALL ? '' : value;
          setSeverity(next);
          apply(next, kind);
        }}
      />
      <Selector
        label="Kind"
        isLabelHidden
        size="sm"
        variant="secondary"
        value={kind || ALL}
        options={[{ value: ALL, label: 'All kinds' }, ...KINDS.map((value) => ({ value, label: kindLabel(value) }))]}
        onChange={(value) => {
          const next = value === ALL ? '' : value;
          setKind(next);
          apply(severity, next);
        }}
      />
    </>
  );

  const summary = `${events.length} ${events.length === 1 ? 'event' : 'events'}${
    folded > 0 ? ` · ${groups.length} ${groups.length === 1 ? 'row' : 'rows'}` : ''
  }`;

  const feed = query.isError ? (
    <ErrorPanel what="Couldn't load events." onRetry={() => void query.refetch()} />
  ) : query.isPending ? (
    <LoadingRows rows={6} columns={5} />
  ) : groups.length === 0 ? (
    <EmptyState
      title="No events match this filter"
      description="Events appear when a unit fails, a container restarts, a port opens or a threshold fires."
      isCompact
      headingLevel={3}
    />
  ) : (
    <VStack gap={0}>
      {kinds.map((entry, index) => {
        const hidden = isFolded(entry);
        const rows = rowsOf(entry.groups, open);
        return (
          <VStack key={entry.kind} gap={0}>
            {index > 0 ? <Divider /> : null}
            <VStack gap={0} paddingBlock={1}>
              <Collapsible
                chevronPosition="start"
                isOpen={!hidden}
                onOpenChange={() => toggleKind(entry)}
                trigger={
                  <HStack gap={2} vAlign="center" wrap="wrap" minHeight={phone ? 44 : undefined}>
                    <Text weight="semibold">{kindLabel(entry.kind)}</Text>
                    <SeverityPill severity={entry.worst} />
                    <Text type="supporting" hasTabularNumbers>
                      {entry.groups.length} {entry.groups.length === 1 ? 'row' : 'rows'} · {entry.count}{' '}
                      {entry.count === 1 ? 'event' : 'events'}
                    </Text>
                  </HStack>
                }
              >
                {hidden ? null : (
                  <VStack gap={0} paddingBlockStart={2}>
                    {phone ? (
                      blocks(rows)
                    ) : (
                      <Table data={rows} columns={columns} idKey="id" density="compact" dividers="rows" textOverflow="truncate" />
                    )}
                  </VStack>
                )}
              </Collapsible>
            </VStack>
          </VStack>
        );
      })}
    </VStack>
  );

  if (level === 2) {
    return (
      <Band
        title={title}
        desc={desc}
        first
        actions={
          <>
            {filters}
            <Text type="supporting">{summary}</Text>
          </>
        }
      >
        {feed}
      </Band>
    );
  }

  return (
    <>
      <PageHead title={title} desc={desc} actions={filters} />
      {kinds.length > 0 ? (
        <Band title="By kind" desc="Occurrences per kind in the loaded window, worst first" first>
          <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={3}>
            {kinds.map((entry) => (
              <HStack key={entry.kind} gap={2} vAlign="center">
                <StatusDot variant={severityTone(entry.worst)} label={`${kindLabel(entry.kind)}: ${entry.worst}`} />
                <VStack gap={0}>
                  <Text>{kindLabel(entry.kind)}</Text>
                  <Text type="supporting" hasTabularNumbers>
                    {entry.count} · newest {relative(entry.newest, now)}
                  </Text>
                </VStack>
              </HStack>
            ))}
          </Grid>
        </Band>
      ) : null}
      <Band
        title="Timeline"
        desc="Repeats on one node within an hour fold into one row"
        first={kinds.length === 0}
        actions={<Text type="supporting">{summary}</Text>}
      >
        {feed}
      </Band>
    </>
  );
}
