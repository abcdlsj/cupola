# Cupola

**A clear view of every machine you run.**

Cupola is self-hosted monitoring for Linux fleets: VPSes, homelab boxes,
Raspberry Pis and the occasional 2014 ThinkPad. One small agent per host, one
hub, and a fast PWA that feels at home on a phone.

- **Fleet, node, process, service.** CPU, memory, disk, network, pressure,
  sensors, SMART, GPU, systemd units, containers, listening ports and
  processes in one place.
- **AI agent roster.** See which Codex, Claude Code, Cursor, Aider, OpenCode
  or model servers are running, for how long, and what they cost in CPU/RAM.
- **No public server required.** Run the hub at home and reach it through a
  [Bolthole](https://github.com/abcdlsj/bolthole) relay: end-to-end encrypted,
  no ports opened, no accounts.
- **Or just Docker.** A hub and an agent, a volume for SQLite, done.
- **Read-only by default.** No remote shell, no command execution, no
  telemetry.

> **Status: design phase.** No application code yet. The build plan lives in
> [docs/PLAN.md](docs/PLAN.md).

## Shape

```
                    ┌──────────── public HTTPS (optional) ────────────┐
   phone / browser ─┤                                                 │
                    ▼                                                 ▼
             static PWA  ──Bolthole E2E──▶  relay  ◀──Bolthole E2E──  hub  ──HTTP/WS──▶ agents
                    │                                                 │
                    └──────────── direct HTTPS (self-hosted) ─────────┘
```

Three roles:

| Role | Runs on | Does |
| --- | --- | --- |
| `cupola agent` | every monitored host | collects metrics, serves a read-only local API |
| `cupola hub` | one box / VPS / homelab | polls agents, stores history, evaluates alerts, serves the PWA |
| `cupola serve` | one box | hub + embedded agent, for the single-server case |

## License

MIT
