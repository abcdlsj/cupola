import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { NotFoundPage } from './components/NotFoundPage';
import { CupolaMark } from './components/CupolaMark';
import { useMe } from './data/queries';
import { OverviewPage } from './features/overview/OverviewPage';
import { FleetServicesPage } from './features/services/ServicesPage';
import { NodesPage } from './features/nodes/NodesPage';
import { NodeLayout } from './features/nodes/NodeLayout';
import { NodeOverview } from './features/nodes/NodeOverview';
import { CpuPage, MemoryPage, NetworkPage, StoragePage } from './features/nodes/MetricPages';
import {
  AppDetailPage,
  AppsTab,
  ContainerDetailPage,
  ContainersPage,
  NodeEventsPage,
  ProcessDetailPage,
  ProcessesPage,
  ServiceDetailPage,
} from './features/nodes/NodeLists';
import { AppsPage } from './features/apps/AppsPage';
import { EventDetailPage, EventsPage } from './features/events/EventsPage';
import { AlertsPage } from './features/alerts/AlertsPage';
import { RuleEditorPage } from './features/alerts/RuleEditor';
import {
  AboutSettingsPage,
  AccountSettingsPage,
  AlertsSettingsPage,
  AppearanceSettingsPage,
  NodesSettingsPage,
  RetentionSettingsPage,
  TokensSettingsPage,
} from './features/settings/SettingsPages';
import { LoginPage } from './features/auth/LoginPage';

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false },
  },
});

function Boot() {
  return (
    <div className="boot">
      <CupolaMark size={26} />
      <p>Connecting to the hub…</p>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isPending) return <Boot />;
  if (me.isError || !me.data?.authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Every object and view is a route. Tabs are links, detail views are pages and
 * the back button always works.
 */
export function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/connect" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="services" element={<FleetServicesPage />} />
            <Route path="nodes" element={<NodesPage />} />
            <Route path="nodes/:nodeId" element={<NodeLayout />}>
              <Route index element={<NodeOverview />} />
              <Route path="cpu" element={<CpuPage />} />
              <Route path="memory" element={<MemoryPage />} />
              <Route path="storage" element={<StoragePage />} />
              <Route path="network" element={<NetworkPage />} />
              <Route path="processes" element={<ProcessesPage />} />
              <Route path="processes/:pid" element={<ProcessDetailPage />} />
              <Route path="services" element={<FleetServicesPage />} />
              <Route path="services/:unit" element={<ServiceDetailPage />} />
              <Route path="containers" element={<ContainersPage />} />
              <Route path="containers/:containerId" element={<ContainerDetailPage />} />
              <Route path="apps" element={<AppsTab />} />
              <Route path="apps/:actionId" element={<AppDetailPage />} />
              <Route path="events" element={<NodeEventsPage />} />
            </Route>
            <Route path="apps" element={<AppsPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/:eventId" element={<EventDetailPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="alerts/rules/:ruleId" element={<RuleEditorPage />} />
            <Route path="settings/nodes" element={<NodesSettingsPage />} />
            <Route path="settings/alerts" element={<AlertsSettingsPage />} />
            <Route path="settings/tokens" element={<TokensSettingsPage />} />
            <Route path="settings/retention" element={<RetentionSettingsPage />} />
            <Route path="settings/appearance" element={<AppearanceSettingsPage />} />
            <Route path="settings/account" element={<AccountSettingsPage />} />
            <Route path="settings/about" element={<AboutSettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
