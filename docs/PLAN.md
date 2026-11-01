# Cupola — build plan

Status: approved for implementation. This document is the source of truth for
scope, architecture and design. Work happens on `main`; do not create feature
branches or worktrees.

## 1. Product

Cupola is a self-hosted monitor for Linux fleets: VPSes, homelab boxes, Raspberry
Pis and the machine under the desk. One small agent per host, one hub, and a
fast PWA.

It must be:

- **simpler than a full observability stack** — no Prometheus, Grafana,
  Kubernetes or external database;
- **deeper than a status page** — processes, AI agent sessions, systemd units,
  containers, ports, sensors, SMART, GPU, pressure stalls;
- **better on a phone than most dashboards** — installable PWA, iOS-safe
  layout, touch-first tables, offline last-known state;
- **usable without a public server** — Bolthole relay is a first-class
  deployment, not an add-on;
- **read-only by default** — the only write action is an explicitly configured
  local script, never an arbitrary shell.

Non-goals for v1: multi-tenant SaaS, RBAC, APM, log search, tracing, synthetic
browser checks, Kubernetes operator, Windows/macOS agents (best effort for
development only), arbitrary remote command execution.

## 2. Architecture

### 2.1 Roles

| Command | Runs on | Responsibility | State |
| --- | --- | --- | --- |
| `cupola agent` | every monitored host | collect metrics, serve a read-only local API, run configured actions | none (in-memory) |
| `cupola hub` | one box / VPS / homelab | poll agents, store history, evaluate alerts, serve API + PWA | SQLite + config |
| `cupola serve` | one box | hub with an embedded local agent | SQLite + config |

One binary, three subcommands. Packages are split by role; Docker images use
the same binary with different entrypoints.

### 2.2 Transport: pull, with two dialers

The hub **pulls** each agent. Agents do not need to know where the hub is.

```
hub ── direct HTTP ──────────────▶ agent   (LAN / VPN / public VPS)
hub ── Bolthole client ──▶ relay ──▶ agent (NAT, CGNAT, homelab)
```

- `internal/transport.Dialer` returns an HTTP client; implementations `direct`
  and `bolthole` (Go client).
- Node transports (URL or connection string, including tokens/codes) are
  encrypted at rest with a hub key.
- The agent serves loopback HTTP plus an optional Bolthole exposure.

Pull wins because the agent stays stateless, the hub controls cadence/backoff,
and onboarding is “paste a connection string into the hub”.

### 2.3 Dashboard transport

One PWA, two API clients behind one interface:

- `HttpApiClient` — same-origin when the hub serves the UI, or any HTTPS hub.
- `BoltholeApiClient` — the `bolthole` npm package, for a hub that only exposes
  itself through a relay. The connection string lives in the URL fragment.

Deployment follows:

1. **Self-hosted:** hub on a VPS/homelab with HTTPS; PWA served by the hub.
2. **Relay:** hub anywhere, exposed via Bolthole; static PWA on GitHub Pages
   connects with the dashboard connection string. No inbound port, no public
   server.

The same PWA build is used in both cases.

### 2.4 Deployment matrix

| Mode | Hub | Agents | Dashboard | Public server? |
| --- | --- | --- | --- | --- |
| VPS / Docker | Docker, public HTTPS | direct or relay | hub URL | yes |
| Homelab + relay | `cupola hub --relay` | `cupola agent --relay` | static PWA + code | no |
| All-in-one | `cupola serve` | embedded | localhost or relay | optional |
| LAN only | `cupola hub` | direct HTTP | `http://hub:8080` | no |

## 3. Metric collection: use libraries

Do not hand-roll `/proc` parsing except where a library does not cover the
need. The dependency budget is deliberate; these are the chosen libraries.

| Area | Library | Use |
| --- | --- | --- |
| CPU, memory, disks, network, host, users, sensors | `github.com/shirou/gopsutil/v4` | the base collector; cross-platform, widely used |
| Linux detail: PSI, netdev, diskstats, conntrack, fd, mounts | `github.com/prometheus/procfs` | pressure stalls, counters, kernel detail |
| Hardware inventory | `github.com/jaypipes/ghw` | CPU model, memory modules, block/NIC/PCI/GPU inventory; optional, cached |
| NIC link speed/duplex/driver | `github.com/safchain/ethtool` | link state and speed |
| systemd units + journal | `github.com/coreos/go-systemd/v22` | D-Bus unit state, failed units, journal events (failed SSH logins) |
| Docker / Podman | `github.com/docker/docker/client` + `api/types` | official client over the unix socket; Podman via its Docker-compatible socket |
| NVIDIA GPU | `github.com/NVIDIA/go-nvml` | utilization, VRAM, temperature, per-process GPU memory |
| AMD GPU | sysfs `/sys/class/drm`, hwmon | best effort; no stable Go library |
| SMART / NVMe health | `github.com/anatol/smart.go` | ATA/NVMe health, temperature, wear; fallback to `smartctl --json` for USB/SAS |
| SQLite | `modernc.org/sqlite` | pure Go, no CGO |
| Password hashing | `golang.org/x/crypto/argon2` | admin password |
| Relay | `github.com/abcdlsj/bolthole` | agent exposure and hub dialer |
| Process enumeration | `gopsutil/process` + `procfs` | process list; `procfs` only for cgroup/port mapping |
| AI agent detection | small in-repo registry | no library exists; parse `cmdline`/`exe` basename |
| Pending updates | `apt`/`dnf` exec, cached | no reliable cross-distro library; opt-in |
| Wake-on-LAN | tiny in-repo packet builder | 102-byte magic packet; no dependency needed |

Rules:

- Wrap each library behind a `collector` interface with a fixture-backed test.
- If a library is slow, cache its result at a slower cadence; do not fork it.
- Build tags for optional collectors (`docker`, `nvml`, `smart`) if binary size
  or CGO becomes a problem; default build includes Docker and NVIDIA on Linux.
- Do not add the Docker SDK to the hub; only the agent uses it.
- No `node_exporter` vendoring; it is not a library.

## 4. Collectors and features

Linux-first. macOS builds for local development with reduced collectors.

| Group | Cadence | Detail |
| --- | --- | --- |
| host | 6 h | distro, kernel, arch, virt, boot time, uptime, CPU model |
| cpu | 5 s | total/per-core, user/system/iowait/steal, frequency, load 1/5/15 |
| memory | 5 s | used/available/cached/buffers, swap, OOM kills |
| pressure | 5 s | PSI cpu/memory/io some/full |
| disk | 5 s | per mount usage/inodes; read/write Bps, IOPS, latency |
| network | 5 s | per interface rx/tx, errors/drops; retransmits, conntrack |
| processes | 5 s | top by CPU/RAM/IO, full list on demand, cgroups |
| AI agents | 5 s | detection registry below |
| ports | 15 s | listening sockets → inode → pid → cgroup → service/container |
| systemd | 15 s | state, enabled, restarts, failed units |
| containers | 15 s | state, image, uptime, CPU/RAM, restarts |
| sensors | 30 s | temperatures, fans, voltages |
| GPU | 15 s | NVIDIA via NVML; AMD sysfs; per-process VRAM |
| SMART | 5 min | health, temperature, wear, reallocated sectors |
| updates | 6 h | apt/dnf pending count, opt-in |
| users | 30 s | logged-in sessions |

Also: file descriptor count, inode usage, TCP retransmits, listen backlog,
disk fill prediction (linear fit over 7 days), and a **changes timeline**
(reboots, failed units, container restarts, new listening ports, threshold
crossings).

### 4.1 AI agent roster

Embedded registry maps process patterns to a display name and category:

| Display | Match | Category |
| --- | --- | --- |
| Codex | `codex` | coding agent |
| Claude Code | `claude`, `claude-code` | coding agent |
| Cursor Agent | `cursor-agent` | coding agent |
| Aider | `aider` | coding agent |
| OpenCode | `opencode` | coding agent |
| Gemini CLI | `gemini` | coding agent |
| Pi | `pi` with agent args | coding agent |
| Goose | `goose` | coding agent |
| Cline / Roo / Continue | known binaries | coding agent |
| Ollama | `ollama`, runner | model server |
| llama.cpp | `llama-server`, `llama-cli` | model server |
| vLLM | `vllm` | model server |
| ComfyUI | `comfyui`, ComfyUI `main.py` cwd | model server |

Per session: type, pid, CPU%, RSS, start time, runtime, project directory
basename, tty, parent chain, container/service. Command arguments after a safe
prefix are redacted by default. Never read env, prompts or file contents.

**Icons:** use the preset agent marks from Warren, copied to
`web/public/agents/` and rendered as monochrome CSS masks at 16 px. Source:
`warren/Packages/WarrenIOS/Sources/WarrenIOS/Resources/PresetIcons.xcassets`
(Codex, Claude, Pi, OpenCode, Qoder, Antigravity, Trae, shell, zsh). Missing
marks get a neutral terminal glyph and the type name; do not invent brand
logos. Record provenance and trademark attribution in `docs/ASSETS.md`.

## 5. Remote actions / apps

A node can expose **actions**: small, preconfigured local scripts or built-in
Wake-on-LAN, presented as a grid of clickable app tiles. The primary use is
waking another LAN machine from a phone.

### 5.1 Definition (agent-side only)

```yaml
actions:
  - id: wake-desk
    name: Wake desk
    description: Wake the Windows PC in the study
    icon: wake                  # built-in slug, or an uploaded raster on the hub
    type: wol
    mac: "AA:BB:CC:DD:EE:FF"
    broadcast: 192.168.1.255
    allow_api: true

  - id: backup-now
    name: Backup now
    description: Run the nightly restic job
    icon: backup
    type: script
    script: /usr/local/lib/cupola/backup.sh
    timeout: 60s
    danger: false
    allow_api: false
```

- Actions are defined **only** in the agent config (root-owned, mode 0600) or
  via a local agent admin command. The hub cannot create or edit scripts.
- `type: script` executes the file directly with `exec.CommandContext`, no
  shell, no user-supplied arguments, a fixed working directory and a scrubbed
  environment. `type: wol` builds a magic packet; no script required.
- The agent advertises only id, name, description, icon, danger, `allow_api`,
  last run and never the script path, MAC or secrets.
- Concurrency: one run per action per node. Timeout capped at 60 s. Output
  captured up to 8 KiB; the rest discarded and marked truncated.
- Results are events: actor, token name, source, exit code, duration, output
  (optional, truncated), never in application logs.

### 5.2 UI

- **Apps** tab on each node and a compact app strip on the overview.
- Tile: icon, name, one-line description, last run/status. Click → confirmation
  sheet naming node + action → run → result sheet with exit code, duration and
  output. `danger: true` requires typing the action name.
- Built-in icon set (wake, power, restart, backup, docker, update, terminal,
  shield, disk, network) plus custom icons: PNG/WebP only, max 256×256 and
  256 KiB, stored under the hub data dir. No SVG upload (XSS); sanitize and
  re-encode.
- URL route: `/nodes/:nodeId/apps/:actionId`.

### 5.3 Curl API

Only a small, explicit write surface is token-callable.

- API tokens have scopes: `read`, `actions:run`; optional node and action
  allowlists; expiry; revocable; hashed at rest; shown once.
- `POST /api/v1/nodes/{id}/actions/{action}/run` requires `actions:run`, the
  action’s `allow_api: true`, and a matching allowlist. No other writes are
  exposed in v1 (no config, delete, kill, or shell).
- Synchronous result by default (timeout ≤ 60 s), JSON with `ok`, `exit_code`,
  `stdout`, `stderr`, `duration_ms`, `run_id`. Rate limit per token/action.
- Every call writes an audit event with token name, source IP, node, action,
  result. Never log the token.
- Example:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $CUPOLA_TOKEN" \
  https://hub.example.com/api/v1/nodes/homelab/actions/wake-desk/run
```

## 6. URL router

Every object and view is addressable, copyable and shareable. No state that
matters lives only in component memory.

```
/                                   overview
/nodes                              fleet list
/nodes/:nodeId                      node overview
/nodes/:nodeId/cpu|memory|storage|network
/nodes/:nodeId/processes[/:pid]
/nodes/:nodeId/agents[/:sessionId]
/nodes/:nodeId/services[/:unit]
/nodes/:nodeId/containers[/:containerId]
/nodes/:nodeId/apps[/:actionId]
/nodes/:nodeId/events
/alerts                             active + history
/alerts/rules/:ruleId
/events[/:eventId]
/settings/nodes|alerts|tokens|retention|appearance|about
```

- Query state: `?range=1h&from=&to=&q=&sort=&filter=`.
- Tabs are links, not local state; detail views are routes, not unaddressable
  modals. Browser back/forward must work, including iOS edge-swipe.
- A copy-link action on every detail header and table row; links preserve the
  time range and filters.
- Node IDs are stable short IDs; names are a display slug only. Encoded IDs
  (`unit`, `containerId`) must round-trip through `encodeURIComponent`.
- Deep links to a missing/renamed object show a “not found” state with a link
  back to the fleet, not a blank page.

## 7. Alerts and events

### 7.1 Rules

- Metric threshold: CPU, memory, disk %, inode %, load, temperature, PSI.
- Node offline; process missing; systemd unit not active; container not
  running; SMART unhealthy; disk fill prediction.
- **Event rule (new):** match event kind(s), severity and optional node; notify
  a webhook. Users can add their own alert from the Events page or Alerts page.
- Duration, cooldown, resolve notification, maintenance window (v1.1).

### 7.2 Channels

- Generic webhook (URL, optional HMAC secret, custom headers limited to safe
  names), ntfy, Discord, Slack, Telegram.
- **User-added webhook links:** create from Events → “Alert me about this” or
  Alerts → New rule → Event. Choose event kinds/severity/node, paste the
  webhook URL, optional signing secret, test delivery.
- Webhook payload is stable JSON: event id/kind/severity/node/message/time and
  a hub link. Signature header `X-Cupola-Signature: sha256=…` over the raw
  body when a secret is set. 5 s timeout; 3 retries with backoff; delivery
  status stored.
- SSRF guard: block loopback/link-local/private IP targets unless the hub
  operator explicitly sets `CUPOLA_ALLOW_PRIVATE_WEBHOOKS=1`; resolve DNS and
  check all addresses; no redirects followed.
- Secrets encrypted at rest; webhook URLs are secrets (they can contain keys);
  never log the full URL.

## 8. Data model and storage

SQLite (pure Go), WAL, one writer, batched inserts, embedded migrations.

- `nodes`: id, name, labels, transport (encrypted), agent version, os, kernel,
  arch, created_at, last_seen, status.
- `samples`: node_id, ts, cpu fields, memory fields, load, net/disk rates,
  procs, uptime, pressure.
- `disk_samples`, `net_samples`; `process_samples` (top N).
- `events`: node_id, ts, kind, severity, message, meta JSON.
- `alerts`, `alert_rules` (including event rules), `alert_deliveries`.
- `actions`, `action_runs` (metadata + truncated output).
- `sessions`, `api_tokens` (hashed, scopes, allowlists), `settings`.

Retention: raw 5 s for 48 h; 1 m rollups for 30 d; 1 h rollups for 13 months.
Events and action runs keep 90 d. Query step chosen from range and pixel width;
long ranges return min/avg/max.

## 9. API sketch

Agent (bearer): `/healthz`, `/v1/snapshot`, `/v1/processes`, `/v1/agents`,
`/v1/services`, `/v1/containers`, `/v1/ports`, `/v1/actions`,
`POST /v1/actions/{id}/run`, `/v1/events?since=`, `/v1/stream`.

Hub (bearer): `/api/v1/auth/login|me`, `/fleet/summary`, `/nodes` CRUD + test,
`/nodes/{id}/snapshot|series|processes|agents|services|containers|ports|events|actions`,
`/nodes/{id}/actions/{action}/run`, `/events`, `/alerts`, `/alerts/rules`,
`/alerts/deliveries`, `/alerts/test`, `/tokens`, `/stream` (SSE).

JSON, Unix milliseconds, units labeled, errors `{error:{code,message}}`.

## 10. UI / UX

### 10.1 Direction: data terminal

Chosen from the taste-skill app drawer (seed `956138436`, style
`data-terminal`, theme dark, kind `markets`). It is a monitoring screen read in
long sessions: dense, monochrome numbers, colour only on data and status, and
every selection marked by the same 1 px accent line. This replaces the earlier
cream-paper/ink direction, which is explicitly rejected as AI slop.

Full sheet and tokens: `docs/DESIGN.md` and `docs/design/direction.json`.

- Ground `#171719`, surface `#131217`, raised `#212023`, border `#222224`,
  rule `#1b1a1f`, text `#fff`, muted `#8a8c92`, accent `#4a8ad6`.
- Status: positive `#44a282`, negative `#e5566f`, warning `#d9a441`; pale
  tint/dark text pills.
- Radius: cards 6 px, controls pill (999 px); one shadow only for floating
  menus/dialogs. No card shadow.
- Type: Public Sans for UI, IBM Plex Mono for **all figures, timestamps and
  IDs**; tabular, right-aligned in tables. Sizes 26/20/20/13/12. This is the
  style’s deliberate mono decision; the taste-skill inspector will flag mono —
  defend it in the report.
- Shell: 50–60 px icon rail on desktop with the Cupola mark, 48 px top bar,
  dense 42 px table rows, 24 px gap, 32 px page padding. Phone: bottom bar of
  four destinations + labels; the rail disappears.
- Selection: 1 px accent line exactly as wide as the label, on the nearest
  edge; no filled pill tabs, no coloured segmented controls.
- Charts: one hue per chart; chart-1 white/ink, chart-2 negative red, chart-3
  accent blue; 3–5 faint gridlines, no y-axis line, no legend for one series,
  straight 2 px lines, no gradients, no point markers, no chart animation.
- No emoji, no gradients, no glass, no glow, no icons in tinted squares, no
  sparklines on KPIs, no rainbow charts, no uppercase tracked headers, no
  zebra rows.
- KPI values 20 px at 400–500, not 48 px; the biggest figure answers the
  screen’s question.

**Signature element (only Cupola): the fleet horizon.** On the overview, one
full-width band with one vertical mark per node on a common baseline; height is
live CPU/load pressure, a 1 px accent line marks the selected node, status
colour only for degraded/offline, labels on hover/tap, click routes to the
node. It is the first thing read and answers “is anything wrong?”. The node
count, the finding sentence and the app action sit beside it.

**Agent roster** is the second signature: Warren’s monochrome marks at 16 px,
grouped by type, with session counts, aggregate CPU/RAM and runtime. No tinted
icon squares.

### 10.2 Screens

1. **Overview:** fleet horizon; finding line; attention list (failed units,
   disks > 85%, offline nodes, recent restarts, new ports); node table with
   CPU/mem/disk/net; recent events; app strip.
2. **Nodes:** filterable table; status, OS, uptime, load, memory, disk,
   last seen; row links.
3. **Node detail:** header (name, status, IP, OS, kernel, uptime, labels,
   actions); tabs Overview / CPU / Memory / Storage / Network / Processes /
   Agents / Services / Containers / Apps / Events; URL-addressable tabs.
4. **Processes:** search, sort, filter; PID, PPID, user, CPU, RSS, IO,
   threads, started, command; expand for cwd/cgroup/container/ports; redact
   args by default; read-only.
5. **Agents:** type cards + session table; pid, project, runtime, CPU, RAM,
   tty, parent; empty state explains detection.
6. **Services / Containers:** state, restarts, memory; failed filter.
7. **Apps:** action tiles; run/confirm/result; custom icon upload.
8. **Events:** timeline, filters; “Alert me about this” → webhook rule.
9. **Alerts:** active/history, rule editor (metric/event), channels, test.
10. **Settings:** nodes, tokens (scopes/allowlists), retention, appearance,
    about, export.

### 10.3 Phone / PWA

- 390×844 first; bottom bar, 16–20 px margins, 44 px targets, no hover-only
  controls, no horizontal page scroll; tables become two-line rows, fields
  move to line 2 and are never dropped.
- One row of controls above a chart; tabs scroll in their own row.
- `dvh`, `viewport-fit=cover`, safe-area padding; iOS install sheet (Share →
  Add to Home Screen); standalone detection.
- PWA: manifest, shell precache, network-first API, last-known snapshot in
  IndexedDB, explicit offline banner with last-updated time. No Web Push in v1.
- Test WebKit iPhone, Chromium Pixel, iPad, desktop; screenshot each.

### 10.4 Design gate

The implementing agent must read `docs/DESIGN.md`, then run:

```bash
node /tmp/taste-skill/skills/taste-skill/scripts/lint.mjs --app web/src
node /tmp/taste-skill/skills/taste-skill/scripts/inspect.mjs --app http://localhost:5173
```

(Clone the skill to `/tmp/taste-skill` with the codeload tarball if it is not
there.) 0 FAIL at 1440, 768 and 390 on the **production build**; fix WARNs or
defend each in the report. Look at every screenshot; do not report without
looking.

## 11. Stack

- Go 1.25+; `net/http`; `slog`; `embed`; SQLite `modernc.org/sqlite`.
- React 19 + TypeScript + Vite + Tailwind v4 + uPlot (custom theme, no
  defaults) + Radix primitives + Phosphor icons + TanStack Query + React Router
  + Zod; `vite-plugin-pwa`.
- Fonts self-hosted: Public Sans + IBM Plex Mono.
- Tests: Go fixtures, `httptest`, Vitest, Playwright (Chromium + WebKit),
  axe; taste-skill inspect gate.

## 12. Repository layout

```
cmd/cupola/                 main, subcommands
internal/
  agent/                    lifecycle, API, auth, actions
    collect/                one file per collector
    linux/                  only where libraries do not cover
  hub/                      poller, API, auth, alerts, actions proxy, store
    store/                  schema, migrations, rollups
  model/                    shared types
  transport/                direct + bolthole dialers
  version/
web/
  src/{app,features,components,lib,styles}
  public/agents/            Warren preset marks + attribution
deploy/                     Dockerfiles, compose, systemd
docs/
  PLAN.md  DESIGN.md  API.md  DEPLOY.md  ASSETS.md
  design/direction.json
.github/workflows/          ci, release, pages
```

## 13. Deployment

- Docker multi-arch (`amd64`, `arm64`): hub distroless non-root; agent slim
  Debian with smartmontools, host mounts (`/proc`, `/sys`, `/etc/os-release`,
  `/etc/passwd`, `/etc/group`, optional Docker socket), `pid: host`.
- systemd units for hub and agent; agent needs read access to `/proc` and
  optional capabilities for SMART/NVML.
- GitHub Releases static binaries; install script with checksum.
- Relay quick start: `cupola agent --relay …` prints a connection string;
  `cupola hub --relay …` prints a dashboard link; static PWA connects with the
  code in the fragment.
- PWA static build deployed to GitHub Pages; hub embeds the same build.

## 14. Security and repository hygiene

- Agent loopback-only by default; bearer token; constant-time compare.
- Hub bearer tokens, hashed; Argon2id admin password; rate limits; CSP; HSTS;
  CORS allowlist.
- Actions: no shell, no user input, fixed scripts, confirmation for dangerous
  actions, one run at a time, audit events.
- Webhooks: SSRF guard, HMAC, retries, secrets encrypted, full URL never
  logged.
- No remote process kill or service restart in v1.
- Never commit: tokens, connection strings, Cloudflare credentials/account IDs,
  SSH hosts/users/keys, real hostnames/IPs, database files, `.env`, screenshots
  with real data.
- Use fake data in tests/screenshots (`atlas`, `beelink`, `studio`) unless a
  real hostname is essential; then redact before committing.
- `.env.example` only; secrets via environment or files with mode 0600.
- Before every push: `git status`, `git diff --cached`, search for secrets,
  confirm no `node_modules`, no `*.db`, no `.wrangler/`.

## 15. Verification

1. `go test ./...`, `go vet ./...`; frontend lint/test/build.
2. Local: hub + agent on macOS with reduced collectors; UI at 390/768/1440.
3. **Linux host `beelink`** over SSH: build `linux/amd64`, install agent, run a
   hub locally or on the host; verify CPU/mem/disk/net/PSI/processes/AI roster/
   systemd/containers/sensors/SMART/GPU as available; install the PWA on a
   phone and test over relay.
4. Relay: local Bolthole relay first; then optionally Cloudflare Worker.
5. **Cloudflare Worker:** allowed, but the route constraint is ambiguous
   (“2 个纯数字域名”). Ask the user for the exact zone and two-digit
   subdomain before creating a route. Prefer `wrangler dev`; if deployed,
   delete the Worker, route and DNS record afterwards. Never commit
   `wrangler.toml` account IDs, API tokens or `.dev.vars`.
6. WOL: if the target LAN and MAC are available, verify wake end-to-end; do not
   commit the MAC/broadcast.

## 16. Milestones

| Milestone | Deliverable | Estimate |
| --- | --- | --- |
| M0 | Scaffold, design tokens, shell, fleet horizon, Overview/Node/Agents/Apps screens with fake data; taste-skill inspect; screenshots for approval | 2 d |
| M1 | Agent: gopsutil/procfs/ghw collectors, processes, agents, actions, API, tests | 3 d |
| M2 | Hub: SQLite, poller, history API, events, auth/tokens, URL routes | 3 d |
| M3 | UI: all screens, charts, processes, agents, apps, mobile/PWA | 4 d |
| M4 | Services/containers/ports/sensors/GPU/SMART, alerts + webhook event rules, action audit | 3 d |
| M5 | Relay, Docker, systemd, GitHub Pages, docs, Linux/beelink verification | 2 d |

M0 is approved. The user asked for continuous delivery: implement M1–M5 end to
end without intermediate approval, then a single unified acceptance. Each
milestone still ends with tests and a commit; do not stop for milestone review.
Keep `/nodes` as the table (option A).

### Acceptance

- One command starts a hub; one binary starts an agent.
- 3 nodes, 24 h history, processes, AI agents, services, containers, ports.
- Remote action tile runs a configured script/WOL; curl token can trigger only
  allowed actions; audit event exists.
- Event webhook rule fires and can be tested.
- Every object/view has a URL; copy link works; back/forward works on iOS.
- PWA installs on iOS Safari and Android Chrome; offline shows last state.
- Relay mode works with no inbound ports.
- Docker compose and systemd units documented and tested.
- Taste-skill `inspect --app`: 0 FAIL at 390/768/1440.
- `go test ./...`, frontend tests and build pass.

## 17. Open items

1. Cloudflare exact zone and two-digit subdomain (ask before deploy).
2. Whether to add light theme after M0; v1 is dark data-terminal.
3. Additional agent brand marks beyond Warren’s preset set (only with a
   licensed/sourceable mark; otherwise neutral fallback).
