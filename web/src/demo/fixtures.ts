/**
 * Fake fleet for the Astryx demo. Names and figures only; nothing here talks to
 * a hub, so the page renders without a backend.
 */

export interface DemoNode {
  id: string;
  name: string;
  role: string;
  os: string;
  state: 'healthy' | 'degraded' | 'offline';
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  load: number;
  cores: number;
  temp: number | null;
  uptime: string;
  mode: 'pull' | 'push';
}

export const nodes: DemoNode[] = [
  {
    id: 'atlas',
    name: 'atlas',
    role: 'media',
    os: 'Debian 12',
    state: 'healthy',
    cpu: 12.4,
    memory: 41.8,
    disk: 58.2,
    load: 4.1,
    cores: 8,
    temp: 46,
    uptime: 'up 23 d',
    mode: 'pull',
  },
  {
    id: 'beelink',
    name: 'beelink',
    role: 'edge',
    os: 'Ubuntu 24.04',
    state: 'degraded',
    cpu: 71.3,
    memory: 87.6,
    disk: 93.1,
    load: 31.0,
    cores: 4,
    temp: 72,
    uptime: 'up 6 d',
    mode: 'push',
  },
  {
    id: 'studio',
    name: 'studio',
    role: 'build',
    os: 'Fedora 41',
    state: 'healthy',
    cpu: 4.9,
    memory: 22.4,
    disk: 34.7,
    load: 2.6,
    cores: 16,
    temp: 38,
    uptime: 'up 2 d',
    mode: 'pull',
  },
  {
    id: 'loft',
    name: 'loft',
    role: 'backup',
    os: 'Alpine 3.21',
    state: 'offline',
    cpu: null,
    memory: null,
    disk: null,
    load: 0,
    cores: 2,
    temp: null,
    uptime: 'no contact for 14 m',
    mode: 'push',
  },
];

export const units = [
  { unit: 'nginx.service', node: 'atlas', state: 'active', since: '3 d' },
  { unit: 'postgresql.service', node: 'atlas', state: 'active', since: '23 d' },
  { unit: 'cupola-agent.service', node: 'beelink', state: 'failed', since: '14 m' },
  { unit: 'docker.service', node: 'studio', state: 'active', since: '2 d' },
] as const;

/** One hour of readings, one point per minute. */
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
