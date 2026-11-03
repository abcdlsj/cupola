import { Navigate, useLocation } from 'react-router-dom';

/**
 * The systems table is the home screen; /nodes stays a working address (old
 * bookmarks, the API docs) and lands there with its filter intact.
 */
export function NodesPage() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/', search: location.search }} replace />;
}
