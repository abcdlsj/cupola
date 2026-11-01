# UI fixes

Branch `ui-fixes`. Frontend and docs only; no Go change.

## What changed

### 1. Relative time is compact

`web/src/lib/format.ts` — `duration()` now prints `38s`, `41m`, `2h 14m`,
`2d 22h` and `days()` prints `12d`. Every relative stamp, uptime, runtime and
container age inherits it, so `2 d 22 h ago` became `2d 22h ago`. Runtimes that
were produced by stripping " ago" now call `duration()` directly.

### 2. Charts no longer wait on a round trip

- `NodeLayout` prefetches the series a tab needs as soon as the node resolves
  (`prefetchSeries`, `TAB_SERIES` in `web/src/data/queries.ts`) and warms the
  next tab on hover or focus.
- `useSeries` keeps the previous window while a new one loads
  (`placeholderData: keepPreviousData`) and holds it for 15 s, so switching
  ranges never blanks the curve.
- A chart that has no points yet says `Loading this window from the hub…`
  instead of swapping the panel for an empty state.
- The overview's CPU chart defaults to `1h`, the only window the hub answers
  from live samples (see the leftover about rollups).
- The SSE stream refreshes cached reads at most every two seconds, so three
  boxes polling at 2 s cannot start a refetch storm.
- The Nodes table and the node overview read memory and disk totals from
  `health.mem_used/mem_total/root_disk_*`; they were reading a snapshot that
  `/fleet/summary` never sends and printing `0 GB of 0 GB`.

### 3. Thin coloured lines

`SeriesChart` draws 1.5 px lines in data hues (`--series-1..4`: blue, teal,
amber, red; a chart uses at most four) on the same surface, with faint
gridlines, a shared crosshair and a readout that names each line and its value.
The CPU chart carries two lines — utilisation and CPU pressure. The per-core
bars use the first data hue instead of chrome white. Seconds appear on the
x-axis when the window is shorter than 30 minutes.

The network and disk-throughput curves are gone: the hub's series route refuses
`net_rx`, `net_tx`, `disk_r` and `disk_w` even though the store keeps them.
Storage charts I/O pressure (`psi_io`), network states its live rates only.

### 4. One name per screen, and it says Cupola

The top bar reads `Cupola` and a trail that locates the view (`Cupola / Nodes /
CPU`); the page heading names the object and is the only large name. The
in-page breadcrumb on a node was removed for the same reason. No screen shows
the same word twice at two sizes.

### 5. Copy link is gone

`CopyLinkButton` and `useCopyLink` were deleted, along with every usage. The URL
is in the address bar; the button added a click and a second label.

### 6. The fleet profile replaces the fleet horizon

`FleetProfile` (SVG) draws one thin line per box across four shared axes — CPU,
memory, root disk, network — so the shape of the whole fleet is one glance: a
flat line is a quiet box, a spike is a box under load. Identity comes from the
line hue, never from a status colour (two boxes can be degraded at once), and
degraded/offline are named in the key under the chart. The selected box gets
the 1 px accent line on its key entry; the readout prints all four figures;
the key entries are real links, so keyboard users do not have to click a line.

## Tests and gates

| Check | Result |
| --- | --- |
| `cd web && npm ci` | pass |
| `npm run lint` | pass, 0 problems |
| `npm test` | 5 passed |
| `npm run build` | pass (PWA precache 46 entries) |
| `npx playwright test` | 70 passed, 2 skipped (phone-only test on the three wide viewports) |
| taste-skill lint `--app web/src` | 0 FAIL, 7 WARN (unchanged from M5: mono ×3 by design, shadow ×3 on floating UI, em dashes as missing-value marks) |
| taste-skill inspect `--app` | 0 FAIL on 24 routes at 1440/768/390 |

Measured on the production build served by the demo hub (`scripts/e2e-hub.sh`,
fictional `atlas`, `beelink`, `studio`).

The inspector found one real FAIL during the pass: the retention page printed a
long data directory with `white-space: nowrap`, which pushed the phone layout
wider than the viewport (page scrolled sideways, the path sat 0 px from the
edge). Key–value rows now wrap long tokens (`overflow-wrap: anywhere`,
`min-height` instead of a fixed height) and the path breaks inside the panel.

### WARNs, defended

- **mono (×3)** — IBM Plex Mono for every figure is the approved direction; the
  inspector flags any monospace.
- **shadow (×3)** — only the dialog, the command palette and the chart readout
  carry a shadow; resting cards have none.
- **em-dash** — em dashes are the missing-value mark in tables, as in M5.
- **hero-void** (Nodes, Processes, Services, Containers, Apps, Events, Alerts,
  Rule editor, Settings ×3) — these screens are a heading plus one table on a
  fleet of three boxes; the blank band is the page below its last row, not an
  empty block inside a card.
- **no-data-hue** (CPU, memory, storage) — measured on a 240 px reduction of the
  screenshot; a 1.5 px line cannot survive that reduction, so the coloured share
  rounds to 0.0 %. The lines are coloured (blue, teal) in the render.
- **ragged-row** (Overview, About) — the attention list and the node table are
  independent lists; the demo hub has one finding, so the left card is short.
  Stretching the pair to one height was tried and produced a 137 px blank band
  inside the short card, which the same gate flags as `panel-void`. The card
  caps at four findings, each row 45 px, so a real fleet closes the gap.

## Leftovers (Go side, not changed)

1. **Series allowlist.** `handleSeries` validates against the alert-metric list
   (`metricNames`), so `net_rx`, `net_tx`, `disk_r` and `disk_w` answer 400 while
   `disk`, `inode` and `temp` pass the route and fail in the store (500). The
   store already keeps all of them. The network and disk-throughput curves come
   back with one line in `internal/hub/api.go` plus the matching `seriesMetrics`
   entries; `web/src/lib/metrics.ts` lists what the UI asks for today.
2. **Rollups cover only old windows.** `Rollup()` fills `samples_1m` from raw
   rows older than 48 h and `samples_1h` from 1 m rows older than 30 d, then
   deletes the raw rows. `Series()` reads raw only at step ≤ 5 s (the 1 h range),
   so every longer range reads a rollup table that has nothing recent: 6 h, 24 h
   and 7 d are empty by construction. The UI defaults to 1 h and says why in the
   note. Overlapping rollup windows, or reading raw for windows inside 48 h,
   fixes it.
