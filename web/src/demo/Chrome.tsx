import { useEffect, useState, type ReactNode } from 'react';
import * as Icon from '@phosphor-icons/react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { IconButton } from '@astryxdesign/core/IconButton';
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav';
import { Text } from '@astryxdesign/core/Text';
import { Theme } from '@astryxdesign/core/theme';
import { VStack } from '@astryxdesign/core/VStack';
import { CupolaMark } from '../components/CupolaMark';
import { cupolaTheme } from './theme';

export type Mode = 'light' | 'dark';

const KEY = 'cupola.astryx.mode';

/** The demo routes through the hash so every page has a real, shareable URL. */
export function useHashPath(): string {
  const [path, setPath] = useState(() => location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const onChange = () => setPath(location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export function useMode(): [Mode, (next: Mode) => void] {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // storage blocked: keep the default
    }
    return 'dark';
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // the choice still applies for this visit
    }
  }, [mode]);
  return [mode, setMode];
}

/** Astryx has no breakpoint hook; the shell's phone range starts at 900 px. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches,
  );
  useEffect(() => {
    const list = window.matchMedia('(max-width: 899px)');
    const onChange = () => setPhone(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return phone;
}

const NAV = [
  { href: '#/', label: 'Systems', match: (path: string) => path === '/' || path.startsWith('/nodes') },
  { href: '#/services', label: 'Services', match: (path: string) => path.startsWith('/services') },
  { href: '#/apps', label: 'Apps', match: (path: string) => path.startsWith('/apps') },
  { href: '#/alerts', label: 'Alerts', match: (path: string) => path.startsWith('/alerts') },
  { href: '#/events', label: 'Events', match: (path: string) => path.startsWith('/events') },
];

function Nav({ mode, onMode }: { mode: Mode; onMode: (next: Mode) => void }) {
  const path = useHashPath();
  return (
    <TopNav
      heading={
        <TopNavHeading
          heading="cupola"
          logo={<CupolaMark size={20} />}
          headingHref="#/"
          subheading="4 systems · 2 need attention"
          subheadingHref="#/"
        />
      }
      startContent={NAV.map((item) => (
        <TopNavItem key={item.href} label={item.label} href={item.href} isSelected={item.match(path)} />
      ))}
      endContent={
        <>
          <IconButton icon={<Icon.MagnifyingGlass />} label="Search (⌘K)" variant="ghost" size="sm" />
          <IconButton
            icon={mode === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
            label={mode === 'dark' ? 'Switch to light' : 'Switch to dark'}
            variant="ghost"
            size="sm"
            onClick={() => onMode(mode === 'dark' ? 'light' : 'dark')}
          />
          <IconButton
            icon={<Icon.Wrench />}
            label="Settings"
            variant="ghost"
            size="sm"
            onClick={() => {
              location.hash = '#/settings/nodes';
            }}
          />
        </>
      }
    />
  );
}

export function Chrome({
  children,
  mode,
  onMode,
}: {
  children: ReactNode;
  mode: Mode;
  onMode: (next: Mode) => void;
}) {
  return (
    <Theme theme={cupolaTheme} mode={mode}>
      <AppShell
        topNav={<Nav mode={mode} onMode={onMode} />}
        contentPadding={4}
        height="auto"
        variant="section"
      >
        <VStack gap={4}>
          {children}
          <VStack gap={1} paddingBlock={2}>
            <Text type="supporting">
              Cupola · Astryx demo · raw 48 h, 1 m 30 d, 1 h 13 mo ·{' '}
              <a href="#/settings/about">about</a>
            </Text>
          </VStack>
        </VStack>
      </AppShell>
    </Theme>
  );
}
