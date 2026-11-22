import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react';
import {
  Clock,
  Columns,
  Cpu,
  Desktop,
  HardDrives,
  Memory,
  PlugsConnected,
  Rows,
  TerminalWindow,
} from '@phosphor-icons/react';
import { Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { StatusDot } from '../../components/StatusPill';
import { ErrorPanel, LoadingCharts } from '../../components/States';
import { MissingNode } from '../../components/NotFoundPage';
import { ApiError } from '../../data/api';
import { prefetchSeries, TAB_SERIES, useNode } from '../../data/queries';
import type { NodeView } from '../../data/types';
import { relative, size, uptime } from '../../lib/format';
import { PageHead, useIsPhone } from '../../ui/kit';
import { Badge, Banner, Link, Skeleton, VStack } from '../../ui/primitives';
import { SegmentedControl, SegmentedControlItem, Tab, TabList } from '../../ui/controls';
import { RangeSelect, useRange } from './RangeControl';

/** Tabs whose screens draw history; the window picker only shows on these. */
const CHART_TABS = new Set(['', '/cpu', '/memory', '/storage', '/network', '/containers']);

/** Tab values cannot be empty; the overview's path segment is. */
const OVERVIEW = 'overview';

type ChartLayout = 'grid' | 'full';
const LAYOUT_KEY = 'cupola.chartLayout';

function readChartLayout(): ChartLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'full' ? 'full' : 'grid';
  } catch {
    return 'grid';
  }
}

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
      <div className="node-infobar">
        <VStack gap={2} width="100%">
          <Skeleton height={24} width={200} />
          <Skeleton height={16} width={360} />
        </VStack>
      </div>
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
  const phone = useIsPhone();
  const [chartLayout, setChartLayout] = useState<ChartLayout>(readChartLayout);

  useEffect(() => {
    if (!nodeId) return;
    prefetchSeries(client, nodeId, (TAB_SERIES[''] ?? []).map(([metric]) => [metric, range] as const));
  }, [client, nodeId, range]);

  const changeLayout = (next: string) => {
    const mode: ChartLayout = next === 'full' ? 'full' : 'grid';
    setChartLayout(mode);
    try {
      localStorage.setItem(LAYOUT_KEY, mode);
    } catch {
      // storage blocked
    }
  };

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
  const kernel = node.kernel || info?.kernel || '';
  const host = info?.hostname || node.id;
  const upText = snap
    ? `up ${uptime(snap.node.uptime_sec)}`
    : `last seen ${node.last_seen ? relative(node.last_seen, now) : 'never'}`;
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
        <div className="crumbs">
          <Link href="/">Systems</Link>
          <span className="crumbs-sep">/</span>
          <span>{node.name}</span>
        </div>

        <header className="node-infobar">
          <div className="node-infobar-main">
            <div className="node-infobar-title">
              <StatusDot status={view.health.status} isPulsing />
              <h1>{node.name}</h1>
              {node.labels.map((label) => (
                <span key={label} className="role-tag">
                  {label}
                </span>
              ))}
            </div>
            <div className="spec-chips">
              {host && host !== node.name ? (
                <span className="spec-chip code">
                  <HardDrives size={13} aria-hidden="true" />
                  {host}
                </span>
              ) : null}
              {os ? (
                <span className="spec-chip">
                  <Desktop size={13} aria-hidden="true" />
                  {os}
                </span>
              ) : null}
              {kernel ? (
                <span className="spec-chip code">
                  <TerminalWindow size={13} aria-hidden="true" />
                  {kernel}
                </span>
              ) : null}
              {info ? (
                <span className="spec-chip">
                  <Cpu size={13} aria-hidden="true" />
                  {info.cpu_model ? `${info.cpu_model} · ` : ''}
                  {info.cores} threads
                </span>
              ) : null}
              {snap ? (
                <span className="spec-chip code">
                  <Memory size={13} aria-hidden="true" />
                  {size(snap.memory.total)}
                </span>
              ) : null}
              <span className="spec-chip code">
                <Clock size={13} aria-hidden="true" />
                {upText}
              </span>
              {node.agent_version || node.mode ? (
                <span className="spec-chip code">
                  <PlugsConnected size={13} aria-hidden="true" />
                  {[node.agent_version, node.mode].filter(Boolean).join(' · ')}
                </span>
              ) : null}
            </div>
          </div>

          {CHART_TABS.has(tab) ? (
            <div className="node-infobar-actions">
              <RangeSelect />
              {phone ? null : (
                <SegmentedControl label="Chart width" value={chartLayout} onChange={changeLayout}>
                  <SegmentedControlItem
                    value="grid"
                    label={
                      <>
                        <Columns size={13} aria-hidden="true" />
                        Grid
                      </>
                    }
                  />
                  <SegmentedControlItem
                    value="full"
                    label={
                      <>
                        <Rows size={13} aria-hidden="true" />
                        Full
                      </>
                    }
                  />
                </SegmentedControl>
              )}
            </div>
          ) : null}
        </header>

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
      <div className={!phone && chartLayout === 'full' ? 'charts-single' : undefined} style={{ display: 'contents' }}>
        <Outlet context={view} />
      </div>
    </>
  );
}
