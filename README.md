# Cupola

**A clear view of every machine you run.**

Cupola is self-hosted monitoring for Linux fleets: VPSes, homelab boxes, Raspberry
Pis and the machine under the desk. One small agent per host, one hub, and a
dense, fast PWA.

- **Fleet, node, process, service.** CPU, memory, disk, network, pressure,
  sensors, SMART, GPU, systemd units, containers, listening ports and
  processes in one place.
- **AI agent roster.** See which Codex, Claude Code, Cursor, Aider, OpenCode
  or model servers are running, for how long, and what they cost in CPU/RAM.
- **Clickable apps.** Wake a LAN machine with Wake-on-LAN or run a fixed local
  script from a phone.
- **Alerts that fit your stack.** Metric rules and event rules that POST to
  your own webhook; ntfy, Discord, Slack and Telegram too.
- **No public server required.** Run the hub at home and reach it through a
  [Bolthole](https://github.com/abcdlsj/bolthole) relay: end-to-end encrypted,
  no ports opened, no accounts.
- **Every view has a URL.** Copy and share a node, process, agent session,
  service, container, app, alert or event, with its time range intact.

> **Status: M0, the design gate.** The shell, tokens and five screens render a
> fixture snapshot; there is no agent or hub yet. The build plan is
> [docs/PLAN.md](docs/PLAN.md), the visual direction is
> [docs/DESIGN.md](docs/DESIGN.md), and the milestone report is
> [docs/reports/M0.md](docs/reports/M0.md).

## Shape

```
                    ┌──────────── public HTTPS (optional) ────────────┐
   phone / browser ─┤                                                 │
                    ▼                                                 ▼
             static PWA  ──Bolthole E2E──▶  relay  ◀──Bolthole E2E──  hub  ──HTTP/WS──▶ agents
                    │                                                 │
                    └──────────── direct HTTPS (self-hosted) ─────────┘
```

| Role | Runs on | Does |
| --- | --- | --- |
| `cupola agent` | every monitored host | collects metrics, serves a read-only local API, runs configured actions |
| `cupola hub` | one box / VPS / homelab | polls agents, stores history, evaluates alerts, serves the PWA |
| `cupola serve` | one box | hub + embedded agent, for the single-server case |

## Design

Data terminal: dark, dense, monochrome figures, colour only on data and status,
one 1 px accent line for selection. No cream-paper dashboards, gradients, glass,
emoji or icon chips. Agent marks come from Warren’s preset set. See
[docs/DESIGN.md](docs/DESIGN.md).

## Security

Read-only by default. Remote actions are fixed scripts or Wake-on-LAN packets
configured on the agent, never arbitrary shell. API tokens for automation are
scoped to read or a specific action allowlist. Webhooks are signed and guarded
against SSRF. No telemetry.

## Development

```bash
cd web && npm ci
npm run dev          # http://localhost:5173
npm run lint
npm test
npm run build        # production build and PWA in web/dist
npm run preview      # http://127.0.0.1:4173
npx playwright test  # desktop, iPad, iPhone (WebKit), Pixel (Chromium)
```

Go side (module and subcommand shell in M0):

```bash
go vet ./...
go test ./...
go build ./cmd/cupola
```

The M0 screenshots live in [docs/screenshots/m0](docs/screenshots/m0); the data
is fake. Fonts are self-hosted; no runtime third-party assets.

## License

MIT
