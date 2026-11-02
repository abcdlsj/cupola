import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api, ApiError } from './api';
import { supportsSeries } from '../lib/metrics';
import type {
  Action,
  ActionRun,
  ActionResult,
  Alert,
  AlertRule,
  APIToken,
  Channel,
  Delivery,
  Event,
  FleetAction,
  FleetAgent,
  FleetSummary,
  HubSettings,
  JoinCode,
  JoinStatus,
  Me,
  NodeView,
  Series,
  TailnetPeers,
} from './types';

export { ApiError };

const V1 = '/api/v1';

/** One place for the keys the SSE stream invalidates. */
export const keys = {
  me: ['me'] as const,
  fleet: ['fleet'] as const,
  node: (id: string) => ['node', id] as const,
  series: (id: string, metric: string, range: string) => ['series', id, metric, range] as const,
  agents: ['fleet-agents'] as const,
  actions: (id?: string) => ['actions', id ?? 'fleet'] as const,
  runs: (id?: string) => ['runs', id ?? 'fleet'] as const,
  events: (filter?: EventFilter) => ['events', filter ?? {}] as const,
  event: (id: string) => ['event', id] as const,
  alerts: (state: string) => ['alerts', state] as const,
  rules: ['rules'] as const,
  rule: (id: string) => ['rule', id] as const,
  channels: ['channels'] as const,
  deliveries: ['deliveries'] as const,
  tokens: ['tokens'] as const,
  settings: ['settings'] as const,
  joinStatus: (nodeId: string) => ['join-status', nodeId] as const,
  tailnetPeers: ['tailnet-peers'] as const,
};

/** Anything the hub pushed means the cached reads are stale. */
export function invalidateLive(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: keys.fleet });
  void client.invalidateQueries({ queryKey: keys.agents });
  void client.invalidateQueries({ queryKey: ['node'] });
  void client.invalidateQueries({ queryKey: ['series'] });
  void client.invalidateQueries({ queryKey: keys.actions() });
  void client.invalidateQueries({ queryKey: keys.runs() });
  void client.invalidateQueries({ queryKey: ['events'] });
  void client.invalidateQueries({ queryKey: ['alerts'] });
  void client.invalidateQueries({ queryKey: ['deliveries'] });
}

// ---------- identity ----------

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<Me>(`${V1}/auth/me`),
    staleTime: 30_000,
    retry: false,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      api<{ ok: boolean }>(`${V1}/auth/login`, { method: 'POST', body: { password } }),
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current_password: string; new_password: string }) =>
      api<{ ok: boolean }>('/api/v1/auth/password', { method: 'POST', body: input }),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: boolean }>(`${V1}/auth/logout`, { method: 'POST' }),
    onSuccess: () => {
      client.clear();
      void client.invalidateQueries({ queryKey: keys.me });
    },
  });
}

// ---------- fleet and nodes ----------

export function useFleet() {
  const query = useQuery({
    queryKey: keys.fleet,
    queryFn: () => api<FleetSummary>(`${V1}/fleet/summary`),
    // The last good snapshot stays on screen while a poll is in flight or the
    // hub is unreachable; the banner names it.
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });
  return {
    ...query,
    data: query.data
      ? { ...query.data, stale: query.isError || Boolean(query.data.stale) }
      : query.data,
  };
}

export function useNode(nodeId: string | undefined) {
  return useQuery({
    queryKey: keys.node(nodeId ?? ''),
    queryFn: () => api<NodeView>(`${V1}/nodes/${encodeURIComponent(nodeId ?? '')}`),
    enabled: Boolean(nodeId),
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
}

export function useSeries(nodeId: string, metric: string, range: string) {
  return useQuery({
    queryKey: keys.series(nodeId, metric, range),
    queryFn: () =>
      api<Series>(`${V1}/nodes/${encodeURIComponent(nodeId)}/series?metric=${metric}&range=${range}`),
    enabled: Boolean(nodeId) && supportsSeries(metric),
    // A window switch keeps the previous curve until the next one lands, so the
    // panel never collapses to an empty frame.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

/**
 * Warm the series the operator is about to open. The hub already has the
 * samples; this removes the wait between a click and a drawn curve.
 */
export function prefetchSeries(
  client: QueryClient,
  nodeId: string,
  pairs: ReadonlyArray<readonly [string, string]>,
): void {
  for (const [metric, range] of pairs) {
    if (!supportsSeries(metric)) continue;
    void client.prefetchQuery({
      queryKey: keys.series(nodeId, metric, range),
      queryFn: () =>
        api<Series>(`${V1}/nodes/${encodeURIComponent(nodeId)}/series?metric=${metric}&range=${range}`),
      staleTime: 15_000,
    });
  }
}

/** What each node tab draws first, warmed when the tab is hovered or focused. */
export const TAB_SERIES: Record<string, ReadonlyArray<readonly [string, string]>> = {
  '': [['cpu', '1h']],
  '/cpu': [
    ['cpu', '1h'],
    ['psi_cpu', '1h'],
  ],
  '/memory': [['mem', '1h']],
  '/storage': [['psi_io', '1h']],
};

export function useCreateNode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      name: string;
      url?: string;
      token: string;
      transport: 'direct' | 'bolthole';
      conn?: string;
      labels: string[];
    }) => api<NodeView>(`${V1}/nodes`, { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.fleet }),
  });
}

export function useUpdateNode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        name?: string;
        labels?: string[];
        url?: string;
        token?: string;
        transport?: string;
        conn?: string;
      };
    }) =>
      api<NodeView>(`${V1}/nodes/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({ queryKey: keys.fleet });
      void client.invalidateQueries({ queryKey: keys.node(variables.id) });
    },
  });
}

export function useDeleteNode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`${V1}/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.fleet }),
  });
}

export function useTestNode() {
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean; ts: number; node_id: string; os: string; kernel: string; agent: string; cpu_pct: number; processes: number }>(
        `${V1}/nodes/${encodeURIComponent(id)}/test`,
        { method: 'POST' },
      ),
  });
}

// ---------- agents and actions ----------

export function useFleetAgents() {
  return useQuery({
    queryKey: keys.agents,
    queryFn: () => api<FleetAgent[]>(`${V1}/agents`),
  });
}

export function useActions(nodeId: string | undefined) {
  return useQuery({
    queryKey: keys.actions(nodeId),
    queryFn: () =>
      nodeId
        ? api<{ actions: Action[] }>(`${V1}/nodes/${encodeURIComponent(nodeId)}/actions`)
        : Promise.resolve({ actions: [] }),
    enabled: Boolean(nodeId),
  });
}

export function useFleetActions() {
  return useQuery({
    queryKey: keys.actions(),
    queryFn: () => api<FleetAction[]>(`${V1}/actions`),
  });
}

export function useRuns(nodeId?: string) {
  return useQuery({
    queryKey: keys.runs(nodeId),
    queryFn: () =>
      api<ActionRun[]>(
        nodeId ? `${V1}/nodes/${encodeURIComponent(nodeId)}/action-runs` : `${V1}/action-runs`,
      ),
  });
}

export function useRunAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, actionId }: { nodeId: string; actionId: string }) =>
      api<ActionResult>(
        `${V1}/nodes/${encodeURIComponent(nodeId)}/actions/${encodeURIComponent(actionId)}/run`,
        { method: 'POST' },
      ),
    onSuccess: (_result, variables) => {
      void client.invalidateQueries({ queryKey: keys.runs(variables.nodeId) });
      void client.invalidateQueries({ queryKey: keys.runs() });
      void client.invalidateQueries({ queryKey: keys.actions(variables.nodeId) });
      void client.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// ---------- events ----------

export interface EventFilter {
  node?: string;
  kind?: string;
  severity?: string;
  q?: string;
  since?: string;
  limit?: number;
}

export function useEvents(filter: EventFilter = {}) {
  return useQuery({
    queryKey: keys.events(filter),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
      }
      const query = params.toString();
      return api<Event[]>(`${V1}/events${query ? `?${query}` : ''}`);
    },
    placeholderData: keepPreviousData,
  });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: keys.event(eventId ?? ''),
    queryFn: () => api<Event>(`${V1}/events/${encodeURIComponent(eventId ?? '')}`),
    enabled: Boolean(eventId),
  });
}

// ---------- alerts, rules, channels ----------

export function useAlerts(state: 'firing' | 'all') {
  return useQuery({
    queryKey: keys.alerts(state),
    queryFn: () => api<Alert[]>(`${V1}/alerts${state === 'firing' ? '?state=firing' : ''}`),
  });
}

export function useRules() {
  return useQuery({ queryKey: keys.rules, queryFn: () => api<AlertRule[]>(`${V1}/alerts/rules`) });
}

export function useRule(ruleId: string | undefined) {
  return useQuery({
    queryKey: keys.rule(ruleId ?? ''),
    queryFn: () => api<AlertRule>(`${V1}/alerts/rules/${encodeURIComponent(ruleId ?? '')}`),
    enabled: Boolean(ruleId),
  });
}

export function useSaveRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (rule: Partial<AlertRule>) =>
      rule.id
        ? api<AlertRule>(`${V1}/alerts/rules/${encodeURIComponent(rule.id)}`, { method: 'PATCH', body: rule })
        : api<AlertRule>(`${V1}/alerts/rules`, { method: 'POST', body: rule }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.rules });
      void client.invalidateQueries({ queryKey: ['rule'] });
      void client.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useDeleteRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      api(`${V1}/alerts/rules/${encodeURIComponent(ruleId)}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.rules });
      void client.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useChannels() {
  return useQuery({ queryKey: keys.channels, queryFn: () => api<Channel[]>(`${V1}/channels`) });
}

export function useSaveChannel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (channel: {
      id?: string;
      name: string;
      kind: string;
      url?: string;
      secret?: string;
      token?: string;
      chat_id?: string;
    }) =>
      channel.id
        ? api<Channel>(`${V1}/channels/${encodeURIComponent(channel.id)}`, { method: 'PATCH', body: channel })
        : api<Channel>(`${V1}/channels`, { method: 'POST', body: channel }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.channels }),
  });
}

export function useDeleteChannel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      api(`${V1}/channels/${encodeURIComponent(channelId)}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.channels }),
  });
}

export function useTestAlert() {
  return useMutation({
    mutationFn: (channelId: string) =>
      api<{ ok: boolean }>(`${V1}/alerts/test`, { method: 'POST', body: { channel_id: channelId } }),
  });
}

export function useDeliveries() {
  return useQuery({ queryKey: keys.deliveries, queryFn: () => api<Delivery[]>(`${V1}/alerts/deliveries`) });
}

// ---------- tokens ----------

export function useTokens() {
  return useQuery({ queryKey: keys.tokens, queryFn: () => api<APIToken[]>(`${V1}/tokens`) });
}

export function useCreateToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      scopes: string[];
      node_ids: string[];
      action_ids: string[];
      expires_at: number;
    }) => api<{ token: string; record: APIToken }>(`${V1}/tokens`, { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tokens }),
  });
}

export function useDeleteToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) =>
      api(`${V1}/tokens/${encodeURIComponent(tokenId)}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tokens }),
  });
}

// ---------- settings and join ----------

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => api<HubSettings>(`${V1}/settings`),
    staleTime: 60_000,
  });
}

export function useCreateJoinCode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name: string; labels: string[]; advertise?: string }) =>
      api<JoinCode>(`${V1}/join/codes`, { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.fleet }),
  });
}

export function useTailnetPeers(enabled = true) {
  return useQuery({
    queryKey: keys.tailnetPeers,
    queryFn: () => api<TailnetPeers>(`${V1}/tailnet/peers`),
    enabled,
    staleTime: 10_000,
  });
}

export function useJoinStatus(nodeId: string | null) {
  return useQuery({
    queryKey: keys.joinStatus(nodeId ?? ''),
    queryFn: () => api<JoinStatus>(`${V1}/join/${encodeURIComponent(nodeId ?? '')}/status`),
    enabled: Boolean(nodeId),
    refetchInterval: (query) => (query.state.data?.joined ? false : 3000),
  });
}
