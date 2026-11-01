import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Panel';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Not found" finding="This route has no screen." />
      <div className="panel">
        <p className="empty">
          The view was renamed or never existed. <Link className="link" to="/">Back to the overview</Link>.
        </p>
      </div>
    </>
  );
}

export function MissingNode({ nodeId }: { nodeId: string }) {
  return (
    <div className="panel">
      <p className="empty">
        No node has the id “{nodeId}”. <Link className="link" to="/nodes">Back to the fleet</Link>.
      </p>
    </div>
  );
}
