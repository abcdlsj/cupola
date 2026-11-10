import { useEffect, useState, type ReactNode } from 'react';
import { Chrome, useMode } from './Chrome';
import { EventsPage, AlertsPage, AppsPage, NotFoundPage, ServicesPage } from './pages/Fleet';
import { NodePage } from './pages/Node';
import { SettingsPage } from './pages/Settings';
import { SystemsPage } from './pages/Systems';

/**
 * Hash routing instead of react-router: the demo is one static page, and every
 * view still gets a real URL you can paste back.
 */
function route(hash: string) {
  const path = hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return <SystemsPage />;
  if (parts[0] === 'nodes' && parts[1]) return <NodePage nodeId={parts[1]} tab={parts[2]} />;
  if (parts[0] === 'services') return <ServicesPage />;
  if (parts[0] === 'apps') return <AppsPage />;
  if (parts[0] === 'alerts') return <AlertsPage />;
  if (parts[0] === 'events') return <EventsPage />;
  if (parts[0] === 'settings') return <SettingsPage section={parts[1] ?? 'nodes'} />;
  return <NotFoundPage />;
}

export function App() {
  const [mode, onMode] = useMode();
  const [hash, setHash] = useState(() => location.hash);

  return (
    <RouteListener onPath={setHash}>
      <Chrome mode={mode} onMode={onMode}>
        {route(hash)}
      </Chrome>
    </RouteListener>
  );
}

function RouteListener({ onPath, children }: { onPath: (hash: string) => void; children: ReactNode }) {
  useEffect(() => {
    const onChange = () => onPath(location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [onPath]);
  return <>{children}</>;
}
