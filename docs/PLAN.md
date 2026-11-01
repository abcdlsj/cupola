# Cupola — build plan

Status: awaiting approval. This document is the source of truth for scope,
architecture and UI direction.

## 1. Positioning

Cupola is a Linux fleet monitor for people who run 1–50 boxes and want to
know, in one glance, whether anything is wrong.

- **Simpler than a full observability stack.** No Prometheus, Grafana,
  Kubernetes or external database.
- **Deeper than a status page.** Processes, AI agent sessions, systemd units,
  containers, ports, sensors, SMART, GPU, pressure stalls.
- **Better on a phone than most dashboards.** Installable PWA, iOS-safe
  layout, touch-first tables, offline last-known state.
- **No public server required.** Bolthole relay mode is a first-class
  deployment, not an afterthought.
- **Read-only.** Monitoring must not become a remote shell.

Non-goals: multi-tenant SaaS, RBAC, APM, log search, tracing, synthetic
browser checks, Kubernetes operator, Windows/macOS agents (best effort for
development only).

## 2. Product principles

1. One question per screen. Overview answers “is anything wrong?”; a node page
   answers “what is wrong?”; a process/agent page answers “who is doing it?”.
2. Dense, not cluttered. Every pixel earns its place; no decorative cards.
3. Read-only by default. Destructive actions are opt-in and never in v1.
4. Small agent. Static Go binary, no runtime deps, < 30 MB RSS, < 1% CPU.
5. Works without the relay. The relay is an optional transport, not a
   dependency.
6. No accounts, no telemetry, no third-party scripts, no web fonts fetched at
   runtime.
7. Data stays yours. SQLite in a directory you choose.

## 3. Architecture

### 3.1 Roles

| Binary / command | Responsibility | State |
| --- | --- | --- |
| `cupola agent` | collect host metrics, serve read-only HTTP API | none (in-memory) |
| `cupola hub` | poll agents, store history, evaluate alerts, serve API + PWA | SQLite + config |
| `cupola serve` | hub with an embedded local agent | SQLite + config |

A single binary, three subcommands. Code is split into packages, not into
separate repositories. Docker images use the same binary with different
entrypoints.

### 3.2 Transport: pull, with two dialers

The hub **pulls** each agent every 5 seconds. Agents do not need to know where
the hub is, and a hub restart does not require agent restarts.

```
hub ── direct HTTP ──────────────▶ agent   (LAN / VPN / public VPS)
hub ── Bolthole client ──▶ relay ──▶ agent (NAT, CGNAT, homelab)
```

- `internal/transport.Dialer` abstracts `HTTPClient()`; implementations:
  `direct` (plain `*http.Client`) and `bolthole` (Bolthole Go client).
- The hub stores each node’s transport descriptor (URL or connection string)
  encrypted at rest.
- The agent can serve both at once: loopback HTTP for the local hub, plus an
  optional Bolthole exposure for a remote hub.

Pull wins over push because:
- the agent stays stateless and independent;
- the hub controls cadence, backoff and history;
- the same agent API can later be used by a browser in “lite” mode;
- onboarding is “paste a connection string into the hub”, not “edit every
  agent’s config”.

### 3.3 Dashboard transport

The PWA has two API clients behind one interface:

- `HttpApiClient`: same-origin fetch when the hub serves the UI, or any hub
  base URL over HTTPS.
- `BoltholeApiClient`: uses the `bolthole` npm package to reach a hub that
  only exposes itself through a relay. The connection string lives in the URL
  fragment and never reaches the relay.

Two deployment paths follow:

1. **Self-hosted:** hub on a VPS/homelab with HTTPS. PWA served by the hub at
   `https://hub.example.com`.
2. **Relay:** hub runs anywhere, exposes itself via Bolthole, prints a
   dashboard connection string. PWA is hosted statically (GitHub Pages) and
   connects with that string. No inbound port, no public server.

The same PWA build is used in both cases. The static build is the canonical
one; the hub embeds it for convenience.

### 3.4 Deployment matrix

| Mode | Hub | Agents | Dashboard | Public server? |
| --- | --- | --- | --- | --- |
| VPS / Docker | Docker, public HTTPS | direct or relay | hub URL | yes |
| Homelab + relay | `cupola hub --relay` | `cupola agent --relay` | static PWA + code | no |
| All-in-one | `cupola serve` | embedded | localhost or relay | optional |
| LAN only | `cupola hub` | direct HTTP | `http://hub:8080` | no |

## 4. Data model and storage

SQLite (pure-Go `modernc.org/sqlite`), WAL mode, one writer goroutine, batched
inserts. No ORM; hand-written SQL and migrations embedded in the binary.

### 4.1 Tables

- `nodes`: id, name, labels, transport (encrypted), agent version, os, kernel,
  arch, created_at, last_seen, status.
- `samples`: node_id, ts, cpu, cpu_user, cpu_system, cpu_iowait, cpu_steal,
  mem_total, mem_used, mem_available, mem_cached, swap_used, load1/5/15,
  net_rx_bps, net_tx_bps, disk_read_bps, disk_write_bps, procs, uptime,
  pressure_cpu/mem/io.
- `disk_samples`: node_id, ts, mount, used, total, inodes_used, inodes_total,
  read_bps, write_bps, iops, latency_ms.
- `net_samples`: node_id, ts, iface, rx_bps, tx_bps, errors, drops.
- `process_samples` (optional, top N): node_id, ts, pid, name, cpu, rss.
- `events`: node_id, ts, kind, severity, message, meta (JSON).
- `alerts`: id, rule_id, node_id, state, first_seen, last_seen, resolved_at,
  value, message.
- `alert_rules`: id, name, kind, target, condition (JSON), duration, cooldown,
  channels (JSON), enabled.
- `sessions`: opaque bearer tokens for the UI (hashed), expires_at.
- `settings`: admin hash, secret key metadata, retention.

### 4.2 Rollups and retention

- raw: 5s samples, 48 h.
- 1m: min/avg/max, 30 d.
- 1h: min/avg/max, 13 months.
- Background aggregator runs every minute; retention prunes in batches.
- Query API chooses a step from range and pixel width; returns min/avg/max for
  long ranges, raw for short ones.

### 4.3 Events

Recorded, not just derived:
- node online/offline, first seen;
- reboot / uptime reset;
- collector errors;
- systemd unit entered failed state;
- container restarted / died;
- new listening port (diff against previous scan);
- disk usage crossed 80/90/95%;
- alert fired/resolved;
- agent version changed.

The UI shows “what changed”, which is usually more useful than another chart.

## 5. Agent collectors

Linux-first. macOS builds for local development, with reduced collectors.

| Group | Source | Cadence |
| --- | --- | --- |
| host | `/etc/os-release`, uname, DMI, virt, boot time | 6 h |
| cpu | gopsutil + `/proc/stat`, per-core, freq, steal/iowait | 5 s |
| memory | gopsutil + `/proc/meminfo`, swap, available/cached | 5 s |
| pressure | `/proc/pressure/{cpu,memory,io}` | 5 s |
| disk | `/proc/diskstats`, `/proc/mounts`, statfs | 5 s |
| network | `/proc/net/dev`, `/proc/net/tcp*`, retransmits | 5 s |
| processes | `/proc/*/{stat,status,cmdline,cwd,io,fd}`, cgroup | 5 s |
| AI agents | process scan + registry | 5 s |
| ports | `/proc/net/tcp*` inode → pid | 15 s |
| systemd | D-Bus, fallback `systemctl show --output=json` | 15 s |
| containers | Docker/Podman HTTP API over unix socket | 15 s |
| sensors | gopsutil sensors, `/sys/class/hwmon` | 30 s |
| GPU | `nvidia-smi --query-*`, amdgpu hwmon | 15 s |
| SMART | `smartctl --json` (optional) | 5 min |
| updates | apt/dnf check, cached (optional) | 6 h |
| users | utmp / gopsutil | 30 s |

Feature highlights:
- **Pressure stalls (PSI)** alongside CPU/iowait/steal.
- **Disk fill prediction** from a linear fit over 7 days.
- **Port → process → cgroup → service/container** mapping.
- **GPU per process** (NVIDIA first; AMD sysfs best effort).
- **SMART** health, temperature, reallocated sectors, NVMe wear.
- **Systemd restart counts** and failed units.
- **Container CPU/RAM/restarts** without the Docker SDK (minimal API client).
- **Pending updates** (apt/dnf) with a cached, opt-in check.
- **Failed SSH logins** (journal) as an optional security signal, v1.1.

### 5.1 AI agent detection

A small registry (YAML embedded, later user-extensible) maps process patterns
to a display name and category:

| Display | Match (basename / argv) | Category |
| --- | --- | --- |
| Codex | `codex` | coding agent |
| Claude Code | `claude`, `claude-code` | coding agent |
| Cursor Agent | `cursor-agent` | coding agent |
| Aider | `aider` | coding agent |
| OpenCode | `opencode` | coding agent |
| Gemini CLI | `gemini` | coding agent |
| Pi | `pi` (with agent-specific args only) | coding agent |
| Goose | `goose` | coding agent |
| Cline / Roo / Continue | known binary names | coding agent |
| Ollama | `ollama`, `ollama runner` | model server |
| llama.cpp | `llama-server`, `llama-cli` | model server |
| vLLM | `vllm` | model server |
| ComfyUI | `comfyui`, `main.py` with ComfyUI cwd | model server |

Per session: type, pid, CPU%, RSS, start time, runtime, cwd basename, tty,
parent chain, container/service. Arguments after a safe prefix are redacted by
default. Never read environment variables, file contents or prompts.

Aggregated view: sessions per type, total CPU/RAM, longest running, “agent
started/stopped” events.

### 5.2 Agent API

Bound to `127.0.0.1:45876` by default, bearer token required (except
`/healthz`).

```
GET /healthz
GET /v1/snapshot          # host, cpu, mem, disks, nets, psi, sensors, gpu,
                          # top processes, agents, services/containers summary
GET /v1/processes?sort=cpu|mem|io&limit=&q=
GET /v1/agents
GET /v1/services
GET /v1/containers
GET /v1/ports
GET /v1/events?since=
GET /v1/stream            # SSE, 1 Hz live values (optional)
```

Expensive collectors are separated so the hub can poll them less often. The
snapshot is always cheap enough for 5 s cadence on a 1-core VPS.

## 6. Hub

### 6.1 Poller

- Per-node goroutine with jitter, exponential backoff (1s → 5m), timeout 10s.
- Fast poll (snapshot + top processes) every 5 s.
- Medium poll (services, containers, ports) every 15 s.
- Slow poll (SMART, sensors, GPU, inventory) every 1–5 min.
- On failure: mark degraded after 2 misses, offline after 6; emit events.
- Coalesce writes; never block the UI on disk.

### 6.2 Alert engine

- Evaluate every 10 s.
- Rule kinds: metric threshold, node offline, process missing, systemd unit
  not active, container not running, SMART unhealthy, disk fill prediction.
- Duration + cooldown; resolve notifications; maintenance windows (v1.1).
- Channels v1: generic webhook, ntfy, Discord, Slack, Telegram.
- Test button in UI; last delivery status stored.
- No email in v1 (SMTP is a v1.1 candidate).

### 6.3 API

```
POST /api/v1/auth/login          -> {token}
GET  /api/v1/auth/me
GET  /api/v1/fleet/summary
GET  /api/v1/nodes
POST /api/v1/nodes               {name, transport}
PATCH/DELETE /api/v1/nodes/{id}
POST /api/v1/nodes/{id}/test
GET  /api/v1/nodes/{id}/snapshot
GET  /api/v1/nodes/{id}/series?metrics=cpu,mem&from=&to=&step=
GET  /api/v1/nodes/{id}/processes
GET  /api/v1/nodes/{id}/agents
GET  /api/v1/nodes/{id}/services
GET  /api/v1/nodes/{id}/containers
GET  /api/v1/nodes/{id}/ports
GET  /api/v1/nodes/{id}/events
GET  /api/v1/events
GET  /api/v1/alerts
GET/POST/PATCH/DELETE /api/v1/alerts/rules
POST /api/v1/alerts/test
GET  /api/v1/stream              # SSE fleet updates
```

- JSON, Unix milliseconds, binary units labeled (`bytes`, `bps`, `°C`).
- Bearer token auth; opaque tokens hashed at rest; 30-day expiry, revocable.
- CORS allowlist for the static PWA origin; no cookies, so no CSRF surface.
- Rate limit login and node creation.

### 6.4 Auth and secrets

- First run: generate admin password, print once to the console, force change
  in the UI. Argon2id hash.
- Agent tokens: generated by the agent, stored `0600`; included in the
  connection string.
- Node transports (including agent tokens and Bolthole codes) encrypted with
  a hub secret key stored `0600` (`/var/lib/cupola/secret.key`), or supplied
  via `CUPOLA_SECRET`.
- Never log tokens, codes or full command lines.

## 7. UI / UX

### 7.1 Direction: precision instrument, paper and ink

References: Beszel’s restraint, Linear’s typography and keyboard feel,
Stripe’s data tables, btop’s information density, Braun/Teenage Engineering
instrument panels. Not a landing page. Not a generic admin template.

Hard rules (also in `AGENTS.md`):
- No gradients, glassmorphism, neon glow, emoji icons, stock illustrations.
- No default shadcn look, no purple, no giant rounded cards.
- One accent color; status colors only for status.
- 1 px hairlines, 4–6 px radii, almost no shadow.
- Tabular numerals everywhere; values never shift layout.
- Charts are line/step, not smoothed marketing curves; no gradient fills.
- Motion 120–160 ms, ease-out; no chart animation on live ticks.
- Every empty state says what to do next; every loading state is a skeleton.
- Dark mode is designed, not inverted.

### 7.2 Tokens

Light:

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#F5F2EC` | page |
| `--surface` | `#FBFAF7` | cards, tables |
| `--ink` | `#161616` | primary text |
| `--muted` | `#6F6A61` | secondary text |
| `--line` | `#DED8CC` | borders, grid |
| `--accent` | `#D9480F` | selection, links, primary action |
| `--ok` | `#2F7D4F` | healthy |
| `--warn` | `#B7791F` | warning |
| `--crit` | `#C0392B` | critical |
| `--info` | `#2563A8` | informational |

Dark:

| Token | Value |
| --- | --- |
| `--bg` | `#0F100F` |
| `--surface` | `#171817` |
| `--ink` | `#ECE9E2` |
| `--muted` | `#928C81` |
| `--line` | `#2A2B28` |
| `--accent` | `#FF6B3D` |
| `--ok` | `#5DBB84` |
| `--warn` | `#E0A44A` |
| `--crit` | `#F06A5E` |
| `--info` | `#6FA8DC` |

Type: IBM Plex Sans (UI) + IBM Plex Mono (numbers, IDs, commands), self-hosted
and subset. 13 px UI base, 12 px tables, 28–32 px metric values, 11 px labels
with 0.04em tracking. `font-variant-numeric: tabular-nums`.

Grid: 8 px base; page padding 20/24/32 px at mobile/tablet/desktop; max content
width 1440 px.

Icons: Phosphor, 1.5 px stroke, 16/18 px. Logo: a simple dome/cupola mark
(semicircle + slit), monochrome SVG; wordmark in Plex Mono.

### 7.3 Layout

Desktop (≥ 1200 px): 232 px left rail with fleet, nodes, alerts, settings;
sticky top bar (breadcrumb, time range, live toggle, command palette); content
grid 12 columns.

Tablet (768–1199): rail collapses to icons + labels on hover.

Mobile (< 768): top app bar (node name, status, overflow) + bottom nav
(Overview, Nodes, Alerts, More); node tabs horizontally scrollable with a
sticky header; tables become stacked cards; safe-area insets; 44 px targets;
no hover-only controls; charts full width.

### 7.4 Screens

1. **Overview**
   - Fleet strip: nodes online, active alerts, average CPU, total network.
   - Node cards: name, status dot, OS/kernel, uptime, four sparklines
     (CPU, memory, disk, network), top alert badge.
   - “Needs attention” list: failed units, disks > 85%, offline nodes,
     restarts, new ports.
   - Recent events.

2. **Node detail**
   - Header: name, status, IP, OS, kernel, uptime, labels, actions
     (pause, edit, delete).
   - Tabs: Overview, CPU, Memory, Storage, Network, Processes, Agents,
     Services, Containers, Events.
   - Overview: six metric tiles, four charts, top processes, agent roster,
     services summary.
   - Charts: shared crosshair, threshold lines, min/max band for long ranges,
     annotations for events.

3. **Processes**
   - Search, sort, filter (all / AI agents / services / containers / listening).
   - Columns: PID, PPID, user, CPU%, RSS, I/O, threads, started, command.
   - Expand row: cwd, cgroup, container, service, open port count, parent.
   - “Redact arguments” toggle, on by default.
   - Read-only in v1. No kill button.

4. **Agents**
   - Cards per type: sessions, total CPU/RAM, longest runtime.
   - Session table: pid, project, runtime, CPU, RAM, tty, parent.
   - Empty state explains what is detected and how to add patterns (v1.1).

5. **Services / Containers**
   - systemd units: state, enabled, restarts, memory.
   - Containers: state, image, uptime, CPU, RAM, restarts.
   - Filter: failed / running / all.

6. **Events**
   - Timeline with severity and node filter; jump to node/metric.

7. **Alerts**
   - Active alerts, history, rule editor, channels, test delivery.

8. **Settings**
   - Nodes (add/test/remove), retention, auth, appearance, API tokens,
     export, about.

### 7.5 Interaction

- Command palette `⌘K` / `Ctrl+K`: jump to node, tab, range, theme.
- Shortcuts: `g o` overview, `g n` nodes, `/` search, `r` refresh, `?` help.
- URL state for node, tab, range, filters.
- Live/pause toggle; “last updated 2s ago”; offline badge.
- Optimistic UI for settings; error toasts with retry.
- No spinners for sub-300 ms loads; skeletons with hairline blocks.
- Accessibility: WCAG AA, visible focus, semantic tables, `prefers-reduced-motion`,
  no live-region spam for charts.

### 7.6 PWA / iOS

- `manifest.webmanifest`: standalone, `start_url=/`, scope `/`, theme/background
  matching paper/ink, 192/512/1024 icons + maskable.
- Service worker: precache app shell; runtime cache static assets; network-first
  API with last-known snapshot fallback in IndexedDB; explicit offline banner
  with last-updated time.
- iOS: `apple-mobile-web-app-capable`, `viewport-fit=cover`, `dvh` not `vh`,
  safe-area padding, `apple-touch-icon`, status bar style, no 100vh traps,
  bottom nav above the home indicator, install instructions sheet
  (Share → Add to Home Screen), standalone detection.
- Test matrix: Safari iOS (WebKit) 390×844, Chrome Android 393×873, iPad
  820×1180, desktop 1440×900.
- Web Push: not v1. In-app alert badge + ntfy integration first.

## 8. Frontend stack

- React 19 + TypeScript + Vite.
- Tailwind CSS v4 with CSS variables; no component library defaults. Radix
  primitives (unstyled) for dialog, popover, tabs, tooltip, switch.
- uPlot for time series; custom SVG sparklines.
- TanStack Query for REST; SSE for live values; IndexedDB for offline cache.
- React Router; Zod for API boundaries.
- `vite-plugin-pwa` for manifest/service worker.
- Phosphor icons; IBM Plex fonts self-hosted.
- Tests: Vitest + Testing Library; Playwright (Chromium + WebKit) for flows and
  screenshots at the three breakpoints; axe for accessibility.

Budget: initial JS < 220 KB gzip, fonts < 120 KB, LCP < 1.5 s on LAN,
CLS < 0.02, no runtime font/CDN requests.

## 9. Backend stack

- Go 1.25+, single static binary. `net/http` with Go 1.22 route patterns;
  `slog`; `embed` for the PWA.
- `gopsutil/v4` for cross-platform basics; `prometheus/procfs` and sysfs for
  Linux detail.
- Minimal Docker/Podman API client over unix socket (no Docker SDK).
- systemd via `coreos/go-systemd/v22` D-Bus, fallback to `systemctl`.
- SQLite via `modernc.org/sqlite`; hand-written SQL; embedded migrations.
- Bolthole Go client/agent for relay transport.
- Argon2id for the admin password; opaque session tokens.
- Tests: collector fixtures under `testdata/proc`, store tests, API tests with
  `httptest`, an optional Linux integration test.

## 10. Repository layout

```
cmd/cupola/                 main, subcommands
internal/
  agent/                    agent lifecycle, API, auth
    collect/                one file per collector
    linux/                  /proc, /sys parsers
  hub/                      poller, API, auth, alerts, store
    store/                  schema, migrations, rollups
  model/                    shared types
  transport/                direct + bolthole dialers
  version/
web/
  src/
    app/                    routes, shell, providers
    features/               overview, node, processes, agents, alerts, settings
    components/             custom primitives, charts, tables
    lib/                    api clients, format, hooks
    styles/                 tokens, base, utilities
  public/                   icons, manifest, offline page
deploy/
  Dockerfile.hub
  Dockerfile.agent
  docker-compose.yml
  systemd/
docs/
  PLAN.md
  API.md
  DEPLOY.md
  DESIGN.md
.github/workflows/          ci, release, pages
```

## 11. Deployment

### 11.1 Docker (hub + agent)

- Multi-arch images `linux/amd64`, `linux/arm64`.
- Hub: distroless/static, non-root, volume `/var/lib/cupola`, port 8080.
- Agent: slim Debian with `smartmontools` and `ca-certificates`; host mounts:
  `/proc`, `/sys`, `/etc/os-release`, `/etc/passwd`, `/etc/group`,
  optional `/var/run/docker.sock:ro`; `pid: host` for host process view;
  `CUPOLA_PROC_ROOT=/host/proc`, `CUPOLA_SYS_ROOT=/host/sys`.
- Compose example starts hub + local agent; remote agents use the same image.
- Document that systemd binary mode gives the best fidelity; container mode is
  convenient but needs host mounts and root.

### 11.2 Binary / systemd

- GitHub Releases: static `cupola` for amd64/arm64.
- `cupola agent` and `cupola hub` systemd units with hardening
  (`ProtectSystem=strict`, `ReadOnlyPaths`, `NoNewPrivileges` where possible;
  agent needs `/proc` read).
- Install script optional; checksum + signature.

### 11.3 Relay quick start

```
# on a monitored box
cupola agent --relay wss://relay.example --code-file /var/lib/cupola/agent.code
# prints a cupola:// connection string

# on the hub box (homelab, no public port)
cupola hub --relay wss://relay.example --code-file /var/lib/cupola/hub.code
# prints a dashboard link: https://app.example/#c=...
```

Paste agent connection strings into the hub UI. The relay only sees ciphertext
and timing/size metadata.

## 12. Security

- Threat model: relay untrusted; agent host trusted; hub is the trust boundary.
- Agent API loopback-only by default; bearer token; constant-time compare.
- Hub over HTTPS in public mode; HSTS; CSP with no inline scripts; CORS
  allowlist.
- No remote command execution in v1. Process kill / service restart is a
  separate opt-in feature with explicit confirmation and audit events.
- Command-line redaction by default; never collect environment variables.
- Node secrets encrypted at rest; never logged.
- Docker socket access is opt-in and documented as root-equivalent.
- Dependency hygiene: pinned versions, `go vet`, `govulncheck`, `npm audit`,
  no postinstall scripts.
- Rate limit login, node creation and agent auth failures.

## 13. Testing and quality gates

- `go test ./...` on Linux; `go vet`; `staticcheck` (optional).
- Collector tests use fixture `/proc` and `/sys` trees; no root required.
- API tests with `httptest`; store tests with temp SQLite.
- Frontend: `npm run lint`, `npm test`, `npm run build`.
- Playwright: overview, node, agents, alerts; iPhone 13 (WebKit), Pixel 7
  (Chromium), iPad, desktop; screenshot diff for visual review.
- Lighthouse PWA: installable, offline shell, performance ≥ 95 on desktop,
  ≥ 90 on mobile.
- Manual: install on a real Debian/Ubuntu VM and a Docker host.

## 14. Milestones

| Milestone | Deliverable | Estimate |
| --- | --- | --- |
| M0 | Scaffold, design tokens, three static screens with fake data; screenshots for approval | 1–2 d |
| M1 | Agent: host/cpu/mem/disk/net/psi/processes/agents + API + tests | 2–3 d |
| M2 | Hub: SQLite, poller, history API, events, auth | 2–3 d |
| M3 | UI: overview, node, charts, processes, agents, mobile/PWA | 3–4 d |
| M4 | Services, containers, ports, sensors, GPU, SMART, alerts/channels | 2–3 d |
| M5 | Relay transport, Docker, systemd, docs, release | 2 d |

MVP is M0–M3 (~8 working days). Full v1 is ~12–17 days for one focused agent.
Each milestone ends with a reviewable build, tests and a screenshot; do not
build all milestones in one pass.

### M0 acceptance

- Three screens (Overview, Node, Agents) at 390×844, 768×1024 and 1440×900.
- Light and dark tokens.
- No placeholder lorem, no gradients, no default component-library look.
- User approves the visual direction before backend work starts.

### v1 acceptance

- One command starts a hub; one binary starts an agent.
- Metrics and history for at least 3 nodes; 24 h of data.
- Processes + AI agents + services + containers visible.
- Alerts fire to webhook/ntfy and resolve.
- PWA installs on iOS Safari and Android Chrome; offline shows last state.
- Relay mode works with no inbound ports.
- Docker compose and systemd units documented and tested.
- `go test ./...` and frontend tests pass.

## 15. Open decisions

1. **Name:** Cupola (repo created). Confirm or rename before first release.
2. **Visibility:** repository is private for now; make public at M3/M5.
3. **Frontend:** React + Vite + Tailwind + uPlot (chosen for handoff
   reliability). Confirm if Svelte is preferred.
4. **v1 scope:** include services/containers/GPU/SMART in v1 (M4) or ship MVP
   without them.
5. **Relay dashboard:** static PWA on GitHub Pages + Bolthole connection
   string. Confirm.
6. **Alert channels:** webhook, ntfy, Discord, Slack, Telegram in v1; email
   later.
7. **Process actions:** read-only in v1. Confirm.

## 16. Handoff protocol

The implementing agent must:

1. Read `AGENTS.md` and this document before writing code.
2. Start with M0 only; produce screenshots and stop for visual approval.
3. Work milestone by milestone, committing after each green test run.
4. Keep the agent dependency-light and the UI free of AI-slop patterns.
5. Update this document when a decision changes; do not silently expand scope.
6. Never commit secrets, database files or generated screenshots.
