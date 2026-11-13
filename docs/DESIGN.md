# Cupola design

## Direction

Cupola reads like **Beszel**: one systems table on the home screen, one grid
of chart cards per system, bordered cards on a near-black (or cool grey)
ground, and a thin meter beside every percentage. It keeps its own type (IBM
Plex), its data-terminal blue and the parts Beszel does not have: agent
sessions, apps, findings and URL-addressable tabs.

The UI is built on **water.css** (v2.1.1, classless, MIT). Elements get their
defaults from water.css; Cupola adds only its own furniture in
`web/src/styles/cupola.css` and its own components in `web/src/ui/`:

- `primitives.tsx`: `HStack`, `VStack`, `Grid`, `Text`, `Heading`, `Link`,
  `Card`, `Badge`, `StatusDot`, `Table`, `List`, `EmptyState`, `Banner`,
  `CodeBlock`, `Button`.
- `controls.tsx`: the form layer — `TextInput`, `NumberInput`, `Select` (a
  listbox combobox, not a native popup), `Checkbox`, `CheckboxGroup`, `Switch`,
  `SegmentedControl`, `TabList`, and a native `<dialog>` `Dialog`.
- `kit.tsx`: the page vocabulary — `PageHead`, `Band`, `Section`, `KpiStrip`,
  `KpiCell`, `Meter`, `Figure`, `Facts`, `Stat`, `useIsPhone`.

There is no runtime CSS-in-JS and nothing is fetched from a third party: the
water.css sheet is vendored (`web/src/styles/water.css`), the UI face
(Figtree) comes from the fontsource package and the mono face (IBM Plex Mono)
from `web/public/fonts/`.

Two themes on one layout, chosen with the header's sun/moon button or in
**Settings → Appearance** (system, light, dark; kept per browser in
`localStorage` under `cupola.theme`; `web/public/theme-init.js` resolves it
before first paint). **Light is the default**, even when the OS prefers dark;
only an explicit choice (or `System`) changes it.

- **Light:** ground `#f6f7f9`, white cards with a 1 px `#e3e6ea` border, ink
  `#1c1f24`, muted `#5f6874`, accent `#1b6c80`.
- **Dark (grey):** ground `#1a1c1e`, cards `#212427` with a 1 px `#34383d`
  border, text `#e7e9eb`, muted `#a4a9ae`, accent `#5ba7bd`.

The values live in `web/src/styles/tokens.css`, which also re-points the
variables water.css reads (`--background-body`, `--background`, `--border`,
`--links`, `--focus`, `--select-arrow`, …), so water.css's own controls,
dialogs, code and selection take Cupola's tone without a second stylesheet.
Chart hues are `--data-1…4`; uPlot resolves them through `cssColor()` in
`web/src/lib/theme.ts` and is rebuilt when the theme changes.

The earlier data-terminal sheet (seed `956138436`, borderless cards, icon
rail, fleet profile) is kept in `docs/design/direction.json` for history, and
`docs/design/astryx-migration.md` records the Astryx evaluation that preceded
this sheet.

## Type

- UI: **Figtree**, 400/500/600 (water.css's system stack is overridden).
- Figures, timestamps, IDs: **IBM Plex Mono**, tabular. Units next to a
  figure step back into the UI face, muted and slightly smaller (`<Figure>`).
- Sizes: 22 page title, 18 the systems card title, 15 card title, 14 body,
  13 card description and table figures, 12 table headers and axis labels.
- Sentence case everywhere; no tracked uppercase.

## Shell

- **Top bar (≥ 900 px):** the Cupola mark and `cupola`, then **Systems**,
  **Services**, **Apps**, **Alerts** (with the firing count) and **Events** as
  text items; the selected item takes a 1 px accent underline and a well
  ground. On
  the right: search (⌘K), the theme switch and settings, each with a tooltip.
  A horizontal bar spends no width on navigation, so the systems table gets
  the full 1440.
- **Content:** a 1440 px column, 24 px padding (12 on phones), 24 px between
  bands, in the shell's own scroll region. The footer (`Cupola · raw 48 h, 1 m
  30 d, 1 h 13 mo`, with the about link) is pinned to the viewport edge while
  the content scrolls.
- **Phone (≤ 899 px):** the top bar keeps the mark and the three utilities;
  the five destinations move to a bottom bar of icons with a word, which takes
  the footer region, so it sits above the home indicator inside the safe area.
  The shell is sized from `visualViewport.height` (written to `--app-height`
  by `public/theme-init.js`), so an installed PWA has no gap at the bottom.

## Page anatomy

- **PageHead:** an optional crumb row, the h1, one muted context line, the
  page's controls on the right.
- **Bands:** a page is a stack of bands separated by a hairline; each band
  has a level-2 title, one context line and its controls. Cards inside a band
  are level-3.
- **KPI strip:** one card split into equal cells by hairlines (two columns on
  a phone); label with the status dot on its trailing edge, the figure at
  24 px, the unit as a small grey suffix, one note line.

## Surfaces and sections

The page is a sheet of ground. **A hairline rule and the space around it group
read-only content; a box is only for something that floats.** So:

- **Sections** (charts, breakdowns, disks, sensors, processes, facts) are a
  heading, one muted line, a 1 px top rule and space. No card, no shadow.
- **Boxes** are for transient or standalone surfaces: dialogs, the command
  palette, menus and the login plate. One shadow, used only there.
- A **band** is a titled group of sections: level-2 heading, one context line,
  controls on the right, a rule above the next band.
- Head: the screen's title at 24 px (600) with one muted line under it; a
  section titles at 16 px (600). Controls sit on the right of the head, aligned
  with the baseline.
- **Controls** share one system: 36 px high, 6 px radius, one focus ring, the
  segmented control drawn as a track with the chosen segment raised. Nothing
  overrides the scale per page.
- **Colour belongs to data.** Primary buttons are ink (`--text` on `--card`),
  never the accent; the accent marks links, the active tab, meters and status.
  Destructive confirmation is the one red surface.
- **Tables** are the `Table` primitive with data-driven columns (`pixel()`
  for figures and meters, `proportional()` for the identity and free text),
  compact density, row dividers, no zebra. The identity column is the widest,
  figures are right-aligned and tabular. Below 900 px a table is not reflowed:
  the page renders the same rows as stacked blocks (identity line, then
  labelled meters or fields).
- **Empty states** are quiet: a title in the text colour, one muted line and
  at most one link. No dashed box.
- Nothing is truncated without a tooltip: truncated `Text` (`maxLines`) shows
  the full value on hover and focus.

## Meters

Every percentage in a table or list is a figure plus a 6 px bar
(`<Meter>` in `ui/kit.tsx`, a `role="progressbar"` track).
A healthy meter is the **accent**, not green: fifteen green bars make a colour
field that hides the three real problems. The bar turns amber from 75 % and
red from 90 %, and the figure takes the same colour. A missing reading prints
a dash over an empty track; zero prints 0 %. Data that is not health (a
process's share of the CPU, memory per process) uses the same neutral accent
bar.

## Status

A node's state is a 7 px dot (`<StatusDot>`): green up, amber degraded, red
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
- **The command palette** (⌘K) is a native `<dialog>`: one field, two groups
  (`Screens`, `Systems`), a system row carrying its status dot and its CPU and
  memory figures, and a keyboard footer.
- **Pagers** are `<Pager>`: the range (`1–12 of 18` on the left) and page
  numbers on the right; the page lives in the URL.

## Charts

- uPlot with the Cupola theme. Curves are 1.5 px splines over a flat area of
  the same hue at 18 % (no gradient). Hues `--color-data-categorical-{blue,teal,orange,red}`; at most four per
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
