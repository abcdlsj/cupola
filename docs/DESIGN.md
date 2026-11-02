# Cupola design

## Direction

Two themes on one layout, chosen in **Settings → Appearance** (system, light,
dark; the choice is kept per browser in `localStorage` under `cupola.theme`,
and `web/public/theme-init.js` applies it before first paint).

- **Dark — true-black flat, data-terminal blue.** A cool near-black ground,
  cards one lightness step above it, no borders or shadows on cards; colour on
  data and status only; selection is the 1 px `#4a8ad6` accent line. Taken from
  tasteskill v2 `true-black-flat`, keeping the original data-terminal blue
  instead of the dealt lime.
- **Light — framed sheet.** A blue-grey ground (`#f2f5f8`) around white cards,
  ink text, a teal accent (`#1b6c80`) for selection and the main series. From
  tasteskill v2 `framed-sheet`.

Both themes share every layout, spacing and type token. The original
data-terminal sheet (seed `956138436`) is kept in `docs/design/direction.json`
for history.

Tokens live in `web/src/styles/tokens.css`: shared layout and type on `:root`,
dark colours as the default, light colours under
`@media (prefers-color-scheme: light)` (unless `data-theme="dark"`) and under
`:root[data-theme="light"]`. Components never hard-code a colour; uPlot reads
the tokens through `cssColor()` in `web/src/lib/theme.ts` and is rebuilt when
the theme changes.

## Type

- UI: **IBM Plex Sans**, 400/500/600/700.
- Numbers, timestamps, IDs, table figures: **IBM Plex Mono**, 400/500.
- `font-variant-numeric: tabular-nums` on every figure.
- Sizes: 24 title, 16 section/card title, 24 KPI, 14 body, 12 small.
- Sentence case; no tracked uppercase; no monospace in prose (only data/IDs).
- Axis ticks and chart notes stay in the UI face, not mono.

The taste-skill inspector flags monospace; this is a deliberate decision for
figures. Defend it in the report, do not blanket `--allow` other rules.

## Shell

- **Desktop:** 56 px icon rail on the ground with the Cupola mark at the top,
  16 px outline icons on a 38 px pitch, groups split by short hairlines,
  settings at the bottom. 48 px top bar with the workspace/node context,
  search, freshness and one action. Content padding 32 px, max width 1440.
- **Selection:** a 1 px accent line exactly as wide as the label, on the
  nearest edge. No filled pills for tabs, no coloured segmented controls.
- **Tablet:** rail stays, content padding 24; tables keep 4–5 columns.
- **Phone:** rail becomes a bottom bar with four destinations and short labels;
  48 px top bar with title and one action; 16–20 px margins; 44 px targets.
  Tabs scroll in their own row. Tables become two-line rows (identity + key
  figure on line 1; fields in 13 px muted on line 2), never dropping fields.

## The fleet profile

The one signature element only Cupola has. On the overview:

- One thin line per node across four shared axes: **CPU, memory, root disk,
  network** (Mbit/s). A flat line is a quiet box; a spike is a box under load.
  The shape of the whole fleet reads in one glance, which four KPI columns and
  a bar per node cannot do.
- Lines use the identity hues (`--series-1`, `--series-2`, `--chart-1`, cycling),
  never a status colour: two boxes can share a status and still have to be
  distinguishable. Degraded and offline are named in the line label and the
  readout, and an offline line is dashed in `--muted`.
- A 1 px accent tick marks the selected node; hover or focus prints its four
  figures in the readout under the chart; click or Enter routes to
  `/nodes/:id`.
- Above it: the fleet count and the finding sentence (“3 boxes, 2 need
  attention”). Beside it: the one action the operator is most likely to take.

This is functional data, not a decorative skyline. No bars, no orbital rings,
no glows, no fake constellations.

## Agent marks

Use Warren’s preset agent SVGs as **monochrome masks** at 16 px, in `--muted`
and `--text` for selected/hover. No tinted squares, no brand colours.

Source:
`warren/Packages/WarrenIOS/Sources/WarrenIOS/Resources/PresetIcons.xcassets`
— Codex, Claude, Pi, OpenCode, Qoder, Antigravity, Trae, shell, zsh.

Copy the SVGs into `web/public/agents/`, keep `docs/ASSETS.md` with source,
license note and trademark attribution. Missing types (Cursor, Aider, Gemini,
Goose, Cline, Roo, Continue, Ollama, vLLM, ComfyUI) use a neutral terminal
glyph + the type name; do not draw fake brand marks.

## Charts

- uPlot for time series with a custom theme (not its defaults); hand-drawn SVG
  for the fleet profile.
- Lines are thin and coloured: 1.5 px, never smoothed, sitting on a flat
  translucent area (18 % of the same hue, no gradient) so the shape of the load
  reads at a glance the way Beszel draws it. The hues come from
  `--series-1..4` (blue, teal, amber, red) and a chart uses at most four,
  usually two (utilisation against pressure). Chrome stays monochrome.
- The crosshair is shared: one 1 px accent line and one readout that lists every
  series in the chart with its value at the cursor.
- 3–5 faint horizontal gridlines, no y-axis line, round ticks above the max;
  seconds on the x-axis when the window is shorter than 30 minutes.
- No boxed legend: for one series the card title names it; for two, a plain
  swatch-and-label line sits under the chart.
- Shared crosshair across charts; tooltip with label + value, no arrow.
- Annotate the event that matters (reboot, deploy, alert) with a 1 px marker
  and a short label; dashed reference lines only for thresholds.
- No chart animation on live ticks; updates are immediate.
- Long ranges return min/avg/max; downsample to the plot width.

## App screen rules

- No hero header; the page title is a noun at 26 px, the finding is one 13 px
  muted line under it.
- No KPI tiles with icons or sparklines. One divided strip or bare figures.
- The biggest block answers the screen’s one question.
- Tables: 12 px sentence-case grey headers, no fill band, no zebra, numbers
  right-aligned, one status mark per row, one action where needed.
- Colour ≤ 3 % of pixels: status and the one accent on data/selection.
- Empty, zero, loading and error states for every block: real zero prints,
  missing is a dash, loading keeps layout, errors stay inside the block.
- No pagination on the overview; cap rows and link out.
- No emoji, gradients, glass, glow, icon chips, rainbow charts, uppercase
  tracked headers, fake data or lorem.

## Motion

App screens have no entrance-motion floor. Use feedback only: press, hover,
focus, menu/sheet opening, row arriving. 120–160 ms, ease-out. Respect
`prefers-reduced-motion`. No page-load choreography.

## PWA / iOS

- Manifest: standalone, `start_url=/`, scope `/`, theme `#171719`, background
  `#171719`, 192/512/1024 icons + maskable.
- Service worker: shell precache; network-first API; last-known snapshot in
  IndexedDB; offline banner with last-updated time.
- iOS meta: `apple-mobile-web-app-capable`, `viewport-fit=cover`, `dvh`,
  safe-area padding, Apple touch icon, install sheet (Share → Add to Home
  Screen), standalone detection, no 100vh traps.
- Bottom bar above the home indicator; no hover-only controls; one row of
  controls above a chart; tabs scroll in their own row.
- No Web Push in v1. In-app alert badge + ntfy/webhook first.

## Report

When M0 is done, report:

- the style and seed (data-terminal, 956138436);
- the face (fleet horizon) and where it appears;
- each screen’s one question;
- taste-skill inspect results at 1440/768/390, with any WARN defended;
- any sample data that must be replaced;
- screenshots for approval.

Do not claim a check you did not run.
