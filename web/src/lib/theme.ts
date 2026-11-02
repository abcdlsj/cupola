import { useSyncExternalStore } from 'react';

/** What the viewer picked in Settings → Appearance. */
export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'cupola.theme';
const EVENT = 'cupola:theme';
const QUERY = '(prefers-color-scheme: light)';

function media(): MediaQueryList | null {
  return typeof window === 'undefined' || !window.matchMedia ? null : window.matchMedia(QUERY);
}

export function themePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // storage blocked: fall back to the system theme
  }
  return 'system';
}

export function resolvedTheme(preference = themePreference()): Theme {
  if (preference !== 'system') return preference;
  return media()?.matches ? 'light' : 'dark';
}

/** Writes the choice to <html> so tokens.css can switch, and keeps the browser chrome in step. */
export function applyTheme(preference = themePreference()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
  const ground = getComputedStyle(root).getPropertyValue('--ground').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && ground) meta.setAttribute('content', ground);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    // the choice still applies for this visit
  }
  applyTheme(preference);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const list = media();
  const onSystem = () => {
    applyTheme();
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onSystem);
  list?.addEventListener('change', onSystem);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onSystem);
    list?.removeEventListener('change', onSystem);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, themePreference, () => 'system');
}

/** The theme actually on screen: canvas charts redraw when it changes. */
export function useResolvedTheme(): Theme {
  return useSyncExternalStore(subscribe, () => resolvedTheme(), () => 'dark');
}

/** Resolves a CSS colour (including var(--x)) for canvas, which cannot read variables. */
export function cssColor(value: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!match || typeof document === 'undefined') return value;
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || value;
}
