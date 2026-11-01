import { useEffect } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/Panel';
import { StatusPill } from '../../components/StatusPill';
import { ErrorPanel, PageSkeleton } from '../../components/States';
import { prefetchSeries, TAB_SERIES, useNode } from '../../data/queries';
import { eventTime, uptime } from '../../lib/format';

const TABS = [
  { to: '', label: 'Overview' },
  { to: '/cpu', label: 'CPU' },
  { to: '/memory', label: 'Memory' },
  { to: '/storage', label: 'Storage' },
  { to: '/network', label: 'Network' },
  { to: '/processes', label: 'Processes' },
  { to: '/agents', label: 'Agents' },
  { to: '/services', label: 'Services' },
  { to: '/containers', label: 'Containers' },
  { to: '/apps', label: 'Apps' },
  { to: '/events', label: 'Events' },
];

export function NodeLayout() {
  const { nodeId = '' } = useParams();
  const query = useNode(nodeId);
  const client = useQueryClient();

  // The samples are already on the hub. Pull the overview window as soon as the
  // node resolves so the first chart paints without a second round trip.
  useEffect(() => {
    if (!nodeId) return;
    prefetchSeries(client, nodeId, [...TAB_SERIES[''], ...TAB_SERIES['/cpu']]);
  }, [client, nodeId]);

  if (query.isPending) return <PageSkeleton title="Node" />;
  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader title="Node" finding="This node could not be loaded." />
        <ErrorPanel what="The node does not exist or the hub is unreachable." onRetry={() => void query.refetch()} />
      </>
    );
  }

  const view = query.data;
  const node = view.node;
  const snap = view.snapshot;
  const meta = [
    node.os || snap?.node?.platform,
    node.kernel,
    node.arch,
    snap ? `up ${uptime(snap.node.uptime_sec)}` : node.last_seen ? `last seen ${eventTime(node.last_seen, Date.now())}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <PageHeader
        title={node.name}
        titleExtra={
          <>
            <StatusPill status={view.health.status} />
            {node.labels.map((label) => (
              <span className="pill" data-tone="neutral" key={label}>
                {label}
              </span>
            ))}
          </>
        }
        finding={meta || 'Waiting for the first snapshot.'}
        actions={
          <Link className="btn btn-ghost" to={`/nodes/${node.id}/apps`}>
            Apps
          </Link>
        }
      />
      <nav className="tabs" aria-label="Node views">
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/nodes/${node.id}${tab.to}`}
            end={tab.to === ''}
            className="tab"
            onMouseEnter={() => prefetchSeries(client, node.id, TAB_SERIES[tab.to] ?? [])}
            onFocus={() => prefetchSeries(client, node.id, TAB_SERIES[tab.to] ?? [])}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={view} />
    </>
  );
}
