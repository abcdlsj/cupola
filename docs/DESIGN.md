# Cupola design

## Direction

Cupola follows the **Beszel** design philosophy refined with a neutral Zinc
palette: a high-signal fleet overview with a compact summary strip and sortable
systems table (with a Table/Cards switcher), bordered cards on a crisp light or
obsidian-dark ground, emerald/amber/red resource meters, and a per-system
hardware InfoBar above a 2-column (or full-width) chart grid. It keeps Cupola's
own depth — processes, systemd services, containers, remote apps/WOL, alerts,
folded events and URL-addressable tabs.

The stylesheet (`web/src/styles/tokens.css` and `web/src/styles/cupola.css`) is
self-contained with zero CSS framework overhead and zero runtime CSS-in-JS.
Nothing is fetched from a third party: UI text uses the platform sans-serif face
(`SF Pro Text` / `Inter` / `Segoe UI` / system sans), and all figures,
timestamps and IDs use self-hosted **IBM Plex Mono** from `web/public/fonts/`.

Two themes share one layout, chosen with the header's sun/moon button or in
**Settings → Appearance** (system, light, dark; stored in `localStorage` under
`cupola.theme`; `web/public/theme-init.js` resolves it before first paint).
**Light is the default**, even when the OS prefers dark; only an explicit choice
(or `System`) changes it.

- **Light (Zinc):** ground `#f6f7f9`, white cards `#ffffff` with a 1 px
  `#e4e4e7` border, ink `#09090b`, muted `#52525b`, accent `#2563eb`.
- **Dark (Obsidian Zinc):** ground `#09090b`, cards `#111114` with a 1 px
  `#232329` border and a subtle top catch-light, text `#f4f4f5`, muted
  `#a1a1aa`, accent `#3b82f6`.

Chart hues are `--data-1…4` (blue, emerald, amber, red); uPlot resolves them
through `cssColor()` in `web/src/lib/theme.ts` and rebuilds when the theme
changes.

## Type

- UI: platform sans (`SF Pro Text` / `Inter` / system-ui), 400 body, 500 for
  navigation, controls and row identities, 600 for headings.
- Figures, timestamps, IDs, chart axes: **IBM Plex Mono**, tabular. Units next
  to a figure step back in muted UI face (`<Figure>`).
- Sentence case everywhere; no tracked uppercase headers.

## Shell

- **Top bar (≥ 900 px):** translucent 56 px sticky bar centered at 1360 px. Left
  side holds the rounded-square Cupola mark and `cupola`, followed by
  **Systems**, **Services**, **Apps**, **Alerts** (with firing count badge) and
  **Events**; the active destination sits on a subtle bordered surface. Right
  side holds Search (`⌘K`), theme switch, Settings and a primary **+ Add system**
  button.
- **Phone (≤ 899 px):** top bar keeps the mark and icon utilities inside
  `env(safe-area-inset-top)`; the five destinations move to a bottom bar pinned
  to `visualViewport.height` (`--app-height` from `public/theme-init.js`) inside
  `env(safe-area-inset-bottom)`.

## Meters and status

- **Meters (`<Meter>`):** Beszel thresholds — emerald green (`--ok`) below 65 %,
  amber (`--warn`) 65–89 %, red (`--bad`) at 90 % and above, with a 6 px rounded
  pill track and tabular mono readout. Non-health shares (e.g., per-process CPU)
  use the neutral accent bar.
- **Status (`<StatusDot>`):** 7.5 px dot with a soft semantic halo (green up,
  amber degraded, red down, grey waiting); live system headers pulse gently when
  healthy.

## Screens

- **Systems (`/`):** 4-card fleet KPI summary strip (Systems online, Fleet CPU,
  Fleet memory, Attention), followed by the **Systems** card (live badge,
  `?q=` filter, Table/Cards view switcher, sortable columns including Network
  Rx/Tx, row click navigation, and responsive Beszel grid cards), and the
  **Services** card (failed units pinned first, honest counts, pager). `/nodes`
  redirects here.
- **System (`/nodes/:id`):** breadcrumb, Beszel **InfoBar** card (live status
  dot, name, role tags, icon hardware spec chips for OS/kernel/CPU/RAM/uptime/
  agent, plus `?range=` time window selector and Grid/Full chart width switch),
  underline tabs with counts, KPI strip, 2-column (or full-width) uPlot chart
  cards, disks/sensors cards and top processes.
- **Services, Apps, Alerts, Events, Settings, Login:** unified bordered cards,
  quiet empty states, native `<dialog>` confirmation sheets and `⌘K` command
  palette.

## Charts

- uPlot with smooth splines over a flat translucent fill (~14 % opacity) on the
  primary series, faint horizontal gridlines, mono axis ticks, dashed threshold
  lines and a floating crosshair readout.
- Windows with fewer than two samples keep their frame height with a dashed
  empty box.

## PWA / iOS

- Manifest: standalone, `start_url=/`, `viewport-fit=cover`, safe-area padding,
  `--app-height` synced to `visualViewport.height` with keyboard and cold-launch
  guards (`web/public/theme-init.js`).
- Service worker: shell precache, network-first API, IndexedDB last snapshot,
  explicit offline banner.
