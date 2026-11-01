import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/Panel';
import { CopyLinkButton } from '../../components/CopyLinkButton';
import { StatusPill } from '../../components/StatusPill';
import { ErrorPanel, PageSkeleton } from '../../components/States';
import { useFleet } from '../../data/queries';
import { uptime } from '../../lib/format';

export function NodePage() {
  const { nodeId } = useParams();
  const fleet = useFleet();

  if (fleet.isPending) return <PageSkeleton title="Node" />;
  if (fleet.isError || !fleet.data) {
    return (
      <>
        <PageHeader title="Node" finding="The node did not load." />
        <ErrorPanel what="Couldn't load the fleet snapshot." onRetry={() => void fleet.refetch()} />
      </>
    );
  }

  const node = fleet.data.nodes.find((entry) => entry.id === nodeId);
  if (!node) {
    return (
      <>
        <PageHeader title="Not found" finding={`No node has the id “${nodeId}”.`} />
        <div className="panel">
          <p className="empty">
            The node was renamed or removed. <Link className="link" to="/nodes">Back to the fleet</Link>.
          </p>
        </div>
      </>
    );
  }

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
            <StatusPill status={node.status} />
            {node.labels.map((label) => (
              <span className="pill" data-tone="neutral" key={label}>
                {label}
              </span>
            ))}
          </>
        }
        finding={`${node.ip} · ${node.os} · kernel ${node.kernel} · ${
          node.status === 'offline' ? `last seen ${uptime((fleet.data.generatedAt - node.lastSeenAt) / 1000)} ago` : `up ${uptime(node.uptimeSec)}`
        }`}
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
        <NavLink to={`/nodes/${node.id}`} end className="tab">
          Overview
        </NavLink>
        <NavLink to={`/nodes/${node.id}/agents`} className="tab">
          Agents
        </NavLink>
        <NavLink to={`/nodes/${node.id}/apps`} className="tab">
          Apps
        </NavLink>
      </nav>
      <Outlet />
    </>
  );
}
