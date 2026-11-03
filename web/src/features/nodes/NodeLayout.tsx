import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CaretLeft } from '@phosphor-icons/react';
import { PageHeader } from '../../components/Panel';
import { StatusPill } from '../../components/StatusPill';
import { ErrorPanel } from '../../components/States';
import { prefetchSeries, TAB_SERIES, useNode } from '../../data/queries';
import type { NodeView } from '../../data/types';
import { relative, size, uptime } from '../../lib/format';
import { RangeSelect, useRange } from './RangeControl';

/** Tabs whose screens draw history; the window picker only shows on these. */
const CHART_TABS = new Set(['', '/cpu', '/memory', '/storage', '/network', '/containers']);

function tabs(view: NodeView): Array<{ to: string; label: string; count?: ReactNode }> {
  const snap = view.snapshot;
  const failed = snap?.services.filter((service) => service.active_state === 'failed').length ?? 0;
  return [
    { to: '', label: 'Overview' },
    { to: '/cpu', label: 'CPU' },
    { to: '/memory', label: 'Memory' },
    { to: '/storage', label: 'Storage', count: snap?.disks.length || undefined },
    { to: '/network', label: 'Network' },
    { to: '/processes', label: 'Processes', count: snap?.cpu.procs || undefined },
    { to: '/agents', label: 'Agents', count: snap?.agents.length || undefined },
    {
      to: '/services',
      label: 'Services',
      count: failed ? <span className="tone-negative">{failed} failed</span> : snap?.services.length || undefined,
    },
    { to: '/containers', label: 'Containers', count: snap?.containers.length || undefined },
    { to: '/apps', label: 'Apps', count: view.health.apps || undefined },
    { to: '/events', label: 'Events' },
  ];
}

function NodeSkeleton() {
  return (
    <section className="panel node-head" aria-hidden="true">
      <div className="node-head-main">
        <span className="skeleton" style={{ width: 160, height: 20 }} />
        <span className="skeleton" style={{ width: 420, marginTop: 12 }} />
      </div>
    </section>
  );
}

export function NodeLayout() {
  const { nodeId = '' } = useParams();
  const location = useLocation();
  const query = useNode(nodeId);
  const client = useQueryClient();
  const [range] = useRange();
  const [params] = useSearchParams();

  // The samples are already on the hub. Pull the overview window as soon as the
  // node resolves so the first chart paints without a second round trip.
  useEffect(() => {
    if (!nodeId) return;
    prefetchSeries(client, nodeId, (TAB_SERIES[''] ?? []).map(([metric]) => [metric, range] as const));
  }, [client, nodeId, range]);

  if (query.isPending) return <NodeSkeleton />;
  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader title="System not found" finding="This system is not registered, or the hub is unreachable." />
        <ErrorPanel what="The system does not exist or the hub is unreachable." onRetry={() => void query.refetch()} />
        <p className="note">
          <Link className="link" to="/">
            Back to all systems
          </Link>
        </p>
      </>
    );
  }

  const view = query.data;
  const node = view.node;
  const snap = view.snapshot;
  const info = snap?.node;
  const now = Date.now();
  const os = [info?.platform || node.os, info?.platform_version].filter(Boolean).join(' ') || node.os;
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Host', value: info?.hostname || node.id },
    snap ? { label: 'Uptime', value: uptime(snap.node.uptime_sec) } : { label: 'Last seen', value: node.last_seen ? relative(node.last_seen, now) : 'never' },
    { label: 'OS', value: os || '—' },
    { label: 'Kernel', value: node.kernel || info?.kernel || '—' },
    { label: 'CPU', value: info ? `${info.cpu_model || 'unknown'} · ${info.cores} threads` : '—' },
    { label: 'Memory', value: snap ? size(snap.memory.total) : '—' },
    { label: 'Agent', value: `${node.agent_version || '—'} · ${node.mode}` },
  ].filter((fact) => fact.value && fact.value !== '—');
  const warning = view.health.warnings?.[0];
  const rest = location.pathname.slice(`/nodes/${nodeId}`.length).split('/').filter(Boolean);
  // detail routes (a process, a container) have no window picker; only the tab roots do
  const tab = rest.length === 0 ? '' : rest.length === 1 || rest[0] === 'containers' ? `/${rest[0]}` : '/detail';
  const search = params.get('range') ? `?range=${params.get('range')}` : '';

  return (
    <>
      <section className="panel node-head" aria-labelledby="node-title">
        <div className="node-head-main">
          <div className="node-title-line">
            <Link to="/" className="node-back" aria-label="All systems">
              <CaretLeft size={18} aria-hidden="true" />
            </Link>
            <h1 className="page-title" id="node-title">
              {node.name}
            </h1>
            <StatusPill status={view.health.status} />
            {warning ? <span className="node-warning">{warning}</span> : null}
            {node.labels.map((label) => (
              <span className="pill" data-tone="neutral" key={label}>
                {label}
              </span>
            ))}
          </div>
          <dl className="node-facts">
            {facts.map((fact) => (
              <div className="node-fact" key={fact.label}>
                <dt>{fact.label}</dt>
                <dd className={fact.label === 'Host' || fact.label === 'Kernel' || fact.label === 'Agent' || fact.label === 'Uptime' || fact.label === 'Memory' ? 'fig' : undefined}>
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {CHART_TABS.has(tab) ? (
          <div className="node-head-tools">
            <RangeSelect />
          </div>
        ) : null}
      </section>
      <nav className="tabs" aria-label="System views">
        {tabs(view).map((item) => (
          <NavLink
            key={item.label}
            to={{ pathname: `/nodes/${node.id}${item.to}`, search: CHART_TABS.has(item.to) ? search : '' }}
            end={item.to === ''}
            className="tab"
            onMouseEnter={() => prefetchSeries(client, node.id, (TAB_SERIES[item.to] ?? []).map(([metric]) => [metric, range] as const))}
            onFocus={() => prefetchSeries(client, node.id, (TAB_SERIES[item.to] ?? []).map(([metric]) => [metric, range] as const))}
          >
            {item.label}
            {item.count != null ? <span className="tab-count">{item.count}</span> : null}
          </NavLink>
        ))}
      </nav>
      <Outlet context={view} />
    </>
  );
}
