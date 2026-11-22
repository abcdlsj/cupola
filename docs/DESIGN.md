# Cupola design

## Direction

Cupola follows **Beszel's** UI architecture directly: a floating rounded card
navbar inside the centered container, a spacious `All Systems` centerpiece card
with icon-labelled sortable headers and chunky horizontal percentage meters
(number left, 13 px rounded bar right), a hairline-separated hardware InfoBar
on each system page, an elevated pill `TabList` with icons, and tall 206 px
gradient-filled area charts.

The stylesheet (`web/src/styles/tokens.css` and `web/src/styles/cupola.css`) is
self-contained with zero CSS framework overhead and zero runtime CSS-in-JS.
All fonts are self-hosted in `web/public/fonts/`: **InterVariable** for UI and
tabular figures, and **IBM Plex Mono** for code, units, timestamps and IDs.

Two themes share one layout, chosen from the navbar's sun/moon button or in
**Settings → Appearance** (system, light, dark; stored under `cupola.theme`;
resolved before first paint by `web/public/theme-init.js`). **Light is the
default**.

- **Light (Beszel warm stone):** ground `#faf9f7`, white cards `#ffffff`, warm
  hairline border `#e2dfda`, ink `#1a1918`, muted `#615e5a`.
- **Dark (Beszel slate charcoal):** ground `#151619`, cards `#1a1b1f`, border
  `#2c2e34`, text `#f5f6f7`, muted `#a6a9b0`.

Chart hues match Beszel's harmonious HSL palette (`--data-1…4`: blue, emerald,
amber, rose); uPlot resolves them through `cssColor()` and renders vertical
canvas gradient fills fading smoothly toward the baseline.

## Shell

- **Floating Navbar (≥ 900 px):** a 62 px rounded card inside the 1480 px
  container (`my-4`), holding the brand mark, primary destinations (`Systems`,
  `Services`, `Apps`, `Alerts`, `Events`), `Search ⌘K`, theme switch, Settings
  and `+ Add System`.
- **Phone (≤ 899 px):** compact floating top bar inside
  `env(safe-area-inset-top)` and a 5-tab bottom bar pinned to
  `visualViewport.height` (`--app-height`) inside `env(safe-area-inset-bottom)`.

## Meters and status

- **Beszel meters (`<Meter>`):** tabular percentage on the left (`38.1%`)
  followed by a 13 px tall rounded bar filling the column (`#3db86a` green
  `< 65 %`, `#eab308` yellow `65–89 %`, `#ef4444` red `≥ 90 %`).
- **Load average (`LoadTrio`):** colored status dot plus the 1m / 5m / 15m load
  figures.
- **Status (`<StatusDot>`):** 8 px emerald / amber / red dot, pulsing gently on
  the live system InfoBar when healthy.

## Screens

- **All Systems (`/`):** one spacious centerpiece card with `?q=` search,
  Table / Grid switcher, icon-labelled sortable columns (`System`, `CPU`,
  `Memory`, `Disk`, `Load Avg`, `Net`, `Temp`, `Uptime`), and Beszel grid cards
  with aligned icon/label/meter rows; Systemd Services card below.
- **System (`/nodes/:id`):** Beszel **InfoBar** card (system name + single
  horizontal icon/text spec strip separated by 1 px vertical hairlines +
  `?range=` window selector + `Grid` / `Full` chart width toggle), elevated pill
  `TabList` with icons, and straight into the tall 2-column (or full-width)
  gradient area chart grid, followed by disks/sensors and top processes.
