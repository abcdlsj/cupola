import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { NotFoundPage } from './components/NotFoundPage';
import { OverviewPage } from './features/overview/OverviewPage';
import { NodesPage } from './features/nodes/NodesPage';
import { NodePage } from './features/nodes/NodePage';
import { NodeOverview } from './features/nodes/NodeOverview';
import { AgentsPage } from './features/agents/AgentsPage';
import { AppsPage } from './features/apps/AppsPage';
import { AboutPage } from './features/settings/AboutPage';

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

/**
 * Every object and view is a route: tabs are links, detail views are pages, and
 * the back button always works. M0 implements overview, nodes, node overview,
 * agents and apps; the remaining node tabs and settings land in M3.
 */
export function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="nodes" element={<NodesPage />} />
            <Route path="nodes/:nodeId" element={<NodePage />}>
              <Route index element={<NodeOverview />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="apps" element={<AppsPage />} />
            </Route>
            <Route path="agents" element={<AgentsPage />} />
            <Route path="apps" element={<AppsPage />} />
            <Route path="settings/about" element={<AboutPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
