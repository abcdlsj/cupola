# Cupola design

## Direction

Cupola reads like **Beszel**: one systems table on the home screen, one grid
of chart cards per system, bordered cards on a near-black (or cool grey)
ground, and a thin meter beside every percentage. It keeps its own type (IBM
Plex), its data-terminal blue and the parts Beszel does not have: agent
sessions, apps, findings and URL-addressable tabs.

Two themes on one layout, chosen with the header's sun/moon button or in
**Settings → Appearance** (system, light, dark; kept per browser in
`localStorage` under `cupola.theme`; `web/public/theme-init.js` applies it
before first paint).

- **Dark:** ground `#0b0c0e`, cards `#111316` with a 1 px `#22252a` border,
  text `#f3f4f5`, muted `#9a9ea6`, accent `#4a8ad6`.
- **Light:** ground `#f6f7f9`, white cards with a 1 px `#e2e5e9` border, ink
  text, accent `#1b6c80`.

Tokens live in `web/src/styles/tokens.css`: layout and type on `:root`, dark
colours as the default, light colours under `@media (prefers-color-scheme:
light)` (unless `data-theme="dark"`) and under `:root[data-theme="light"]`.
Components never hard-code a colour; uPlot reads tokens through `cssColor()`
in `web/src/lib/theme.ts` and is rebuilt when the theme changes.

The earlier data-terminal sheet (seed `956138436`, borderless cards, icon
rail, fleet profile) is kept in `docs/design/direction.json` for history.

## Type

- UI: **IBM Plex Sans**, 400/500/600.
- Figures, timestamps, IDs: **IBM Plex Mono**, tabular. Units next to a
  figure step back into the UI face, muted and slightly smaller (`<Fig>`).
- Sizes: 22 page title, 18 the systems card title, 15 card title, 14 body,
  13 card description and table figures, 12 table headers and axis labels.
- Sentence case everywhere; no tracked uppercase.

## Shell

- **Header (all widths):** 56 px, sticky, on the ground with a 1 px rule. The
  Cupola mark and word, then the five destinations as words (Systems, Agents,
  Apps, Alerts with a firing count, Events), the selected one underlined by a
  1 px accent line. On the right: the freshness stamp, search (⌘K), the theme
  switch and settings, all 34 px bordered controls.
- **Content:** max width 1440, 32 px side padding (24 on tablets, 16 on
  phones), 16 px gap between cards.
- **Phone (≤ 640 px):** the header keeps the mark and the three icon buttons
  (40 px); the destinations move to a bottom bar of four (Systems, Agents,
  Apps, Alerts) above the home indicator.

## Cards

- 12 px radius, 1 px border, one lightness step off the ground. No shadow;
  the one shadow is for menus, tooltips and dialogs.
- Head: title (15 px, 600) and one muted description line under it, the
  card's link or count on the right. A table or list inside runs to the
  card's edges under a 1 px rule.
- Controls: 34 px high, 8 px radius, 1 px border; a filter or select inside a
  card sits on the ground tone as a well. Segmented toggles (table/grid) use a
  raised pressed segment, not colour.

## Meters

Every percentage in a table or list is a figure plus a 6 px rounded bar
(`<Meter>`): green below 65 %, amber from 65 %, red from 90 % (the figure turns
red too). A missing reading prints a dash over an empty track; zero prints
0 %. Data that is not health (a process's share of the CPU, memory per
process) uses a neutral meter in the first series hue.

## Status

A node's state is an 8 px dot (`<StatusDot>`): green up, amber degraded, red
down, grey waiting. Headers that must be read add the word (`<StatusPill>`:
Up, Degraded, Down, Waiting). Pills stay for kinds and results (OK, Failed,
Never run, severity).

## Screens

- **Systems (`/`)** — *is anything wrong, and where?* Up to four "Needs
  attention" cards (down systems first, then one finding per system and kind
  from the last 24 h; two on phones). Then the **All systems** card: count line,
  filter, table/grid toggle, and a sortable table — system (dot, name, OS),
  CPU, memory, disk, GPU (only when a system has one) as meters; net, load
  1/5/15, hottest temperature, agent sessions, agent version and transport.
  The row opens the system. Under 900 px the table becomes cards with three
  meters. Filter, sort and layout live in the URL (`?q=`, `?sort=&dir=`,
  `?view=grid`). Below: Apps (run buttons) and Agent sessions. `/nodes`
  redirects here with its query.
- **System (`/nodes/:id`)** — header card (back, name, status, labels, host,
  uptime, OS, kernel, CPU, memory, agent) with the chart window on the right
  (1 hour, 24 hours, 7 days, 30 days; `?range=`, carried across tabs). Tabs
  with counts. Overview is the chart grid: CPU, memory, load (dashed line at
  one task per thread), pressure, disk I/O, bandwidth, Docker CPU and memory
  (when containers exist), then disk usage and temperatures as meter lists and
  the top processes.
- **CPU / Memory / Storage / Network** — the tab's chart beside a breakdown
  card, then its table (per-core meters, largest residents, filesystems and
  drive health, interfaces).
- **Lists** (processes, agents, services, containers, apps, events, alerts,
  settings) — one card per question, filters in the card head, the URL holds
  the filter.

## Charts

- uPlot with the Cupola theme. Curves are 1.5 px splines over a flat area of
  the same hue at 18 % (no gradient). Hues `--series-1..4`; at most four per
  chart.
- Card head: title, one-line description, the current reading on the right in
  mono 18 px. Two or more series get a swatch legend under the chart with each
  series' current value.
- Five faint gridlines on round steps (1, 2, 2.5, 5 × 10ⁿ; binary steps for
  bytes), no y-axis line, axis labels 11 px in the UI face; the y-axis is as
  wide as its widest label.
- Thresholds are dashed in muted ink with a short label. One shared crosshair
  with a readout listing every series.
- A window with fewer than two samples shows a dashed empty frame of the same
  height with one line of text; the frame never collapses.
- No animation on live ticks.

## Motion

Feedback only: hover borders, pressed states, menus and dialogs opening,
meter widths, 120–160 ms ease-out. `prefers-reduced-motion` turns it off.

## Rules that still hold

- No emoji, gradients, glass, glow, icon chips, sparklines on KPIs, rainbow
  charts, zebra rows, uppercase tracked headers, fake data or lorem.
- Colour is for data, status, meters and the one accent line.
- Empty, zero, loading and error states for every block.
- WCAG AA contrast in both themes; no hover-only controls; 44 px touch
  targets on phones.

## PWA / iOS

- Manifest: standalone, `start_url=/`, theme and background `#0b0c0e`.
- Service worker: shell precache; network-first API; last snapshot in
  IndexedDB; offline banner with the last-updated time.
- iOS: `viewport-fit=cover`, `dvh`, safe-area padding, the shell pinned to
  the screen edges in the installed app, the bottom bar above the home
  indicator.
