import { useEffect, useRef, useState } from 'react';
import {
  ArrowClockwise,
  Bell,
  HardDrives,
  ListBullets,
  MagnifyingGlass,
  PlayCircle,
  Robot,
  SlidersHorizontal,
  SquaresFour,
} from '@phosphor-icons/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { CupolaMark } from './CupolaMark';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { OfflineBanner } from './OfflineBanner';
import { useFleet, useMe } from '../data/queries';
import { useStream } from '../data/stream';
import { clockSeconds } from '../lib/format';

const NAV = [
  { to: '/', label: 'Overview', icon: SquaresFour, match: (path: string) => path === '/' },
  { to: '/nodes', label: 'Nodes', icon: HardDrives, match: (path: string) => path.startsWith('/nodes') },
  { to: '/agents', label: 'Agents', icon: Robot, match: (path: string) => path.startsWith('/agents') },
  { to: '/apps', label: 'Apps', icon: PlayCircle, match: (path: string) => path.startsWith('/apps') },
  { to: '/alerts', label: 'Alerts', icon: Bell, match: (path: string) => path.startsWith('/alerts') },
  { to: '/events', label: 'Events', icon: ListBullets, match: (path: string) => path.startsWith('/events') },
];

const BOTTOM = ['/', '/nodes', '/agents', '/alerts'];

function RailLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: typeof SquaresFour; active: boolean }) {
  return (
    <Tooltip.Root delayDuration={220}>
      <Tooltip.Trigger asChild>
        <Link to={to} className="rail-link" aria-label={label} aria-current={active ? 'page' : undefined}>
          <Icon size={18} aria-hidden="true" />
        </Link>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side="right" sideOffset={10}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const NODE_TABS: Record<string, string> = {
  cpu: 'CPU',
  memory: 'Memory',
  storage: 'Storage',
  network: 'Network',
  processes: 'Processes',
  agents: 'Agents',
  services: 'Services',
  containers: 'Containers',
  apps: 'Apps',
  events: 'Events',
};

/**
 * The top bar locates the view; the page's own title names the object. It never
 * repeats the heading below it, so a node page says "Cupola / Nodes / CPU" and
 * the heading carries the node name once.
 */
function trail(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'nodes' && parts[1]) {
    const tab = NODE_TABS[parts[2] ?? ''];
    return tab ? ['Nodes', tab] : ['Nodes'];
  }
  if (parts[0] === 'events' && parts[1]) return ['Events'];
  if (parts[0] === 'alerts' && parts[1] === 'rules') return ['Alerts'];
  if (parts[0] === 'settings' && parts[1]) return ['Settings'];
  return [];
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const fleet = useFleet();
  const location = useLocation();
  const updated = fleet.data?.updated;
  const crumbs = trail(location.pathname);

  return (
    <header className="topbar">
      <div className="topbar-context">
        <Link to="/" className="topbar-scope">
          Cupola
        </Link>
        {crumbs.map((crumb) => (
          <span className="topbar-crumb" key={crumb}>
            <span className="topbar-sep" aria-hidden="true">
              /
            </span>
            {crumb}
          </span>
        ))}
      </div>
      <div className="topbar-right">
        <button type="button" className="search-btn" onClick={onSearch} aria-label="Search nodes and screens">
          <MagnifyingGlass size={15} aria-hidden="true" />
          <span>Search</span>
          <kbd className="kbd">⌘K</kbd>
        </button>
        <span className="freshness">{updated ? `Updated ${clockSeconds(updated)} UTC` : 'Waiting for data'}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => void fleet.refetch()}
          aria-label="Refresh"
          title="Refresh"
        >
          <ArrowClockwise size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function BottomBar() {
  const location = useLocation();
  return (
    <nav className="bottom-bar" aria-label="Primary">
      {NAV.filter((item) => BOTTOM.includes(item.to)).map((item) => {
        const Icon = item.icon;
        const active = item.match(location.pathname);
        return (
          <Link key={item.to} to={item.to} className="bottom-link" aria-current={active ? 'page' : undefined}>
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const me = useMe();
  const fleet = useFleet();
  const mainRef = useRef<HTMLDivElement>(null);
  useStream(Boolean(me.data?.authenticated));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <Tooltip.Provider delayDuration={220}>
      <div className="shell">
        <nav className="rail" aria-label="Primary">
          <Link to="/" className="rail-mark" aria-label="Cupola home">
            <CupolaMark size={20} />
          </Link>
          <div className="rail-nav">
            {NAV.map((item) => (
              <RailLink key={item.to} to={item.to} label={item.label} icon={item.icon} active={item.match(location.pathname)} />
            ))}
          </div>
          <div className="rail-sep" aria-hidden="true" />
          <div className="rail-bottom">
            <RailLink
              to="/settings/nodes"
              label="Settings"
              icon={SlidersHorizontal}
              active={location.pathname.startsWith('/settings')}
            />
            <span className="rail-stamp" aria-hidden="true">
              v1
            </span>
          </div>
        </nav>
        <div className="main" ref={mainRef}>
          <TopBar onSearch={() => setPaletteOpen(true)} />
          <main className="content">
            {fleet.data ? <OfflineBanner lastUpdated={fleet.data.updated} stale={Boolean(fleet.data.stale)} /> : null}
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
        <BottomBar />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </Tooltip.Provider>
  );
}
