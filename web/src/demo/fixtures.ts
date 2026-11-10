/**
 * Fake fleet for the Astryx demo. Nothing here talks to a hub: it exists so the
 * pages can be clicked through without a backend.
 */

export type NodeState = 'healthy' | 'degraded' | 'offline';

export interface DemoNode {
  id: string;
  name: string;
  role: string;
  os: string;
  kernel: string;
  state: NodeState;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  load: number;
  cores: number;
  temp: number | null;
  uptime: string;
  mode: 'pull' | 'push';
  address: string;
  agent: string;
}

export const nodes: DemoNode[] = [
  {
    id: 'atlas',
    name: 'atlas',
    role: 'media',
    os: 'Debian 12',
    kernel: '6.1.0-28-amd64',
    state: 'healthy',
    cpu: 12.4,
    memory: 41.8,
    disk: 58.2,
    load: 4.1,
    cores: 8,
    temp: 46,
    uptime: 'up 23 d',
    mode: 'pull',
    address: '10.0.4.11',
    agent: 'v1.4.2',
  },
  {
    id: 'beelink',
    name: 'beelink',
    role: 'edge',
    os: 'Ubuntu 24.04',
    kernel: '6.8.0-49-generic',
    state: 'degraded',
    cpu: 71.3,
    memory: 87.6,
    disk: 93.1,
    load: 31.0,
    cores: 4,
    temp: 72,
    uptime: 'up 6 d',
    mode: 'push',
    address: '203.0.113.24',
    agent: 'v1.4.2',
  },
  {
    id: 'studio',
    name: 'studio',
    role: 'build',
    os: 'Fedora 41',
    kernel: '6.12.4-200.fc41',
    state: 'healthy',
    cpu: 4.9,
    memory: 22.4,
    disk: 34.7,
    load: 2.6,
    cores: 16,
    temp: 38,
    uptime: 'up 2 d',
    mode: 'pull',
    address: '10.0.4.19',
    agent: 'v1.4.1',
  },
  {
    id: 'loft',
    name: 'loft',
    role: 'backup',
    os: 'Alpine 3.21',
    kernel: '6.12.3-0-lts',
    state: 'offline',
    cpu: null,
    memory: null,
    disk: null,
    load: 0,
    cores: 2,
    temp: null,
    uptime: 'no contact for 14 m',
    mode: 'push',
    address: '203.0.113.51',
    agent: 'v1.3.9',
  },
];

export function node(id: string | undefined): DemoNode {
  return nodes.find((entry) => entry.id === id) ?? nodes[0];
}

export interface Unit {
  node: string;
  unit: string;
  state: 'active' | 'failed' | 'inactive';
  since: string;
  description: string;
}

export const units: Unit[] = [
  { node: 'atlas', unit: 'nginx.service', state: 'active', since: '3 d', description: 'A high performance web server' },
  { node: 'atlas', unit: 'postgresql.service', state: 'active', since: '23 d', description: 'PostgreSQL RDBMS' },
  { node: 'atlas', unit: 'plexmediaserver.service', state: 'active', since: '23 d', description: 'Plex Media Server' },
  { node: 'beelink', unit: 'cupola-agent.service', state: 'failed', since: '14 m', description: 'Cupola agent' },
  { node: 'beelink', unit: 'docker.service', state: 'active', since: '6 d', description: 'Docker Application Container Engine' },
  { node: 'studio', unit: 'docker.service', state: 'active', since: '2 d', description: 'Docker Application Container Engine' },
  { node: 'studio', unit: 'buildkit.service', state: 'active', since: '2 d', description: 'BuildKit daemon' },
  { node: 'loft', unit: 'restic-backup.timer', state: 'inactive', since: '14 m', description: 'Nightly restic backup' },
];

export interface Process {
  pid: number;
  name: string;
  user: string;
  cpu: number;
  memory: number;
  threads: number;
  rss: string;
  cmd: string;
}

export const processes: Process[] = [
  { pid: 1284, name: 'node', user: 'nextcloud', cpu: 18.4, memory: 6.2, threads: 42, rss: '980 MiB', cmd: 'node /var/www/nextcloud/index.js' },
  { pid: 942, name: 'postgres', user: 'postgres', cpu: 9.1, memory: 12.8, threads: 61, rss: '2.0 GiB', cmd: 'postgres: checkpointer' },
  { pid: 2210, name: 'plex', user: 'plex', cpu: 6.7, memory: 4.4, threads: 96, rss: '712 MiB', cmd: 'Plex Media Server' },
  { pid: 311, name: 'dockerd', user: 'root', cpu: 2.3, memory: 1.9, threads: 38, rss: '304 MiB', cmd: 'dockerd -H unix:///run/docker.sock' },
  { pid: 77, name: 'kworker/2:1', user: 'root', cpu: 0.9, memory: 0.0, threads: 1, rss: '0 B', cmd: 'kworker/2:1-events' },
];

export interface AgentSession {
  id: string;
  tool: 'claude' | 'codex' | 'pi';
  cwd: string;
  started: string;
  runtime: string;
  status: 'working' | 'idle';
  model: string;
}

export const agents: AgentSession[] = [
  { id: 'ses_8f2a', tool: 'claude', cwd: '/srv/nextcloud', started: '12 m ago', runtime: '42 m', status: 'working', model: 'opus-4.6' },
  { id: 'ses_71b0', tool: 'codex', cwd: '/srv/cupola', started: '1 h ago', runtime: '1 h 04 m', status: 'idle', model: 'gpt-6-codex' },
  { id: 'ses_2c19', tool: 'pi', cwd: '/srv/backup', started: '3 h ago', runtime: '18 m', status: 'idle', model: 'sonnet-4.5' },
];

export interface Container {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'exited' | 'restarting';
  cpu: number | null;
  memory: number | null;
  uptime: string;
  ports: string;
}

export const containers: Container[] = [
  { id: 'd41f2a', name: 'plex', image: 'plexinc/pms-docker:1.41.3', state: 'running', cpu: 12.8, memory: 18.4, uptime: '23 d', ports: '32400/tcp' },
  { id: '9b0c77', name: 'postgres', image: 'postgres:17-alpine', state: 'running', cpu: 4.2, memory: 31.7, uptime: '23 d', ports: '5432/tcp' },
  { id: '5a3e10', name: 'watchtower', image: 'containrrr/watchtower:1.7', state: 'exited', cpu: null, memory: null, uptime: '2 d', ports: '—' },
];

export interface Action {
  id: string;
  label: string;
  node: string;
  type: 'script' | 'wol';
  detail: string;
  lastRun: string;
}

export const actions: Action[] = [
  { id: 'restart-plex', label: 'Restart Plex', node: 'atlas', type: 'script', detail: 'restart-plex.sh · 30 s timeout', lastRun: '2 h ago' },
  { id: 'wake-loft', label: 'Wake loft', node: 'loft', type: 'wol', detail: 'magic packet · en0', lastRun: 'yesterday' },
  { id: 'docker-prune', label: 'Prune images', node: 'studio', type: 'script', detail: 'docker-prune.sh · 60 s timeout', lastRun: '3 d ago' },
  { id: 'vacuum-db', label: 'Vacuum database', node: 'atlas', type: 'script', detail: 'pg-vacuum.sh · 60 s timeout', lastRun: '5 d ago' },
];

export interface EventItem {
  id: number;
  node: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  ago: string;
}

export const events: EventItem[] = [
  { id: 41, node: 'beelink', kind: 'service', severity: 'critical', message: 'Unit failed: cupola-agent.service', ago: '14 m' },
  { id: 40, node: 'beelink', kind: 'disk', severity: 'warning', message: 'Root filesystem at 93 % (18.4 of 19.8 GiB)', ago: '38 m' },
  { id: 39, node: 'loft', kind: 'node', severity: 'warning', message: 'No contact for 14 minutes', ago: '14 m' },
  { id: 38, node: 'atlas', kind: 'process', severity: 'info', message: 'New listening port 44087/udp (Plex Media Server)', ago: '1 h' },
  { id: 37, node: 'studio', kind: 'container', severity: 'info', message: 'Container watchtower exited (0)', ago: '2 h' },
  { id: 36, node: 'atlas', kind: 'action', severity: 'info', message: 'Action restart-plex.sh finished (exit 0)', ago: '2 h' },
];

export interface Rule {
  id: string;
  what: string;
  scope: string;
  when: string;
  channel: string;
  state: 'firing' | 'ok' | 'muted';
}

export const rules: Rule[] = [
  { id: 'r1', what: 'Disk fill prediction', scope: 'all systems', when: 'rootfs < 21 days', channel: 'ntfy · ops', state: 'firing' },
  { id: 'r2', what: 'Memory pressure', scope: 'beelink', when: 'memory > 85 % for 5 m', channel: 'Discord · #alerts', state: 'firing' },
  { id: 'r3', what: 'Unit failed', scope: 'all systems', when: 'any unit enters failed', channel: 'webhook · signed', state: 'ok' },
  { id: 'r4', what: 'Node offline', scope: 'all systems', when: 'no contact for 3 m', channel: 'ntfy · ops', state: 'ok' },
  { id: 'r5', what: 'SMART attribute', scope: 'atlas', when: 'any attribute drops', channel: 'webhook · signed', state: 'muted' },
];

/** One hour of readings, one point per minute, deterministic per seed. */
export function series(seed: number, base: number, swing: number): number[] {
  const out: number[] = [];
  let value = base;
  let state = seed;
  for (let i = 0; i < 60; i += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const noise = (state / 2147483648 - 0.5) * swing;
    value = Math.max(0, Math.min(100, value * 0.85 + (base + noise) * 0.15));
    out.push(Math.round(value * 10) / 10);
  }
  return out;
}

export const timestamps = Array.from({ length: 60 }, (_, i) =>
  Math.floor(Date.now() / 1000) - (59 - i) * 60,
);

export const filesystems = [
  { mount: '/', device: '/dev/nvme0n1p2', fs: 'ext4', used: 58.2, size: '464 GiB', free: '194 GiB' },
  { mount: '/srv/media', device: '/dev/sda1', fs: 'xfs', used: 82.4, size: '3.6 TiB', free: '648 GiB' },
  { mount: '/var/lib/docker', device: '/dev/nvme0n1p3', fs: 'ext4', used: 34.7, size: '180 GiB', free: '118 GiB' },
  { mount: '/boot', device: '/dev/nvme0n1p1', fs: 'vfat', used: 41.1, size: '512 MiB', free: '302 MiB' },
];

export const interfaces = [
  { name: 'eno1', state: 'up', speed: '1 Gb/s', rx: '1.8 MiB/s', tx: '624 KiB/s', address: '10.0.4.11' },
  { name: 'wg0', state: 'up', speed: '—', rx: '96 KiB/s', tx: '44 KiB/s', address: '10.9.0.2' },
  { name: 'docker0', state: 'down', speed: '—', rx: '0 B/s', tx: '0 B/s', address: '172.17.0.1' },
];

export const cores = [
  { core: 'cpu0', busy: 12.1, mhz: 2400 },
  { core: 'cpu1', busy: 18.4, mhz: 2400 },
  { core: 'cpu2', busy: 9.2, mhz: 2200 },
  { core: 'cpu3', busy: 22.6, mhz: 2400 },
  { core: 'cpu4', busy: 11.0, mhz: 2400 },
  { core: 'cpu5', busy: 7.4, mhz: 2200 },
  { core: 'cpu6', busy: 16.8, mhz: 2400 },
  { core: 'cpu7', busy: 9.9, mhz: 2400 },
];
