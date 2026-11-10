# Astryx migration

Evaluation branch: `feat/astryx-demo`. Astryx is Meta's open-source React 19 design
system (`@astryxdesign/core`, MIT, v0.7.11, beta) built on StyleX. Published
components ship pre-compiled CSS, so consuming them needs no StyleX compiler;
authoring new StyleX styles or swizzling does.

What exists on this branch:

```bash
cd web
npm run dev            # then open http://localhost:5173/demo.html
```

- `web/demo.html` + `web/src/demo/*` — an isolated second Vite entry with a fake
  fleet (`atlas`, `beelink`, `studio`, `loft`). No hub, no auth, no API.
- `web/src/demo/theme.ts` — `defineTheme({extends: neutralTheme})` re-pointed at
  Cupola's two themes (ground, card, border, ink, accent, IBM Plex) plus two
  component overrides (thin meter, no card shadow).
- The demo never leaks into the app: `dist/assets/main-*.js` contains zero
  Astryx code, and the whole app suite still passes.

## Mapping

| Cupola today | Astryx | Verdict |
| --- | --- | --- |
| `styles/tokens.css` (193 lines) | `defineTheme` tokens, prebuilt with `npx astryx theme build` | **Rewrite.** Token names change (`--ground` → `--color-background-body`, `--line` → `--color-border`, `--series-1` → `--color-data-categorical-*`). Everything that reads a token must be re-pointed. |
| `styles/app.css` (4 319 lines) | component props, `xstyle`, Tailwind utilities over `@astryxdesign/core/tailwind-theme.css` | **Rewrite or delete.** Most of the file is card, table, rail, meter and tooltip CSS that Astryx already owns. |
| `Meter.tsx` + `.meter*` CSS | `ProgressBar` + `components['progress-bar'].base` override (96 × 6 px in the demo) | **Rewrite as a wrapper.** Keep `meterLevel()` thresholds (75 / 90) and the `—` empty state; the bar itself is Astryx. |
| `StatusPill.tsx`, `syscard-dot` | `StatusDot` (`success`/`warning`/`error`/`neutral`, label, tooltip) | **Replace directly.** |
| `DataTable.tsx`, `UnitTable.tsx`, `Pager.tsx` | `Table` (+ its pagination/sorting plugins) | **Rewrite.** Column widths become `proportional()`/`pixel()`; sorting and paging move to plugins. |
| `AppShell.tsx` rail (56 px, icon-only, grouped, bottom bar on phone) | `AppShell` + `SideNav`/`SideNavItem`/`SideNavSection` + `SideNavHeading` | **Rewrite, and the design changes.** Astryx's sidebar is a labelled panel that collapses into a drawer; there is no icon rail and no bottom bar. The drawer replaces `MobileBar` below 900 px. |
| Radix `Dialog`, `Tooltip` | `Dialog`, `Tooltip` | **Replace, then drop both Radix packages.** |
| `CommandPalette.tsx` | Dialog + `Command`-style list; no dedicated palette component | **Rewrite** on Dialog + filtered `List`. |
| `SeriesChart.tsx` + uPlot | unchanged uPlot; colours resolved from `useTheme().token()` | **Keep, re-wire colours.** Astryx ships no time-series chart; its own templates assume Recharts. uPlot stays. |
| `lib/theme.ts`, `public/theme-init.js`, `data-theme` | `Theme mode` prop + `localStorage` key | **Replace.** `Theme` owns `light`/`dark`/`system`; the pre-paint script only needs to persist the choice. `<meta name="theme-color">` has to be updated from a resolved token. |
| IBM Plex via `@fontsource` and `public/fonts` | `--font-family-body/-heading/-code` | **Keep the files, override the tokens.** |
| PWA (`vite-plugin-pwa`) | unchanged | **Keep.** The manifest and service worker are design-system agnostic; a second HTML entry already builds (§ demo). |

Out of scope on this branch and therefore untouched: every `features/*` page,
`alerts`, `apps`, `settings`, `auth`, `events`, the events list folding, and all
Go code.

## Gaps found while building the demo

1. **No table-to-row collapse.** `Table` does not reflow at a phone width: at
   390 px the system names truncate to `atl/as` and the three meters squeeze into
   one column. The demo renders a separate `NodeRows()` below 899 px. Every list
   in Cupola therefore needs two renderings, as it does today — the difference is
   that today it is CSS, and here it is a second component tree.
2. **No bottom bar.** `AppShell`'s mobile mode is a hamburger drawer. `DESIGN.md`
   specifies a five-icon bottom bar inside the safe area; that shell has to
   either be kept custom or the spec has to change.
3. **No thin meter.** `ProgressBar` is a full-width progress row. Getting Cupola's
   6 px bar means a `defineTheme` component override (demonstrated) or a wrapper.
4. **`fonts.css` pulls Google Fonts.** `@astryxdesign/theme-neutral/fonts.css`
   `@import`s Figtree from `fonts.googleapis.com`. Importing the generated
   `astryx-themes.ts` module (the documented wiring) would add a third-party
   runtime asset, which `AGENTS.md` forbids. Import the theme's `/built` entry and
   override the font tokens instead — that is what the demo does, and it makes
   zero third-party requests.
5. **Runtime style injection.** A `defineTheme` value is injected at runtime and
   logs a warning. Production needs `npx astryx theme build` plus a prebuilt
   `theme.css` import.
6. **No breakpoint hook.** Responsive decisions need `matchMedia` by hand, or
   Astryx's StyleX build step for `xstyle` media queries — which reintroduces the
   StyleX compiler into the Vite config.
7. **Bundle cost.** The demo entry is 714 kB raw / 231 kB gzip plus 261 kB of
   Astryx CSS. The app entry stays 380 kB, but a full swap moves that weight into
   the main bundle unless the components are split per route.
8. **Small-type controls truncate.** `SegmentedControl` shows `L…` / `D…` at
   390 px next to a heading; it has to stack or go icon-only on phones.

## What a full swap costs

Ordered, with the demo as the proven part:

1. **Theme bridge** (½ day — done here): prebuilt theme, token map, font override.
2. **Shell** (1–2 days): `AppShell` + `SideNav`, drawer vs bottom-bar decision,
   command palette on `Dialog`, alerts count on `SideNavItem`.
3. **Primitives** (1 day): `Meter`, `StatusDot`, `Panel`, `Fig`, `Kv`, `Pager`,
   `States`, `Skeletons`.
4. **Tables** (1–2 days): `DataTable`/`UnitTable` on Astryx `Table` with sorting
   and pagination plugins, plus the per-list phone rendering.
5. **Pages** (3–4 days): systems, per-node tabs, events, alerts, apps, settings,
   login — 35 files that carry `className`.
6. **Charts** (1 day): uPlot colour plumbing through `useTheme`, theme-change
   redraw, axis typography.
7. **Verification** (1–2 days): `go test`/`go vet` unaffected, but the design gate
   must be redone — taste-skill lint + inspect at 1440/768/390, iPhone WebKit,
   Pixel Chromium, iPad, keyboard, WCAG AA — and `DESIGN.md` amended wherever the
   shell or table spec changed.

Total: **8–12 working days**, versus the 3–5 estimated before the experiment. The
extra comes from gaps 1–3: Astryx has no bottom bar, no thin meter and no
collapsing table, so those three Cupola specs survive as custom code anyway.

## Decision needed

`docs/DESIGN.md` is the source of truth and specifies the icon rail, the phone
bottom bar and the collapsing table. Adopting Astryx means editing that document
first, then re-running the gate. If the design has to stay exactly as specified,
the swap buys the primitives (Dialog, Tooltip, StatusDot, Table, Badge) and not
the shell — a partial adoption that drops Radix is about a day and carries no
design change.
