import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  HardDrives,
  ListBullets,
  MagnifyingGlass,
  Moon,
  PlayCircle,
  Robot,
  SlidersHorizontal,
  Sun,
} from '@phosphor-icons/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { CupolaMark } from './CupolaMark';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { OfflineBanner } from './OfflineBanner';
import { useAlerts, useFleet, useMe } from '../data/queries';
import { useStream } from '../data/stream';
import { clockSeconds } from '../lib/format';
import { setThemePreference, useResolvedTheme } from '../lib/theme';

const NAV = [
  { to: '/', label: 'Systems', icon: HardDrives, match: (path: string) => path === '/' || path.startsWith('/nodes') },
  { to: '/agents', label: 'Agents', icon: Robot, match: (path: string) => path.startsWith('/agents') },
  { to: '/apps', label: 'Apps', icon: PlayCircle, match: (path: string) => path.startsWith('/apps') },
  { to: '/alerts', label: 'Alerts', icon: Bell, match: (path: string) => path.startsWith('/alerts') },
  { to: '/events', label: 'Events', icon: ListBullets, match: (path: string) => path.startsWith('/events') },
];

const BOTTOM = ['/', '/agents', '/apps', '/alerts'];

function IconButton({ label, onClick, to, active, children }: { label: string; onClick?: () => void; to?: string; active?: boolean; children: React.ReactNode }) {
  const trigger = to ? (
    <Link to={to} className="icon-btn" aria-label={label} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  ) : (
    <button type="button" className="icon-btn" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
  return (
    <Tooltip.Root delayDuration={260}>
      <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side="bottom" sideOffset={8}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * One header row: the mark, the five destinations as words, then search, the
 * freshness stamp, the theme switch and settings. The page's own card names
 * the object, so the header never repeats it.
 */
function Header({ onSearch }: { onSearch: () => void }) {
  const fleet = useFleet();
  const firing = useAlerts('firing');
  const location = useLocation();
  const theme = useResolvedTheme();
  const updated = fleet.data?.updated;
  const firingCount = firing.data?.length ?? 0;

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="brand" aria-label="Cupola home">
          <CupolaMark size={20} />
          <span className="brand-word">cupola</span>
        </Link>
        <nav className="header-nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className="header-link" aria-current={item.match(location.pathname) ? 'page' : undefined}>
              {item.label}
              {item.to === '/alerts' && firingCount > 0 ? (
                <span className="header-count" aria-label={`${firingCount} firing`}>
                  {firingCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="header-right">
          <span className="freshness">{updated ? `Updated ${clockSeconds(updated)} UTC` : 'Waiting for data'}</span>
          <button type="button" className="search-btn" onClick={onSearch} aria-label="Search systems and screens">
            <MagnifyingGlass size={15} aria-hidden="true" />
            <span className="search-label">Search</span>
            <kbd className="kbd">⌘K</kbd>
          </button>
          <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </IconButton>
          <IconButton label="Settings" to="/settings/nodes" active={location.pathname.startsWith('/settings')}>
            <SlidersHorizontal size={16} aria-hidden="true" />
          </IconButton>
        </div>
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
            <Icon size={20} aria-hidden="true" weight={active ? 'fill' : 'regular'} />
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
    <Tooltip.Provider delayDuration={260}>
      <div className="shell">
        <div className="main" ref={mainRef}>
          <Header onSearch={() => setPaletteOpen(true)} />
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
