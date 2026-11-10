import { useEffect, type ReactNode, type SyntheticEvent } from 'react';
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@astryxdesign/core/Badge';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { Selector } from '@astryxdesign/core/Selector';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { StatusPill } from '../../components/StatusPill';
import { ErrorPanel, LoadingCharts } from '../../components/States';
import { MissingNode } from '../../components/NotFoundPage';
import { ApiError } from '../../data/api';
import { prefetchSeries, TAB_SERIES, useNode } from '../../data/queries';
import type { NodeView } from '../../data/types';
import { relative, size, uptime } from '../../lib/format';
import { PageHead, useIsPhone } from '../../ui/kit';
import { RangeSelect, useRange } from './RangeControl';

/** Tabs whose screens draw history; the window picker only shows on these. */
const CHART_TABS = new Set(['', '/cpu', '/memory', '/storage', '/network', '/containers']);

/** Tab and picker values cannot be empty; the overview's path segment is. */
const OVERVIEW = 'overview';

interface TabItem {
  to: string;
  label: string;
  /** plain count for the tab strip and the phone picker */
  count?: number;
  /** failed services: said in words and in colour */
  failed?: number;
}

function tabs(view: NodeView): TabItem[] {
  const snap = view.snapshot;
  const failed = snap?.services.filter((service) => service.active_state === 'failed').length ?? 0;
  return [
    { to: '', label: 'Overview' },
    { to: '/cpu', label: 'CPU' },
    { to: '/memory', label: 'Memory' },
    { to: '/storage', label: 'Storage', count: snap?.disks.length || undefined },
    { to: '/network', label: 'Network' },
    { to: '/processes', label: 'Processes', count: snap?.cpu.procs || undefined },
    { to: '/services', label: 'Services', count: failed ? undefined : snap?.services.length || undefined, failed: failed || undefined },
    { to: '/containers', label: 'Containers', count: snap?.containers.length || undefined },
    { to: '/apps', label: 'Apps', count: view.health.apps || undefined },
    { to: '/events', label: 'Events' },
  ];
}

function tabEnd(item: TabItem): ReactNode {
  if (item.failed) return <Badge variant="error" label={`${item.failed} failed`} />;
  if (item.count == null) return null;
  return (
    <Text type="code" color="secondary" hasTabularNumbers>
      {item.count}
    </Text>
  );
}

function pickerLabel(item: TabItem): string {
  if (item.failed) return `${item.label} · ${item.failed} failed`;
  return item.count != null ? `${item.label} · ${item.count}` : item.label;
}

function LoadingHead() {
  return (
    <VStack gap={3} aria-busy="true">
      <VStack gap={1} paddingBlock={2}>
        <Skeleton height={12} width={140} />
        <Skeleton height={26} width={200} />
        <Skeleton height={12} width={320} />
      </VStack>
      <Skeleton height={32} />
    </VStack>
  );
}

export function NodeLayout() {
  const { nodeId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const query = useNode(nodeId);
  const client = useQueryClient();
  const [range] = useRange();
  const [params] = useSearchParams();
  const phone = useIsPhone();

  // The samples are already on the hub. Pull the overview window as soon as the
  // node resolves so the first chart paints without a second round trip.
  useEffect(() => {
    if (!nodeId) return;
    prefetchSeries(client, nodeId, (TAB_SERIES[''] ?? []).map(([metric]) => [metric, range] as const));
  }, [client, nodeId, range]);

  if (query.isPending) {
    return (
      <>
        <LoadingHead />
        <LoadingCharts count={4} />
      </>
    );
  }
  if (query.isError || !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <>
          <PageHead title="System not found" />
          <MissingNode nodeId={nodeId} />
        </>
      );
    }
    return (
      <>
        <PageHead
          title="System unavailable"
          leading={
            <Link href="/" isStandalone>
              Systems
            </Link>
          }
        />
        <ErrorPanel what="The hub did not return this system." onRetry={() => void query.refetch()} />
      </>
    );
  }

  const view = query.data;
  const node = view.node;
  const snap = view.snapshot;
  const info = snap?.node;
  const now = Date.now();
  const os = [info?.platform || node.os, info?.platform_version].filter(Boolean).join(' ') || node.os;
  const host = info?.hostname || node.id;
  // the title already is the node name; the host only earns a mention when the
  // machine calls itself something else
  const meta = [
    host === node.name ? '' : host,
    os,
    node.kernel || info?.kernel || '',
    info ? `${info.cpu_model || 'unknown CPU'} · ${info.cores} threads` : '',
    snap ? `${size(snap.memory.total)} memory` : '',
    [node.agent_version, node.mode].filter(Boolean).join(' · '),
  ]
    .filter(Boolean)
    .join(' · ');
  const warning = view.health.warnings?.[0];
  const rest = location.pathname.slice(`/nodes/${nodeId}`.length).split('/').filter(Boolean);
  // detail routes (a process, a unit) have no window picker; only the tab roots
  // and container details, which draw history, do
  const tab = rest.length === 0 ? '' : rest.length === 1 || rest[0] === 'containers' ? `/${rest[0]}` : '/detail';
  const selected = rest.length === 0 ? OVERVIEW : `/${rest[0]}`;
  const search = params.get('range') ? `?range=${params.get('range')}` : '';
  const items = tabs(view);
  const href = (to: string) => `/nodes/${node.id}${to}${CHART_TABS.has(to) ? search : ''}`;
  const prefetch = (to: string) =>
    prefetchSeries(client, node.id, (TAB_SERIES[to] ?? []).map(([metric]) => [metric, range] as const));

  // Tabs take no pointer handlers of their own; read the hovered or focused
  // link's path and warm the series that tab will ask for.
  const warm = (event: SyntheticEvent) => {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    const path = new URL(anchor.href).pathname.slice(`/nodes/${node.id}`.length);
    if (TAB_SERIES[path]) prefetch(path);
  };

  return (
    <>
      <VStack gap={3}>
        <PageHead
          title={node.name}
          desc={meta}
          leading={
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Link href="/">Systems</Link>
              <Text type="supporting">/</Text>
              <StatusPill status={view.health.status} />
              <Text type="supporting">
                {snap ? `up ${uptime(snap.node.uptime_sec)}` : `last seen ${node.last_seen ? relative(node.last_seen, now) : 'never'}`}
              </Text>
              {node.labels.map((label) => (
                <Badge key={label} variant="neutral" label={label} />
              ))}
            </HStack>
          }
          actions={CHART_TABS.has(tab) ? <RangeSelect /> : undefined}
        />
        {warning ? (
          <HStack gap={2} vAlign="center">
            <StatusDot variant="warning" label="Warning" />
            <Text type="supporting">{warning}</Text>
          </HStack>
        ) : null}
        {phone ? (
          <Selector
            label="View"
            isLabelHidden
            size="md"
            variant="secondary"
            width="100%"
            presentation="adaptive"
            value={selected}
            options={items.map((item) => ({ value: item.to || OVERVIEW, label: pickerLabel(item) }))}
            onChange={(value) => {
              const to = value === OVERVIEW ? '' : value;
              prefetch(to);
              navigate(href(to));
            }}
          />
        ) : (
          <div onPointerOver={warm} onFocus={warm}>
            <TabList value={selected} onChange={() => undefined} hasDivider size="sm">
              {items.map((item) => (
                <Tab key={item.label} value={item.to || OVERVIEW} label={item.label} href={href(item.to)} endContent={tabEnd(item)} />
              ))}
            </TabList>
          </div>
        )}
      </VStack>
      <Outlet context={view} />
    </>
  );
}
