# Cupola — project instructions

Read `docs/PLAN.md` first. It is the source of truth for scope, architecture
and visual direction. Do not expand scope silently; update the plan when a
decision changes.

## Status

Design phase. The first implementation task is **M0**: scaffold and three
static screens with fake data, then stop for visual approval. Do not build the
whole backend before the UI direction is approved.

## Language

- Code, comments, commit messages, docs, UI copy: English.
- Conversation with the user: Chinese.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`), short and factual.

## Milestones

Work milestone by milestone (`M0`…`M5`). At the end of each:

1. Run the tests and build.
2. Commit the result.
3. Report what changed, with screenshots for UI milestones.
4. Stop for review. Do not chain milestones without approval.

## Tech choices

- Go 1.25+; single binary; `net/http`; `slog`; `embed`.
- Linux-first collectors; macOS builds only for development.
- SQLite via `modernc.org/sqlite`; hand-written SQL; embedded migrations.
- React 19 + TypeScript + Vite + Tailwind v4 + uPlot.
- Radix primitives only (unstyled); no shadcn defaults, no MUI/Ant/Chakra.
- TanStack Query for REST; SSE for live data; IndexedDB for offline cache.
- Phosphor icons; IBM Plex Sans/Mono self-hosted.
- Bolthole (`github.com/abcdlsj/bolthole`, npm `bolthole`) for relay transport.

Justify every dependency before adding it. Prefer the standard library.

## Commands

After M0, keep these working (adjust in README if the layout changes):

```bash
go test ./...                 # Go tests
go vet ./...
cd web && npm ci
cd web && npm run lint
cd web && npm test
cd web && npm run build
cd web && npx playwright test # screenshots + flows
```

## UI rules (non-negotiable)

The UI is a precision instrument, not a landing page.

- No gradients, glassmorphism, glow, neon, emoji icons, stock illustrations,
  fake charts or lorem ipsum.
- No default component-library look. Build custom primitives with tokens.
- One accent color; green/amber/red only for status.
- 1 px hairlines, 4–6 px radii, almost no shadow.
- Tabular numerals; values must not shift layout when they update.
- Charts: line/step, no smoothed marketing curves, no gradient fills;
  dashed thresholds; shared crosshair; no animation on live ticks.
- Motion 120–160 ms ease-out; respect `prefers-reduced-motion`.
- Dark mode is designed, not inverted.
- Every empty state says what to do next; skeletons for loads > 150 ms.
- Read-only by default; no destructive actions in v1.

Before calling a UI task done:

- Test 390×844 (WebKit/iPhone), 768×1024, 1440×900.
- Check safe-area insets, bottom nav, sticky headers, horizontal table scroll.
- Keyboard: command palette, focus rings, escape, URL state.
- Contrast WCAG AA; no hover-only controls on touch.
- Lighthouse PWA: installable, offline shell, no third-party runtime requests.

## Mobile / PWA rules

- `viewport-fit=cover`, `dvh` not `vh`, safe-area padding.
- 44 px minimum touch targets; no hover-only affordances.
- Bottom nav on mobile; node tabs scroll horizontally with a sticky header.
- Service worker: shell precache, network-first API, last-known snapshot in
  IndexedDB, explicit offline banner with timestamp.
- iOS meta tags and Apple touch icon; install sheet for Safari.
- No Web Push in v1.

## Backend rules

- Agent is read-only, stateless, loopback-only by default, bearer-token auth.
- Never execute shell commands from an HTTP request.
- Never collect environment variables, file contents or prompts.
- Redact command-line arguments by default.
- Treat Bolthole codes and agent tokens as passwords: never log them, store
  node transports encrypted.
- Agent targets: < 30 MB RSS, < 1% CPU at 5 s cadence on a 4-core box.
- Hub targets: < 150 MB RSS for 50 nodes, 13 months of rollups.
- Use the minimal Docker/Podman HTTP API over the unix socket; do not add the
  Docker SDK.
- systemd via D-Bus, fallback to `systemctl show`; never require it on macOS.

## Data rules

- SQLite WAL; one writer; batched inserts; migrations embedded and versioned.
- Raw 5 s samples for 48 h; 1 m rollups for 30 d; 1 h rollups for 13 months.
- Events are first-class: online/offline, reboot, failed unit, container
  restart, new listening port, threshold crossings.
- All timestamps Unix milliseconds; units labeled in the API.

## Security

- HTTPS/HSTS for public hubs; CSP with no inline scripts; CORS allowlist.
- Bearer tokens, hashed at rest; Argon2id for the admin password; rate limits.
- Docker socket is opt-in and documented as root-equivalent.
- No telemetry, no accounts, no third-party runtime assets.

## Handoff

When starting a fresh session:

1. Read `AGENTS.md`, `docs/PLAN.md` and the current git log.
2. Check the last milestone and its report.
3. Continue at the next milestone only; do not redo completed work.
4. Commit after each green test run.
