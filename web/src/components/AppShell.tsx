import { useEffect, useRef, useState } from 'react';
import { Bell, HardDrives, ListBullets, MagnifyingGlass, Moon, PlayCircle, Rows, SlidersHorizontal, Sun } from '@phosphor-icons/react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CupolaMark } from './CupolaMark';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { OfflineBanner } from './OfflineBanner';
import { Link } from '../ui/primitives';
import { useAlerts, useFleet, useMe } from '../data/queries';
import { useStream } from '../data/stream';
import { setThemePreference, useResolvedTheme } from '../lib/theme';
import { useDocumentVisible } from '../lib/visibility';
import { useIsPhone } from '../ui/kit';

/** Five destinations: the fleet (systems, services), then the work (apps, alerts, events). */
const NAV = [
  { to: '/', label: 'Systems', icon: HardDrives, match: (path: string) => path === '/' || path.startsWith('/nodes') },
  { to: '/services', label: 'Services', icon: Rows, match: (path: string) => path.startsWith('/services') },
  { to: '/apps', label: 'Apps', icon: PlayCircle, match: (path: string) => path.startsWith('/apps') },
  { to: '/alerts', label: 'Alerts', icon: Bell, match: (path: string) => path.startsWith('/alerts') },
  { to: '/events', label: 'Events', icon: ListBullets, match: (path: string) => path.startsWith('/events') },
];

function Utilities({ onSearch }: { onSearch: () => void }) {
  const theme = useResolvedTheme();
  const navigate = useNavigate();
  return (
    <div className="utils">
      <button type="button" className="icon-btn" aria-label="Search (⌘K)" title="Search (⌘K)" onClick={onSearch}>
        <MagnifyingGlass size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Settings"
        title="Settings"
        onClick={() => navigate('/settings/nodes')}
      >
        <SlidersHorizontal size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Five destinations as icons with a word, inside the safe area at the bottom. */
function TabBar({ firing }: { firing: number }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Primary" className="tabbar">
      <div className="tabbar-inner">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <RouterLink
              key={item.to}
              to={item.to}
              className="tabbar-link"
              aria-current={active ? 'page' : undefined}
            >
              <span className="tabbar-icon">
                <Icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                {item.to === '/alerts' && firing ? <span className="tabbar-count">{firing}</span> : null}
              </span>
              {item.label}
            </RouterLink>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();
  const me = useMe();
  const fleet = useFleet();
  const firing = useAlerts('firing').data?.length ?? 0;
  const phone = useIsPhone();
  const visible = useDocumentVisible();
  const main = useRef<HTMLElement>(null);
  // A background tab drops the stream; the reconnect when it comes back
  // invalidates every live key, so nothing is stale on return.
  useStream(visible && Boolean(me.data?.authenticated));

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
    main.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          {phone ? (
            <nav aria-label="Primary" className="brand-nav">
              <RouterLink className="brand" to="/">
                <CupolaMark size={20} />
                cupola
              </RouterLink>
            </nav>
          ) : (
            <nav aria-label="Primary" className="navlinks">
              <RouterLink className="brand" to="/" style={{ marginRight: 10 }}>
                <CupolaMark size={20} />
                cupola
              </RouterLink>
              {NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <RouterLink
                    key={item.to}
                    to={item.to}
                    className="navlink"
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                    {item.to === '/alerts' && firing ? <span className="navcount">{firing}</span> : null}
                  </RouterLink>
                );
              })}
            </nav>
          )}
          <Utilities onSearch={() => setPaletteOpen(true)} />
        </div>
      </header>

      <div className="shell-main">
        <main ref={main} role="main" className="content">
          <div className="content-inner">
            {fleet.data ? <OfflineBanner lastUpdated={fleet.data.updated} stale={Boolean(fleet.data.stale)} /> : null}
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
        {phone ? null : (
          <footer className="foot">
            <span>Cupola · raw 48 h, 1 m 30 d, 1 h 13 mo</span>
            <span className="foot-sep">·</span>
            <Link href="/settings/about">about</Link>
          </footer>
        )}
      </div>

      {phone ? <TabBar firing={firing} /> : null}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
