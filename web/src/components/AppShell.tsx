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

function pageLabel(path: string, nodeName?: string): string {
  if (path === '/') return 'Overview';
  if (path === '/nodes') return 'Nodes';
  if (path === '/agents') return 'Agents';
  if (path === '/apps') return 'Apps';
  if (path === '/alerts' || path.startsWith('/alerts/')) return 'Alerts';
  if (path === '/events' || path.startsWith('/events/')) return 'Events';
  if (path.startsWith('/settings')) return 'Settings';
  if (nodeName) return nodeName;
  return 'Node';
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const fleet = useFleet();
  const location = useLocation();
  const nodeId = location.pathname.split('/')[2];
  const node = fleet.data?.nodes.find((view) => view.node.id === nodeId);
  const updated = fleet.data?.updated;

  return (
    <header className="topbar">
      <div className="topbar-context">
        <span className="topbar-scope">hub</span>
        <span className="topbar-sep" aria-hidden="true">
          /
        </span>
        <span className="topbar-title">{pageLabel(location.pathname, node?.node.name)}</span>
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
            <Outlet />
          </main>
        </div>
        <BottomBar />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </Tooltip.Provider>
  );
}
