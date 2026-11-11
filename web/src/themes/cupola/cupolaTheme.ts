import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

/**
 * Astryx neutral, re-pointed at Cupola's two themes: near-black ground, 1 px
 * cool border, data-terminal blue, and IBM Plex for UI and figures.
 *
 * Built for production with `npm run theme` (`astryx theme build`); the app
 * imports the generated `cupola.js` + `cupola.css`, never this file, so no
 * style is injected at runtime and no font is fetched from a third party.
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
    // Dense monitoring, one step up from the first pass: 15px body, 14px
    // supporting, 13px meta, 12px axis ticks.
    '--font-size-base': '15px',
    '--font-size-lg': '17px',
    '--font-size-sm': '14px',
    '--font-size-xs': '13px',
    '--font-size-2xs': '12px',
    // A monitoring screen is read in passing, so the text sits one step heavier
    // than a document: body and supporting at 500, labels at 600.
    '--text-body-weight': '500',
    '--text-label-weight': '600',
    '--text-supporting-weight': '400',
    '--text-code-weight': '500',

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
