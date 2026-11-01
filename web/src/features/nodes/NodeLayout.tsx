import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/Panel';
import { CopyLinkButton } from '../../components/CopyLinkButton';
import { StatusPill } from '../../components/StatusPill';
import { ErrorPanel, PageSkeleton } from '../../components/States';
import { useNode } from '../../data/queries';
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
        crumbs={
          <>
            <Link to="/nodes">Nodes</Link>
            <span aria-hidden="true">/</span>
            <span className="quiet">{node.name}</span>
          </>
        }
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
          <>
            <Link className="btn btn-ghost" to={`/nodes/${node.id}/apps`}>
              Apps
            </Link>
            <CopyLinkButton />
          </>
        }
      />
      <nav className="tabs" aria-label="Node views">
        {TABS.map((tab) => (
          <NavLink key={tab.label} to={`/nodes/${node.id}${tab.to}`} end={tab.to === ''} className="tab">
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={view} />
    </>
  );
}
