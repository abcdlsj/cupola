/**
 * The hub's JSON, mirroring internal/model. Timestamps are Unix milliseconds,
 * byte figures are bytes, rates are bytes per second, percentages are 0-100.
 */

export type NodeStatus = 'healthy' | 'degraded' | 'offline' | 'unknown';
export type Severity = 'info' | 'warning' | 'critical';

export interface NodeRecord {
  id: string;
  name: string;
  labels: string[];
  mode: 'pull' | 'push';
  url?: string;
  agent_version: string;
  os: string;
  kernel: string;
  arch: string;
  created_at: number;
  last_seen: number;
  status: NodeStatus | 'pending';
}

export interface NodeHealth {
  status: NodeStatus;
  days_to_full?: number;
  attention: number;
  root_disk_pct: number;
  mem_pct: number;
  cpu_pct: number;
  load1: number;
  uptime_sec: number;
  agents: number;
  failed_units: number;
  containers: number;
  apps: number;
  mem_used: number;
  mem_total: number;
  root_disk_used: number;
  root_disk_total: number;
  net_rx_bps: number;
  warnings?: string[];
}

export interface NodeInfo {
  id: string;
  name: string;
  hostname: string;
  os: string;
  platform: string;
  platform_version: string;
  kernel: string;
  arch: string;
  virtualization: string;
  cpu_model: string;
  cores: number;
  boot_time: number;
  uptime_sec: number;
  agent_version: string;
  labels: string[];
}

export interface PressureStat {
  some: number;
  full: number;
}

export interface CPUStats {
  percent: number;
  per_core: number[];
  user: number;
  system: number;
  iowait: number;
  steal: number;
  idle: number;
  mhz: number;
  load1: number;
  load5: number;
  load15: number;
  procs: number;
}

export interface MemoryStats {
  total: number;
  used: number;
  available: number;
  cached: number;
  buffers: number;
  used_percent: number;
  swap_total: number;
  swap_used: number;
}

export interface DiskStats {
  device: string;
  mount: string;
  fstype: string;
  total: number;
  used: number;
  free: number;
  used_pct: number;
  inodes: number;
  inodes_used: number;
  inode_pct: number;
  read_bps: number;
  write_bps: number;
  read_iops: number;
  write_iops: number;
  latency_ms: number;
  read_only: boolean;
}

export interface NetStats {
  iface: string;
  up: boolean;
  rx_bytes: number;
  tx_bytes: number;
  rx_bps: number;
  tx_bps: number;
  rx_errors: number;
  tx_errors: number;
  rx_drops: number;
  tx_drops: number;
  speed_mbps: number;
  duplex: string;
  driver: string;
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  user: string;
  name: string;
  command: string;
  cpu_percent: number;
  rss_bytes: number;
  threads: number;
  started_at: number;
  state: string;
  read_bps: number;
  write_bps: number;
  tty?: string;
  cwd?: string;
  cgroup?: string;
  container?: string;
}

export interface AgentSession {
  id: string;
  type: string;
  label: string;
  category: string;
  pid: number;
  project: string;
  cwd: string;
  command: string;
  started_at: number;
  runtime_sec: number;
  cpu_percent: number;
  rss_bytes: number;
  tty: string;
  parent: string;
  container?: string;
}

export interface PortInfo {
  proto: string;
  address: string;
  port: number;
  state: string;
  inode: number;
  pid: number;
  process: string;
  container?: string;
}

export interface Service {
  name: string;
  description: string;
  load_state: string;
  active_state: string;
  sub_state: string;
  enabled: string;
  restarts: number;
  since?: number;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  uptime_sec: number;
  cpu_percent: number;
  mem_bytes: number;
  mem_limit: number;
  restarts: number;
  ports: string[];
}

/** One Docker image: what it weighs and how much of that is shared. */
export interface DockerImage {
  id: string;
  repo_tag: string;
  size: number;
  shared_size: number;
  containers: number;
  dangling: boolean;
  created_at: number;
}

/** One bucket of a container's history. */
export interface ContainerPoint {
  ts: number;
  cpu: number;
  mem: number;
}

export interface ContainerSeries {
  id: string;
  name: string;
  image: string;
  points: ContainerPoint[];
}

export interface ContainerHistory {
  node_id: string;
  range: string;
  step_sec: number;
  containers: ContainerSeries[];
}

export interface Sensor {
  chip: string;
  label: string;
  kind: 'temperature' | 'fan' | 'voltage' | string;
  value: number;
  unit: string;
}

export interface GPU {
  index: number;
  vendor: string;
  name: string;
  util_percent: number;
  mem_used: number;
  mem_total: number;
  temp_c: number;
  power_w: number;
  power_limit_w: number;
  processes?: Array<{ pid: number; name: string; mem_bytes: number }>;
}

export interface SMARTDevice {
  device: string;
  model: string;
  type: string;
  health: string;
  temperature_c: number;
  wear_percent: number;
  reallocated: number;
  power_on_hours: number;
  error?: string;
}

export interface Updates {
  manager: string;
  pending: number;
  security: number;
  checked_at: number;
  error?: string;
}

export interface Snapshot {
  ts: number;
  node: NodeInfo;
  cpu: CPUStats;
  memory: MemoryStats;
  pressure: { cpu: PressureStat; io: PressureStat; mem: PressureStat };
  disks: DiskStats[];
  network: NetStats[];
  processes: ProcessInfo[];
  agents: AgentSession[];
  ports: PortInfo[];
  services: Service[];
  containers: Container[];
  images?: DockerImage[];
  sensors: Sensor[];
  gpus: GPU[];
  smart: SMARTDevice[];
  users: Array<{ name: string; tty: string; host: string; started_at: number }>;
  updates?: Updates;
  fd: { allocated: number; max: number; conntrack: number };
  warnings?: string[];
}

export interface NodeView {
  node: NodeRecord;
  health: NodeHealth;
  snapshot?: Snapshot;
}

export interface FleetSummary {
  nodes: NodeView[];
  updated: number;
  /** Set by the client when the hub stopped answering; not part of the API. */
  stale?: boolean;
}

export interface SeriesPoint {
  ts: number;
  min: number;
  avg: number;
  max: number;
}

export interface Series {
  node_id: string;
  metric: string;
  range: string;
  step_sec: number;
  points: SeriesPoint[];
}

export interface Action {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: 'script' | 'wol' | string;
  danger: boolean;
  allow_api: boolean;
  last_run_at?: number;
  last_ok?: boolean | null;
  custom_icon?: string;
}

export interface FleetAction extends Action {
  node_id: string;
  node_name: string;
}

export interface ActionResult {
  run_id: string;
  action_id?: string;
  ok?: boolean;
  exit_code: number;
  duration_ms: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  started_at?: number;
}

export interface ActionRun {
  id: string;
  node_id: string;
  action_id: string;
  action_name?: string;
  ts: number;
  actor: string;
  source: 'ui' | 'api' | string;
  ok: boolean;
  exit_code: number;
  duration_ms: number;
  output?: string;
  truncated: boolean;
}

export interface Event {
  id: number;
  node_id: string;
  ts: number;
  kind: string;
  severity: Severity;
  message: string;
  meta?: string;
}

export interface FleetAgent extends AgentSession {
  node_id: string;
  node_name: string;
}

export interface AlertRule {
  id: string;
  name: string;
  type: 'metric' | 'event';
  metric?: string;
  comparator?: 'gt' | 'lt';
  threshold?: number;
  duration_sec?: number;
  severity: Severity;
  node_id?: string;
  kinds?: string[];
  channel_id?: string;
  enabled: boolean;
  cooldown_sec: number;
  created_at?: number;
}

export interface Alert {
  id: number;
  rule_id: string;
  rule_name?: string;
  node_id: string;
  ts: number;
  state: 'firing' | 'resolved' | string;
  value: number;
  message: string;
}

export interface Channel {
  id: string;
  name: string;
  kind: 'webhook' | 'ntfy' | 'discord' | 'slack' | 'telegram' | string;
  has_secret: boolean;
  target: string;
  created_at: number;
}

export interface Delivery {
  id: number;
  alert_id: number;
  channel_id: string;
  ts: number;
  ok: boolean;
  status: string;
  attempts: number;
  error?: string;
}

export interface APIToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  node_ids: string[];
  action_ids: string[];
  created_at: number;
  expires_at?: number;
  last_used?: number;
}

export interface Me {
  authenticated: boolean;
  mode: 'session' | 'token' | '';
  admin: boolean;
  version: { version: string; commit: string; date?: string };
  public_url: string;
  node_count: number;
  token_name?: string;
  scopes?: string[];
}

export interface HubSettings {
  poll_interval_sec: number;
  retention_raw_hours: number;
  retention_minute_days: number;
  retention_hour_months: number;
  allow_private_webhooks: boolean;
  public_url: string;
  node_count: number;
  version: { version: string; commit: string; date?: string };
  data_dir: string;
}

export interface JoinCode {
  code: string;
  node_id: string;
  expires_at: number;
  hub_url: string;
  commands: Record<string, string>;
}

export interface JoinStatus {
  node_id: string;
  name: string;
  status: string;
  last_seen: number;
  joined: boolean;
}

export interface TailnetPeer {
  name: string;
  ipv4: string;
  os: string;
  online: boolean;
  dns_name: string;
}

export interface TailnetPeers {
  available: boolean;
  error?: string;
  peers: TailnetPeer[];
  checked_at: number;
}

export interface UpdateRelease {
  version: string;
  tag: string;
  published_at?: string;
  notes?: string;
  asset: string;
  base_url: string;
  source: 'github' | 'staged';
}

export interface UpdateResult {
  status: 'ok' | 'rolled_back' | 'failed';
  from: string;
  to: string;
  at: number;
  web: boolean;
  detail?: string;
}

export interface UpdateHold {
  version: string;
  reason: string;
  at: number;
}

export interface UpdateRequest {
  version: string;
  asset: string;
  base_url: string;
  source: string;
  force?: boolean;
  requested_at: number;
  requested_by?: string;
}

export interface UpdateStatus {
  current: { version: string; commit: string; date?: string };
  enabled: boolean;
  repo: string;
  can_apply: boolean;
  checked_at: number;
  available: boolean;
  latest?: UpdateRelease;
  error?: string;
  last?: UpdateResult;
  hold?: UpdateHold;
  queued?: UpdateRequest;
}
