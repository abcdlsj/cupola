import { useEffect, useState } from 'react';
import { Bell, HardDrives, ListBullets, MagnifyingGlass, Moon, PlayCircle, Rows, SlidersHorizontal, Sun } from '@phosphor-icons/react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppShell as Shell } from '@astryxdesign/core/AppShell';
import { Badge } from '@astryxdesign/core/Badge';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav';
import { VStack } from '@astryxdesign/core/VStack';
import { CupolaMark } from './CupolaMark';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { OfflineBanner } from './OfflineBanner';
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
    <HStack gap={1} vAlign="center">
      <IconButton icon={<MagnifyingGlass />} label="Search (⌘K)" tooltip="Search (⌘K)" variant="ghost" size="sm" onClick={onSearch} />
      <IconButton
        icon={theme === 'dark' ? <Sun /> : <Moon />}
        label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        tooltip={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        variant="ghost"
        size="sm"
        onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
      />
      <IconButton
        icon={<SlidersHorizontal />}
        label="Settings"
        tooltip="Settings"
        variant="ghost"
        size="sm"
        onClick={() => navigate('/settings/nodes')}
      />
    </HStack>
  );
}

function Nav({ phone, firing, onSearch }: { phone: boolean; firing: number; onSearch: () => void }) {
  const { pathname } = useLocation();
  return (
    <TopNav
      label="Primary"
      heading={<TopNavHeading heading="cupola" logo={<CupolaMark size={20} />} headingHref="/" />}
      startContent={
        phone
          ? undefined
          : NAV.map((item) => (
              <TopNavItem
                key={item.to}
                label={item.to === '/alerts' && firing ? `Alerts ${firing}` : item.label}
                href={item.to}
                isSelected={item.match(pathname)}
              />
            ))
      }
      endContent={<Utilities onSearch={onSearch} />}
    />
  );
}

/**
 * The phone's bottom bar: the same five destinations as icons with a word,
 * inside the safe area, in the layout's footer region so it sits on the
 * viewport edge while the content scrolls above it.
 */
function TabBar({ firing }: { firing: number }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Primary">
      <HStack hAlign="between" vAlign="center" paddingInline={5} paddingBlock={1}>
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link key={item.to} href={item.to} color={active ? 'accent' : 'secondary'} aria-current={active ? 'page' : undefined}>
              <VStack gap={0.5} hAlign="center" width={64} minHeight={44} vAlign="center">
                <HStack gap={0.5} vAlign="center">
                  <Icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                  {item.to === '/alerts' && firing ? <Badge variant="error" label={String(firing)} /> : null}
                </HStack>
                <Text type="inherit" size="2xs">
                  {item.label}
                </Text>
              </VStack>
            </Link>
          );
        })}
      </HStack>
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
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <Shell
      mobileNav={false}
      contentPadding={0}
      height="fill"
      variant="section"
    >
      <Layout
        height="fill"
        contentWidth={1200}
        padding={0}
        header={
          <LayoutHeader hasDivider padding={0}>
            <Nav phone={phone} firing={firing} onSearch={() => setPaletteOpen(true)} />
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={phone ? 5 : 4}>
            <VStack gap={6} paddingBlock={2}>
              {fleet.data ? <OfflineBanner lastUpdated={fleet.data.updated} stale={Boolean(fleet.data.stale)} /> : null}
              <ErrorBoundary key={pathname}>
                <Outlet />
              </ErrorBoundary>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            {phone ? (
              <TabBar firing={firing} />
            ) : (
              <Text type="supporting">
                Cupola · raw 48 h, 1 m 30 d, 1 h 13 mo · <Link href="/settings/about">about</Link>
              </Text>
            )}
          </LayoutFooter>
        }
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </Shell>
  );
}
