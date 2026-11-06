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

- **Rail (all widths ≥ 900 px):** 56 px on the left, on the ground with a 1 px
  rule on its right edge. The Cupola mark on top, then the labels are icons
  only: **Systems** and **Services** (the fleet), a hairline, then **Apps**,
  **Alerts** and **Events** (the work). The selected item is the accent
  colour with a 2 px accent bar on its left edge. Alerts carries a filled
  count when something fires. Pinned to the bottom: search (⌘K), the theme
  switch and settings. Every icon has a tooltip with its name.
- **Content:** max width 1440, 32 px side padding (24 on tablets, 16 on
  phones), 16 px gap between cards. The footer (`Cupola · raw 48 h, 1 m 30 d,
  1 h 13 mo`, with the about link) never floats: it sits under the last card,
  or at the bottom of the viewport when the page is shorter than the screen.
- **Phone (≤ 899 px):** a 48 px top strip carries the mark and the word
  `cupola`, plus search, theme and settings. The rail becomes a bottom bar of
  five icons on the ground above the home indicator, inside the safe area.
  The shell is sized from `visualViewport.height` (written to `--app-height`
  by `public/theme-init.js`), so an installed PWA has no gap at the bottom and
  no overhang after a bounce.

## Cards

- 6 px radius, 1 px border, one tone **darker** than the ground. No shadow;
  the one shadow is for menus, tooltips and dialogs. Depth comes from the tone
  step and the border, never from a blur.
- Head: the screen's title at 28 px (600) with one muted description line
  under it; a second-level card titles at 22 px in the muted colour. The
  card's controls sit on the right of the head, vertically centred with the
  title. A table or list inside runs to the card's edges under a 1 px rule.
- Controls: 34 px high, `--radius-control` (a pill for inputs, 4 px for
  chips); a filter or select inside a card sits on the ground tone as a well.
  Segmented toggles use a 1 px accent underline under the active word, not a
  filled block.
- **Tables have no chrome:** no wrapper border, no header band, no zebra. A
  1 px rule between rows, 42 px rows, the head sticky and 13 px in `--muted`.
  Names read in mono, figures right-aligned and tabular. Under 1024 px a table
  becomes rows of two lines: the identity on the first, its fields in an
  aligned grid under it, each with a small label.
- Nothing is truncated without a tooltip. A card or a row declares the full
  value in `title`; `TipLayer` adopts it, deletes the attribute and draws one
  themed tip above the anchor — but only when the string is really cut off
  (`scrollWidth > clientWidth`), so a short name never gets a redundant box.
  Keyboard focus shows the same tip; on a touch screen there is no tip at all,
  because a long press would fight the scroll.

## Meters

Every percentage in a table or list is a figure plus a 5 px bar (`<Meter>`).
A healthy meter is the **accent**, not green: fifteen green bars make a colour
field that hides the three real problems. The bar turns amber from 75 % and
red from 90 %, and the figure takes the same colour. A missing reading prints
a dash over an empty track; zero prints 0 %. Data that is not health (a
process's share of the CPU, memory per process) uses the same neutral accent
bar.

## Status

A node's state is an 8 px dot (`<StatusDot>`): green up, amber degraded, red
down, grey waiting. Headers that must be read add the word (`<StatusPill>`:
Up, Degraded, Down, Waiting). Pills stay for kinds and results (OK, Failed,
Never run, severity).

## Screens

- **Systems (`/`)** — *is anything wrong, and where?* One card of system
  cards, three across (two at ≤ 1180 px, one at ≤ 760 px): dot and name,
  the role label, then CPU, memory, disk and load as meters, then one meta
  line (OS, cores, uptime, temperature). The card opens the system. The card
  view is not sorted: it reads most-strained first, which is the only order
  that answers the question. Below it the **Services** card: the state chips
  with honest counts, the first page of the cross-node unit list and a pager.
  `/nodes` redirects here with its query.
- **Services (`/services`)** — *what is broken on which machine?* Every unit
  on every node in one table, failed first, then by system and name. State
  chips, a filter, the node column and the sub-state column; a row opens that
  node's services tab. The URL holds `?q=` and `?state=`.
- **Events fold repeats** and group by kind: one collapsed group per kind,
  worst severity first, the count on the header row, the rows one click away.
  A collapse state that the reader set is kept for the visit.
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
- **Lists** (processes, services, containers, apps, events, alerts,
  settings) — one card per question, filters in the card head, the URL holds
  the filter.
- **Events fold repeats.** One node repeating the same message shape (kind,
  severity, message with its figures masked: `New listening port #/udp (Plex
  Media Serv)`) inside an hour is one row with `×N`, the newest occurrence on
  the row and the rest one click away. The first screen shows the shapes, not
  every port. Raw events stay in the database and in each occurrence's own
  route; only the list folds.
- **The command palette** (⌘K) is one field with a search glyph and an `esc`
  key cap, two groups (`Screens`, `Systems`), and a row per destination with
  its rail icon. The selected row is the same 2 px accent bar on its left edge
  the rail uses — never an inverse block — with a 45 % wash. A system row
  carries its CPU and memory figures and a status dot; a footer strip names
  the arrow keys and Enter.
- **Pagers** print the range (`1–12 of 18`) in mono on the left and page
  numbers with gaps (`1 … 4 5 6 … 12`) on the right; the current page is a
  raised square, the arrows are 26 px. The page size follows the breakpoint
  (12 / 10 / 8 / 6) and the page lives in the URL.

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
  indicator. The installed layout viewport can stop one safe area short of the
  screen; `theme-init.js` measures the shortfall into `--app-bottom-gap`, the
  shell's bottom edge extends by it and the bar pads by `--app-safe-bottom`
  (`max(env(safe-area-inset-bottom), gap)`), so no ground is left under the bar
  and the inset is never counted twice.
