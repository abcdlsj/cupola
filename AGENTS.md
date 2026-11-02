# Cupola — project instructions

Read `docs/PLAN.md` and `docs/DESIGN.md` before writing code. They are the
source of truth for scope, architecture and visual direction. Do not silently
expand or shrink scope; update the plan when a decision changes.

## Status and workflow

- Development happens on **`main`**. Do not create feature branches or
  worktrees.
- The repository is **public**. Never commit secrets, tokens, connection
  strings, Cloudflare account IDs, SSH hosts/users/keys, real IPs/hostnames,
  database files or screenshots with real data.
- M0 is approved. The user asked for continuous delivery: implement `M1`–`M5`
  end to end without intermediate approval, then a single unified acceptance.
- After each milestone: run all tests and the production build, commit with a
  conventional message, and continue. Do not stop for milestone review.
- Final acceptance requires the complete v1: agent, hub, all collectors,
  actions/WOL, alerts + event webhooks, scoped curl API, URL routes, PWA,
  push mode, Docker, systemd, docs and the Linux/beelink verification.
- Keep `/nodes` as the table (option A). Do not redesign it in this pass.

## Language

- Code, comments, docs, UI copy, commits: English.
- Conversation with the user: Chinese.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`), short and factual.

## Tech choices

- Go 1.25+; single binary; `net/http`; `slog`; `embed`.
- Linux-first; macOS builds for development.
- SQLite via `modernc.org/sqlite`; hand-written SQL; embedded migrations.
- React 19 + TypeScript + Vite + Tailwind v4 + uPlot + Radix primitives +
  Phosphor icons + TanStack Query + React Router + Zod; `vite-plugin-pwa`.
- Public Sans (UI) + IBM Plex Mono (all figures/IDs), self-hosted.
- Transport is per node: `pull` (hub dials the agent) or `push` (agent posts to
  `/api/v1/ingest`). No relay dependency; see `docs/design/pull-vs-push.md`.

Justify every new dependency. Prefer the standard library.

## Metric collection: use the libraries

Do not hand-roll `/proc` parsing where a library exists.

- `github.com/shirou/gopsutil/v4` — base CPU/mem/disk/net/host/users/sensors.
- `github.com/prometheus/procfs` — PSI, netdev, diskstats, conntrack, fd,
  mounts.
- `github.com/jaypipes/ghw` — hardware inventory (cached, optional).
- `github.com/safchain/ethtool` — NIC speed/duplex/driver.
- `github.com/coreos/go-systemd/v22` — systemd D-Bus + journal.
- `github.com/docker/docker/client` — Docker/Podman over the unix socket
  (agent only).
- `github.com/NVIDIA/go-nvml` — NVIDIA GPU metrics and per-process VRAM.
- `github.com/anatol/smart.go` — SMART/NVMe; fallback `smartctl --json`.
- AI agent detection is the only custom registry (no library exists).
- WOL is a 102-byte packet; no dependency needed.
- Pending updates via apt/dnf, cached and opt-in; no reliable cross-distro
  library.

Wrap each collector behind an interface with fixture-backed tests. Cache slow
collectors. Do not vendor `node_exporter`.

## UI rules

Follow `docs/DESIGN.md` exactly: **data terminal** (dark, dense, 1 px accent
selection, monochrome numbers, colour only on data/status).

- Do not use cream-paper/ink, beige, terracotta, violet/indigo, gradients,
  glass, glow, emoji, icon chips, sparklines on KPIs, rainbow charts, zebra
  rows, uppercase tracked headers, fake charts or lorem.
- Public Sans for UI; IBM Plex Mono for every figure/timestamp/ID. Tabular.
- Cards are darker than the ground; no card shadows. The shadow is for floating
  menus/dialogs only.
- The **fleet horizon** is the signature element on the overview; build it from
  real data and make it clickable.
- Agent marks come from Warren’s `PresetIcons.xcassets`; copy to
  `web/public/agents/`, render as monochrome masks, and attribute them in
  `docs/ASSETS.md`. Missing types use a neutral glyph; do not invent brands.
- Before a UI task is done:
  - run the taste-skill app gate on the production build:
    `node /tmp/taste-skill/skills/taste-skill/scripts/lint.mjs --app web/src`
    and `.../inspect.mjs --app <url>`;
  - 0 FAIL at 1440, 768 and 390; fix or defend every WARN;
  - open every screenshot and critique it;
  - test iPhone WebKit, Pixel Chromium, iPad and desktop;
  - check safe areas, bottom bar, sticky header, tabs, table-to-row collapse;
  - keyboard: command palette, focus rings, escape, URL state;
  - WCAG AA contrast; no hover-only controls.

## URL router (required)

Every object and view has a route; nothing important lives only in memory.

```
/nodes/:nodeId/{cpu,memory,storage,network,processes,agents,services,containers,apps,events}
/nodes/:nodeId/processes/:pid
/nodes/:nodeId/agents/:sessionId
/nodes/:nodeId/services/:unit
/nodes/:nodeId/containers/:containerId
/nodes/:nodeId/apps/:actionId
/alerts /alerts/rules/:ruleId /events/:eventId
/settings/{nodes,alerts,tokens,retention,appearance,about}
```

- Tabs are links; detail views are routes, not unaddressable modals.
- URL search params carry range/from/to/q/sort/filter.
- Back/forward and iOS edge-swipe work; there is no copy-link button (removed:
  the URL is already in the address bar).
- Missing/renamed objects show a not-found state with a link back.

## Actions / apps

- Actions are defined **only** in the agent config (root-owned, 0600) or local
  admin command. The hub cannot create scripts.
- `type: script` runs a fixed executable with `exec.CommandContext`, no shell,
  no user arguments, fixed cwd, scrubbed env, timeout ≤ 60 s.
- `type: wol` builds the magic packet; no script.
- One run per action per node. Output truncated to 8 KiB. Results are events.
- UI: tile → confirmation (dangerous actions require typing the name) → result.
  Custom icons: PNG/WebP only, 256×256, ≤ 256 KiB, no SVG.
- Curl: only `POST /api/v1/nodes/{id}/actions/{action}/run`, only with an
  `actions:run` scoped token, `allow_api: true` and a matching allowlist. No
  other writes in v1. Rate limit and audit every call.
- Never log tokens, MACs, broadcast addresses or full script paths in app logs.

## Alerts / events

- Metric thresholds, node offline, process missing, systemd unit failed,
  container not running, SMART, disk fill prediction.
- **Event rules:** match event kind/severity/node and notify a webhook. Users
  can add one from the Events page (“Alert me about this”) or Alerts → New
  rule. Webhook URL is a secret; encrypt at rest.
- Webhook delivery: 5 s timeout, 3 retries, HMAC-SHA256
  `X-Cupola-Signature` when a secret is set, stable JSON, delivery status
  stored. Block private/loopback/link-local targets unless
  `CUPOLA_ALLOW_PRIVATE_WEBHOOKS=1`; resolve DNS and check all addresses; no
  redirects.
- Channels: generic webhook, ntfy, Discord, Slack, Telegram.

## Backend rules

- Agent is read-only by default, stateless, loopback-only, bearer-token auth.
- Never execute shell commands from an HTTP request.
- Never collect env vars, prompts or file contents.
- Redact command-line arguments by default.
- Treat agent tokens as passwords: never log them; store them encrypted and
  index only their SHA-256 for ingest lookups.
- Agent targets: < 30 MB RSS, < 1 % CPU at 5 s cadence on 4 cores.
- Hub targets: < 150 MB RSS for 50 nodes with 13 months of rollups.
- SQLite WAL, one writer, batched inserts; raw 5 s/48 h, 1 m/30 d, 1 h/13 mo.
- All timestamps Unix ms; units labeled in the API.

## Security and repository hygiene

- HTTPS/HSTS for public hubs; CSP with no inline scripts; CORS allowlist.
- Bearer tokens hashed at rest; Argon2id admin password; rate limits.
- Docker socket is opt-in and documented as root-equivalent.
- No telemetry, accounts or third-party runtime assets.
- Before every commit:
  - `git status` and `git diff --cached`;
  - search for tokens/secrets/IPs/hostnames;
  - confirm no `node_modules`, `*.db`, `.env`, `.wrangler/`, screenshots with
    real data.
- Use fake data in tests/screenshots (`atlas`, `beelink`, `studio`); redact
  real names before committing.

## Verification

- `go test ./...`, `go vet ./...`; frontend lint/test/build.
- Local macOS with reduced collectors.
- Linux host `beelink` over SSH: build `linux/amd64`, install the agent, run a
  hub, verify metrics/processes/agents/systemd/containers/sensors/SMART/GPU as
  available, WOL if possible.
- Push: verify an agent behind NAT reports to a public hub, that a replayed
  sequence is rejected and that an action run on a push node returns 409.
- Install the PWA on a phone.

## Commands

Keep these working after M0 (adjust README if layout changes):

```bash
go test ./...
go vet ./...
cd web && npm ci
cd web && npm run lint
cd web && npm test
cd web && npm run build
cd web && npx playwright test
```

Taste-skill gate:

```bash
node /tmp/taste-skill/skills/taste-skill/scripts/lint.mjs --app web/src
node /tmp/taste-skill/skills/taste-skill/scripts/inspect.mjs --app <url>
```

## Handoff

1. Read `AGENTS.md`, `docs/PLAN.md`, `docs/DESIGN.md`, `docs/design/direction.json`.
2. Check `git log` and the last milestone report.
3. Continue at the next milestone only; do not redo completed work.
4. Commit after each green test run.
