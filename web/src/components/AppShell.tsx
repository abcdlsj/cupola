import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  HardDrives,
  ListBullets,
  MagnifyingGlass,
  Moon,
  PlayCircle,
  Rows,
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
import { setThemePreference, useResolvedTheme } from '../lib/theme';

/** Group 1 answers "how is the fleet", group 2 answers "what happened". */
const FLEET_NAV = [
  { to: '/', label: 'Systems', icon: HardDrives, match: (path: string) => path === '/' || path.startsWith('/nodes') },
  { to: '/services', label: 'Services', icon: Rows, match: (path: string) => path.startsWith('/services') },
];

const WORK_NAV = [
  { to: '/apps', label: 'Apps', icon: PlayCircle, match: (path: string) => path.startsWith('/apps') },
  { to: '/alerts', label: 'Alerts', icon: Bell, match: (path: string) => path.startsWith('/alerts') },
  { to: '/events', label: 'Events', icon: ListBullets, match: (path: string) => path.startsWith('/events') },
];

function RailItem({
  to,
  label,
  icon: Icon,
  active,
  count,
}: {
  to: string;
  label: string;
  icon: typeof Bell;
  active: boolean;
  count?: number;
}) {
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>
        <Link to={to} className="rail-item" aria-label={label} aria-current={active ? 'page' : undefined}>
          <Icon size={18} aria-hidden="true" weight="regular" />
          {count ? <span className="rail-count">{count}</span> : null}
        </Link>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side="right" sideOffset={10}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>
        <button type="button" className="rail-item" aria-label={label} onClick={onClick}>
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side="right" sideOffset={10}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** The rail: two groups, then the utilities, then the account mark. */
function Rail({ onSearch }: { onSearch: () => void }) {
  const firing = useAlerts('firing');
  const location = useLocation();
  const theme = useResolvedTheme();
  const firingCount = firing.data?.length ?? 0;

  const items = (list: typeof FLEET_NAV) =>
    list.map((item) => (
      <RailItem
        key={item.to}
        to={item.to}
        label={item.label}
        icon={item.icon}
        active={item.match(location.pathname)}
        count={item.to === '/alerts' ? firingCount : undefined}
      />
    ));

  return (
    <nav className="rail" aria-label="Primary">
      <Link to="/" className="rail-mark" aria-label="Cupola home">
        <CupolaMark size={21} />
      </Link>
      <div className="rail-group">{items(FLEET_NAV)}</div>
      <div className="rail-sep" />
      <div className="rail-group">{items(WORK_NAV)}</div>
      <div className="rail-bottom">
        <RailButton label="Search ⌘K" onClick={onSearch}>
          <MagnifyingGlass size={18} aria-hidden="true" />
        </RailButton>
        <RailButton
          label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </RailButton>
        <RailItem
          to="/settings/nodes"
          label="Settings"
          icon={SlidersHorizontal}
          active={location.pathname.startsWith('/settings')}
        />
      </div>
    </nav>
  );
}

/** The phone keeps the mark and the utilities in a 48 px bar. */
function MobileBar({ onSearch }: { onSearch: () => void }) {
  const location = useLocation();
  const theme = useResolvedTheme();
  return (
    <div className="mobilebar">
      <Link to="/" className="rail-mark" aria-label="Cupola home">
        <CupolaMark size={18} />
        <span>cupola</span>
      </Link>
      <button type="button" className="rail-item" aria-label="Search" onClick={onSearch}>
        <MagnifyingGlass size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="rail-item"
        aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      </button>
      <Link
        to="/settings/nodes"
        className="rail-item"
        aria-label="Settings"
        aria-current={location.pathname.startsWith('/settings') ? 'page' : undefined}
      >
        <SlidersHorizontal size={18} aria-hidden="true" />
      </Link>
    </div>
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
        <Rail onSearch={() => setPaletteOpen(true)} />
        <div className="main" ref={mainRef}>
          <MobileBar onSearch={() => setPaletteOpen(true)} />
          <main className="content">
            {fleet.data ? <OfflineBanner lastUpdated={fleet.data.updated} stale={Boolean(fleet.data.stale)} /> : null}
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
          <footer className="foot">
            <span>Cupola</span>
            <span className="foot-sep">·</span>
            <span>raw 48 h, 1 m 30 d, 1 h 13 mo</span>
            <Link to="/settings/about" className="foot-link">
              about
            </Link>
          </footer>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </Tooltip.Provider>
  );
}
