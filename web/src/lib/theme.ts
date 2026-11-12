import { useSyncExternalStore } from 'react';

/** What the viewer picked in Settings → Appearance. Light is the default. */
export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'cupola.theme';
const EVENT = 'cupola:theme';
const QUERY = '(prefers-color-scheme: dark)';

function media(): MediaQueryList | null {
  return typeof window === 'undefined' || !window.matchMedia ? null : window.matchMedia(QUERY);
}

export function themePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // storage blocked: the default applies
  }
  // Light is the default: a viewer who never chose gets the light sheet even
  // when the OS prefers dark.
  return 'light';
}

export function resolvedTheme(preference = themePreference()): Theme {
  if (preference !== 'system') return preference;
  return media()?.matches ? 'dark' : 'light';
}

/**
 * Writes the resolved theme to <html data-theme> and keeps the browser chrome
 * in step with the ground. index.html runs the same decision before first
 * paint, so there is no flash.
 */
export function applyTheme(preference = themePreference()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = resolvedTheme(preference);
  root.dataset.theme = theme;
  const ground = getComputedStyle(root).backgroundColor;
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
  return useSyncExternalStore(subscribe, themePreference, () => 'light');
}

/** The theme actually on screen: canvas charts redraw when it changes. */
export function useResolvedTheme(): Theme {
  return useSyncExternalStore(subscribe, () => resolvedTheme(), () => 'light');
}

/**
 * Resolves a CSS colour (including var(--x)) for canvas, which cannot read
 * variables. The probe sits on the body, where the tokens are defined.
 */
export function cssColor(value: string): string {
  if (!value.includes('var(') || typeof document === 'undefined') return value;
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = value;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || value;
}
