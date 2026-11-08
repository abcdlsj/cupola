import type { Icon } from '@phosphor-icons/react';
import {
  Archive,
  ArrowClockwise,
  ArrowsClockwise,
  ArrowsLeftRight,
  Broom,
  CloudArrowUp,
  Cube,
  Database,
  Gear,
  HardDrives,
  Heartbeat,
  Lightning,
  ListBullets,
  PlayCircle,
  Power,
  Pulse,
  Rocket,
  ShieldCheck,
  Terminal,
  Wrench,
} from '@phosphor-icons/react';
import type { Action } from '../data/types';

/**
 * An action's mark. Agents declare an `icon` key; the operator may point
 * `custom_icon` at a raster file instead. When neither says anything useful the
 * name is matched against the same table, and a hash of the id picks from the
 * fallback pool — deterministic, so one action never changes its mark between
 * two paints.
 */
const BY_KEY: Record<string, Icon> = {
  wake: Power,
  power: Power,
  sleep: Power,
  reboot: ArrowClockwise,
  restart: ArrowClockwise,
  reload: ArrowsClockwise,
  update: ArrowsClockwise,
  upgrade: ArrowsClockwise,
  backup: Archive,
  archive: Archive,
  restore: Archive,
  database: Database,
  disk: HardDrives,
  storage: HardDrives,
  sync: ArrowsLeftRight,
  mirror: ArrowsLeftRight,
  upload: CloudArrowUp,
  cloud: CloudArrowUp,
  deploy: Rocket,
  release: Rocket,
  clean: Broom,
  prune: Broom,
  logs: ListBullets,
  log: ListBullets,
  network: Pulse,
  net: Pulse,
  health: Heartbeat,
  status: Heartbeat,
  script: Terminal,
  shell: Terminal,
  container: Cube,
  docker: Cube,
  security: ShieldCheck,
  cert: ShieldCheck,
};

/** Words in the name or description that suggest a mark, in priority order. */
const BY_WORD: Array<[RegExp, Icon]> = [
  [/\b(wake|wol|power on)\b/i, Power],
  [/\b(restart|reboot|reload|cycle)\b/i, ArrowClockwise],
  [/\b(update|upgrade|patch)\b/i, ArrowsClockwise],
  [/\b(backup|archive|snapshot)\b/i, Archive],
  [/\b(restore|rollback)\b/i, Archive],
  [/\b(sync|mirror|copy|photos)\b/i, ArrowsLeftRight],
  [/\b(upload|push)\b/i, CloudArrowUp],
  [/\b(deploy|release)\b/i, Rocket],
  [/\b(clean|prune|vacuum)\b/i, Broom],
  [/\b(log|journal|tail)\b/i, ListBullets],
  [/\b(network|relay|dns|vpn|proxy)\b/i, Pulse],
  [/\b(health|probe|check)\b/i, Heartbeat],
  [/\b(database|postgres|mysql|sqlite)\b/i, Database],
  [/\b(disk|storage|volume|nas)\b/i, HardDrives],
  [/\b(container|docker|podman|image)\b/i, Cube],
  [/\b(cert|tls|secret|key)\b/i, ShieldCheck],
];

const POOL: Icon[] = [Lightning, Gear, Wrench, PlayCircle, Cube, Terminal, ShieldCheck, Rocket, Broom, Pulse];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type ActionMark =
  | { kind: 'image'; src: string }
  | { kind: 'symbol'; Icon: Icon };

export function actionMark(action: Pick<Action, 'id' | 'name' | 'description' | 'icon' | 'custom_icon'>): ActionMark {
  // a raster the operator supplied wins over everything
  const custom = action.custom_icon?.trim();
  if (custom) return { kind: 'image', src: custom };
  // an `icon` that looks like a path or URL is an image, not a key
  const icon = action.icon?.trim() ?? '';
  if (/^(https?:)?\//.test(icon) || /\.(png|webp|jpe?g|avif)$/i.test(icon)) {
    return { kind: 'image', src: icon };
  }
  if (icon && BY_KEY[icon.toLowerCase()]) {
    return { kind: 'symbol', Icon: BY_KEY[icon.toLowerCase()] };
  }
  for (const [pattern, Icon] of BY_WORD) {
    if (pattern.test(action.name) || pattern.test(action.description)) {
      return { kind: 'symbol', Icon };
    }
  }
  return { kind: 'symbol', Icon: POOL[hash(action.id) % POOL.length] };
}
