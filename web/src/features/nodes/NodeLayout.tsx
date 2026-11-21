import { useEffect, type ReactNode, type SyntheticEvent } from 'react';
import { Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { StatusPill } from '../../components/StatusPill';
import { ErrorPanel, LoadingCharts } from '../../components/States';
import { MissingNode } from '../../components/NotFoundPage';
import { ApiError } from '../../data/api';
import { prefetchSeries, TAB_SERIES, useNode } from '../../data/queries';
import type { NodeView } from '../../data/types';
import { relative, size, uptime } from '../../lib/format';
import { PageHead } from '../../ui/kit';
import { Badge, Banner, Link, Skeleton, VStack } from '../../ui/primitives';
import { Tab, TabList } from '../../ui/controls';
import { RangeSelect, useRange } from './RangeControl';

/** Tabs whose screens draw history; the window picker only shows on these. */
const CHART_TABS = new Set(['', '/cpu', '/memory', '/storage', '/network', '/containers']);

/** Tab values cannot be empty; the overview's path segment is. */
const OVERVIEW = 'overview';

interface TabItem {
  to: string;
  label: string;
  count?: number;
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
  return <span className="tab-count">{item.count}</span>;
}

function LoadingHead() {
  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <VStack gap={1.5} paddingBlock={1}>
        <Skeleton height={12} width={140} />
        <Skeleton height={24} width={200} />
        <Skeleton height={12} width={300} />
      </VStack>
      <Skeleton height={34} />
    </div>
  );
}

export function NodeLayout() {
  const { nodeId = '' } = useParams();
  const location = useLocation();
  const query = useNode(nodeId);
  const client = useQueryClient();
  const [range] = useRange();
  const [params] = useSearchParams();

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
        <PageHead title="System unavailable" leading={<Link href="/">Systems</Link>} />
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
  const tab = rest.length === 0 ? '' : rest.length === 1 || rest[0] === 'containers' ? `/${rest[0]}` : '/detail';
  const selected = rest.length === 0 ? OVERVIEW : `/${rest[0]}`;
  const search = params.get('range') ? `?range=${params.get('range')}` : '';
  const items = tabs(view);
  const href = (to: string) => `/nodes/${node.id}${to}${CHART_TABS.has(to) ? search : ''}`;
  const prefetch = (to: string) =>
    prefetchSeries(client, node.id, (TAB_SERIES[to] ?? []).map(([metric]) => [metric, range] as const));

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
            <div className="crumbs">
              <Link href="/">Systems</Link>
              <span className="crumbs-sep">/</span>
              <StatusPill status={view.health.status} />
              <span className="crumbs-sep">·</span>
              <span>
                {snap ? `up ${uptime(snap.node.uptime_sec)}` : `last seen ${node.last_seen ? relative(node.last_seen, now) : 'never'}`}
              </span>
              {node.labels.map((label) => (
                <span key={label} className="role-tag">
                  {label}
                </span>
              ))}
            </div>
          }
          actions={CHART_TABS.has(tab) ? <RangeSelect /> : undefined}
        />
        {warning ? <Banner status="warning" title={warning} /> : null}
        <div onPointerOver={warm} onFocus={warm}>
          <TabList label="System views">
            {items.map((item) => (
              <Tab
                key={item.label}
                href={href(item.to)}
                selected={(item.to || OVERVIEW) === selected}
                label={item.label}
                endContent={tabEnd(item)}
              />
            ))}
          </TabList>
        </div>
      </VStack>
      <Outlet context={view} />
    </>
  );
}
