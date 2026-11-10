import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

/**
 * Astryx neutral, re-pointed at Cupola's two themes: same near-black ground,
 * 1 px cool border, data-terminal blue, and IBM Plex for UI and figures.
 *
 * Every value here has a counterpart in web/src/styles/tokens.css; nothing else
 * in the demo hard-codes a colour.
 */
// taste-skill-ignore mono: Cupola's brand sets every figure, timestamp and ID in
// IBM Plex Mono, which the app rules allow as a style's one decided face.
export const cupolaTheme = defineTheme({
  name: 'cupola',
  extends: neutralTheme,
  tokens: {
    '--font-family-body': "'IBM Plex Sans', system-ui, sans-serif",
    '--font-family-heading': "'IBM Plex Sans', system-ui, sans-serif",
    '--font-family-code': "'IBM Plex Mono', ui-monospace, monospace",
    // Dense monitoring: 14px body, 13px supporting, 12px meta, 11px axis ticks.
    '--font-size-base': '14px',
    '--font-size-lg': '16px',
    '--font-size-sm': '13px',
    '--font-size-xs': '12px',
    '--font-size-2xs': '11px',

    '--color-accent': ['#1b6c80', '#4a8ad6'],
    '--color-text-accent': ['#155b6c', '#8fbcf0'],

    '--color-background-body': ['#f6f7f9', '#0b0c0e'],
    '--color-background-card': ['#ffffff', '#111316'],
    '--color-background-surface': ['#ffffff', '#111316'],
    '--color-border': ['#e2e5e9', '#22252a'],
    '--color-text-primary': ['#14171a', '#f3f4f5'],
    '--color-text-secondary': ['#5b6169', '#9a9ea6'],
  },
  components: {
    // Cupola's meters are a thin bar beside a figure, not a full-width progress row.
    'progress-bar': {
      base: { width: '100%', height: '6px' },
    },
    card: {
      base: { boxShadow: 'none' },
    },
  },
});
