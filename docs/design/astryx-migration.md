# Astryx migration

Evaluation branch: `feat/astryx-demo`. Astryx is Meta's open-source React 19 design
system (`@astryxdesign/core`, MIT, v0.7.11, beta) built on StyleX. Published
components ship pre-compiled CSS, so consuming them needs no StyleX compiler;
authoring new StyleX styles or swizzling does.

The demo is **local only**. It is never part of the shipped build:

```bash
cd web
npm run dev                     # then open http://localhost:5173/demo.html
VITE_DEMO=1 npm run build       # build it on purpose
```

A plain `npm run build` ships the app alone, and the PWA precache never contains
the demo assets. (Checked on the live hub: `/opt/cupola/web` has no `demo.html`
and no `assets/demo-*`.)

What exists on this branch:

- `web/demo.html` + `web/src/demo/*` — an isolated second Vite entry with a fake
  fleet (`atlas`, `beelink`, `studio`, `loft`). No hub, no auth, no API. Every
  page of v1 is there, on hash routes you can paste back:

  ```
  #/                              systems table, four chart cards, units strip
  #/nodes/beelink                 overview: KPI row, charts, units, events
  #/nodes/atlas/{cpu,memory,storage,network,processes,services,containers,apps,events}
  #/services  #/apps  #/alerts  #/events
  #/settings/{nodes,alerts,tokens,retention,appearance,about}
  ```
- `web/src/demo/theme.ts` — `defineTheme({extends: neutralTheme})` re-pointed at
  Cupola's two themes (ground, card, border, ink, accent, IBM Plex) plus two
  component overrides (thin meter, no card shadow).
- The demo never leaks into the app: `dist/assets/main-*.js` contains zero
  Astryx code, and the whole app suite still passes.

## Redesign, not a port

The first pass rebuilt Cupola's existing layout in Astryx components, which was
the wrong exercise: it kept the old shell and the old "one card per thing"
composition. The demo now follows Astryx's own dashboard idiom (`Layout` bands,
`VStack gap={6}`, `Divider` between bands, `Heading level={3}` inside cards) and
changes the page shapes with it:

- **Home is a triage page, not a table with charts under it.** KPI tiles state
  the four numbers an operator checks first (online, strained, failed units,
  tightest disk), then *Needs attention* lists each finding as one row with its
  meter, then two fleet-level charts, then the systems roster sorted worst disk
  first, then units failed-first.
- **A node is a header plus tabs plus bands.** Identity and controls sit in the
  page header (back link, state dot, transport, range control), the KPI strip is
  directly under it, and each tab is a band of charts, cards or rows — no nested
  card-in-card panels.
- **Per-core CPU, filesystems, interfaces and memory breakdown became tiles and
  rows**, not five-column tables: a bar with a label reads faster than a grid.
- **Processes gained an inspect panel** on a visible *Inspect* button, because a
  table row is not a place to hide a detail view.
- **Alerts lead with four KPI tiles and one card per firing rule** instead of a
  table of rules; the rules table stays for the long tail.
- **The agents tab is gone.** `058d014 feat!: drop AI agent sessions` removed the
  roster from the product; the demo had carried it over from the old nav.

## Second round of review

- **The home page lists nodes and nothing else.** Every per-node fact (strained
  memory, tightest filesystem, recent events) lives behind the node's own page, so
  the fleet view is one roster plus two fleet charts. The attention band and the
  units band were removed.
- **Charts have a hover readout.** uPlot's cursor hook drives a themed tooltip —
  timestamp, then one line per series with a hue dot, the label and the value with
  its unit — instead of a legend.
- **The footer is a layout region.** AppShell now runs `height="fill"` and the page
  composes `Layout` with a `LayoutFooter`, so the retention line sits on the
  viewport edge instead of the end of the content.
- **Stacked text shares an edge.** A KPI's status dot moved to the trailing edge of
  its label row: previously it indented the label, so the label and the figure
  below it started at different x positions.
- **Nothing that v1 does not have.** Removed from the demo: Ping, Silence 1 h,
  Delivered/Last delivery, action History, Vacuum, App's compact-table and
  reduce-motion switches (not hub settings), the "Other systems" band, and every
  explanatory line with no data behind it.

## Taste-skill gate (app-screen rules)

Run on the production build (`vite build`, `vite preview`), brand palette and type
kept, so no style was dealt and no direction was redrawn:

```bash
node <skill>/scripts/lint.mjs --app web/src/demo
node <skill>/scripts/inspect.mjs --app http://localhost:4180/demo.html#/<route>
```

| Route | Result |
| --- | --- |
| `#/`, `#/nodes/beelink`, `#/nodes/loft`, `#/services`, `#/apps`, `#/alerts`, `#/events`, `#/nodes/atlas/processes` | 0 FAIL, 0 WARN |
| `#/settings/appearance` | 0 FAIL, 1 WARN (`hero-void`, defended below) |

What the gate changed:

- **Density, three settings moved together.** Type scale down to a monitoring
  set (14 body / 13 supporting / 12 meta / 11 axis), table rows to the medium
  density, and the page rhythm to `gap={6}`. At 768 px 53 % of the text had been
  under 13 px; it is now 0.
- **KPIs are one divided strip, not a card each.** Five cells, hairlines between,
  label above the value at 24 px, units as a small grey suffix, the status dot on
  the label's trailing edge so the label and the figure share a left edge.
- **Four fleet charts became four small multiples** (one series each, 200 px
  tall) instead of two stretched two-series plots.
- **Tables**: numbers right-aligned with `align: 'end'`; the identity column is
  the widest; a command-line column fills what a five-column process table left
  empty; the rules and events tables replaced their dead middle with real
  columns.
- **States**: missing values print a grey dash, an offline node's charts keep
  their frame with one sentence, a filter with no match shows `EmptyState`, an
  unknown node route is a not-found page, and every figure is tabular
  (`web/src/demo/demo.css`).
- **Events gained a "by kind" strip** (count per kind, newest age) so the feed
  does not open on a mostly empty screen.

Defended WARN: `settings/appearance` leaves the bottom 300 px of a 900 px screen
empty. Four controls cannot fill it, and the layout's pinned footer closes the
space; there is no honest block to add without inventing a setting.

Lint WARNs kept on purpose: `mono` (Cupola's brand sets every figure in Plex
Mono, which the app rules allow as a style's decided face), `em-dash` (the em
dash is the missing-value mark the rules require), `numbering` (zero-padded
clock minutes in the chart axis).

## Mapping

| Cupola today | Astryx | Verdict |
| --- | --- | --- |
| `styles/tokens.css` (193 lines) | `defineTheme` tokens, prebuilt with `npx astryx theme build` | **Rewrite.** Token names change (`--ground` → `--color-background-body`, `--line` → `--color-border`, `--series-1` → `--color-data-categorical-*`). Everything that reads a token must be re-pointed. |
| `styles/app.css` (4 319 lines) | component props, `xstyle`, Tailwind utilities over `@astryxdesign/core/tailwind-theme.css` | **Rewrite or delete.** Most of the file is card, table, rail, meter and tooltip CSS that Astryx already owns. |
| `Meter.tsx` + `.meter*` CSS | `ProgressBar` + `components['progress-bar'].base` override (96 × 6 px in the demo) | **Rewrite as a wrapper.** Keep `meterLevel()` thresholds (75 / 90) and the `—` empty state; the bar itself is Astryx. |
| `StatusPill.tsx`, `syscard-dot` | `StatusDot` (`success`/`warning`/`error`/`neutral`, label, tooltip) | **Replace directly.** |
| `DataTable.tsx`, `UnitTable.tsx`, `Pager.tsx` | `Table` (+ its pagination/sorting plugins) | **Rewrite.** Column widths become `proportional()`/`pixel()`; sorting and paging move to plugins. |
| `AppShell.tsx` rail (56 px, icon-only, grouped, bottom bar on phone) | `AppShell` + `TopNav`/`TopNavItem`/`TopNavHeading` | **Rewrite, and the design changes.** SideNav was tried first and dropped: for five fleet destinations a horizontal bar spends no width on navigation and leaves the full 1440 for the systems table. TopNav folds into a focus-trapped drawer below 900 px (verified by click). Settings navigation becomes a `TabList` inside the Settings page rather than a rail section. |
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
   one column. The demo renders a separate table-free block below 899 px. Every
   list in Cupola therefore needs two renderings, as it does today — the difference
   is that today it is CSS, and here it is a second component tree.
2. **Children mode has no column widths.** `Table`'s header/row/cell API has no
   `width`, so a five-column table spreads its cells across 1 400 px (first
   attempt at the processes page). Data-driven `columns` with `pixel()` and
   `proportional()` is mandatory for dense tables, which means every Cupola table
   moves from JSX rows to a column array plus `renderCell`.
3. **No bottom bar.** `AppShell`'s phone mode is a hamburger drawer. `DESIGN.md`
   specifies a five-icon bottom bar inside the safe area; that shell has to either
   be kept custom or the spec has to change.
4. **No thin meter.** `ProgressBar` is a full-width progress row. Getting Cupola's
   6 px bar means a `defineTheme` component override (demonstrated: height 6 px,
   width 100 % of its box) plus a wrapper that owns the figure.
5. **`fonts.css` pulls Google Fonts.** `@astryxdesign/theme-neutral/fonts.css`
   `@import`s Figtree from `fonts.googleapis.com`. Importing the generated
   `astryx-themes.ts` module (the documented wiring) would add a third-party
   runtime asset, which `AGENTS.md` forbids. Import the theme's `/built` entry and
   override the font tokens instead — that is what the demo does, and it makes
   zero third-party requests.
6. **Runtime style injection.** A `defineTheme` value is injected at runtime and
   logs a warning. Production needs `npx astryx theme build` plus a prebuilt
   `theme.css` import.
7. **No breakpoint hook.** Responsive decisions need `matchMedia` by hand, or
   Astryx's StyleX build step for `xstyle` media queries — which reintroduces the
   StyleX compiler into the Vite config.
8. **Bundle cost.** The demo entry is 714 kB raw / 231 kB gzip plus 261 kB of
   Astryx CSS. The app entry stays 380 kB, but a full swap moves that weight into
   the main bundle unless the components are split per route.
9. **Small-type controls truncate.** `SegmentedControl` shows `L…` / `D…` at
   390 px next to a heading; it has to stack or go icon-only on phones.

## What a full swap costs

Ordered, with the demo as the proven part:

1. **Theme bridge** (½ day — done here): prebuilt theme, token map, font override.
2. **Shell** (1–2 days): `AppShell` + `TopNav`, drawer vs bottom-bar decision,
   command palette on `Dialog`, alerts count on the Alerts item.
3. **Primitives** (1 day): `Meter`, `StatusDot`, `Panel`, `Fig`, `Kv`, `Pager`,
   `States`, `Skeletons`.
4. **Tables** (2–3 days): `DataTable`/`UnitTable` move to data-driven columns
   (`pixel`/`proportional` + `renderCell`) with the sorting and pagination
   plugins, plus the per-list phone rendering.
5. **Pages** (3–4 days): systems, per-node tabs, events, alerts, apps, settings,
   login — 35 files that carry `className`.
6. **Charts** (1 day): uPlot colour plumbing through `useTheme`, theme-change
   redraw, axis typography.
7. **Verification** (1–2 days): `go test`/`go vet` unaffected, but the design gate
   must be redone — taste-skill lint + inspect at 1440/768/390, iPhone WebKit,
   Pixel Chromium, iPad, keyboard, WCAG AA — and `DESIGN.md` amended wherever the
   shell or table spec changed.

Total: **9–13 working days**, versus the 3–5 estimated before the experiment. The
extra comes from gaps 1–3: Astryx has no bottom bar, no thin meter and no
collapsing table, so those three Cupola specs survive as custom code anyway, and
every table has to be re-expressed as columns.

## Decision needed

`docs/DESIGN.md` is the source of truth and specifies the icon rail, the phone
bottom bar and the collapsing table. Adopting Astryx means editing that document
first, then re-running the gate. If the design has to stay exactly as specified,
the swap buys the primitives (Dialog, Tooltip, StatusDot, Table, Badge) and not
the shell — a partial adoption that drops Radix is about a day and carries no
design change.
