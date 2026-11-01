# Cupola design

## Direction

**Data terminal**, dealt by tasteskill v2 (seed `956138436`, style
`data-terminal`, kind `markets`, theme dark). Full sheet:
`docs/design/direction.json`.

Why: Cupola is a monitoring screen read in long sessions. The style keeps the
chrome monochrome, puts colour on data and status only, uses tabular figures
that stack, and marks every selection with the same 1 px accent line. It is
deliberately not the cream-paper/ink dashboard look.

The style sheet says “distilled from one screen; keep it narrow”. We keep its
move (1 px accent selection, dense figures, dark elevation) and compose the
screens from the app-screen rules of the skill, not from a template.

Read `references/app-screens.md` from
`https://github.com/Leonxlnx/taste-skill` before building. The implementing
agent must run the app gate on the production build:

```bash
node /tmp/taste-skill/skills/taste-skill/scripts/lint.mjs --app web/src
node /tmp/taste-skill/skills/taste-skill/scripts/inspect.mjs --app http://localhost:5173
```

## Tokens

```css
:root {
  --ground: #171719;
  --surface: #131217;
  --raised: #212023;
  --border: #222224;
  --rule: #1b1a1f;
  --control: #3a3a3e;

  --text: #ffffff;
  --muted: #8a8c92;
  --accent: #4a8ad6;

  --positive: #44a282;
  --negative: #e5566f;
  --warning: #d9a441;

  --chart-1: #f2f2f3;   /* the main series */
  --chart-2: #e5566f;   /* the bad/negative series */
  --chart-3: #4a8ad6;   /* the accent series */

  --pill-positive-bg: #1b2828; --pill-positive-ink: #5fc39c;
  --pill-negative-bg: #2c1a20; --pill-negative-ink: #e5566f;
  --pill-warning-bg:  #2a2416; --pill-warning-ink:  #d9a441;
  --pill-neutral-bg:  #212023; --pill-neutral-ink:  #bdbdc0;

  --shadow: 0 12px 28px rgba(0, 0, 0, .2); /* floating menus/dialogs only */

  --radius-card: 6px;
  --radius-control: 999px;
  --row-height: 42px;
  --sidebar-width: 56px;
  --gap: 24px;
  --pad: 32px;
  --control-height: 34px;

  --fs-title: 26px;
  --fs-section: 20px;
  --fs-kpi: 20px;
  --fs-body: 13px;
  --fs-small: 12px;

  --font-ui: "Public Sans", system-ui, sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, monospace;
}
```

Density: dense. One gap value. Cards are darker than the ground; no borders or
shadows on resting cards. The shadow belongs to floating UI only.

## Type

- UI: **Public Sans**, 400/500/600/700.
- Numbers, timestamps, IDs, table figures: **IBM Plex Mono**, 400/500.
- `font-variant-numeric: tabular-nums` on every figure.
- Sizes: 26 title, 20 section, 20 KPI, 13 body, 12 small.
- Section titles 20/400 in muted grey; card titles 16/600; body 13.
- Sentence case; no tracked uppercase; no monospace in prose (only data/IDs).
- Axis ticks and chart notes stay in the UI face, not mono.

The taste-skill inspector flags monospace; this is the style’s deliberate
decision. Defend it in the report, do not blanket `--allow` other rules.

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
- Lines are thin and coloured: 1.5 px, never filled, never smoothed. The hues
  come from `--series-1..4` (blue, teal, amber, red) and a chart uses at most
  four, usually two (utilisation against pressure). Chrome stays monochrome.
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
