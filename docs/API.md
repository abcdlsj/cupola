# Cupola API

All endpoints are JSON. Units: timestamps are Unix milliseconds, byte figures
are bytes, rates are bytes per second, percentages are 0-100, durations are
milliseconds unless the field says `_sec`.

Errors: `{"error": {"code": "...", "message": "..."}}` with 400, 401, 403, 404,
429 or 500.

## Authentication

Two identities:

1. **Admin session** — `POST /api/v1/auth/login` with `{"password": "..."}` sets an
   HttpOnly, SameSite=Lax cookie. The password is stored as Argon2id in the hub's
   SQLite; the first start needs `CUPOLA_ADMIN_PASSWORD` (at least 10 characters).
   Logins are rate limited per IP (5/minute). Writes with a cookie require a
   same-origin `Origin`/`Sec-Fetch-Site`.
2. **API token** — `Authorization: Bearer cupola_<id>_<secret>`. The secret is
   stored hashed (SHA-256) and shown once. Scopes: `read`, `actions:run`; optional
   node and action allowlists; optional expiry.

## Agent API (loopback, bearer)

The agent listens on `127.0.0.1:9797` by default. Every `/v1` route needs the
agent token from `agent.token` (0600). There is no write route except actions.

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/healthz` | `{ok, version}` (no token) |
| GET | `/v1/snapshot` | the full snapshot (see below) |
| GET | `/v1/processes` | `{ts, processes}` |
| GET | `/v1/agents` | `{ts, agents}` |
| GET | `/v1/services` | `{ts, services}` |
| GET | `/v1/containers` | `{ts, containers}` |
| GET | `/v1/ports` | `{ts, ports}` |
| GET | `/v1/actions` | `{actions}` — never script paths, MACs or broadcasts |
| POST | `/v1/actions/{id}/run` | `{run_id, exit_code, duration_ms, stdout, stderr, truncated}` |
| GET | `/v1/events?since=1h\|RFC3339` | action events kept in memory |
| GET | `/v1/stream` | SSE of those events |

### Snapshot

```json
{
  "ts": 1793523007000,
  "node": {"id": "atlas", "name": "atlas", "hostname": "atlas", "os": "linux",
            "platform": "Ubuntu 24.04.1 LTS", "kernel": "6.8.0-45-generic",
            "arch": "amd64", "virtualization": "kvm", "cpu_model": "AMD EPYC 7763",
            "cores": 2, "boot_time": 0, "uptime_sec": 3564000, "agent_version": "1.0.0",
            "labels": ["prod"]},
  "cpu": {"percent": 18.4, "per_core": [14.1, 22.5], "user": 9, "system": 4,
           "iowait": 0.3, "steal": 0, "idle": 86, "mhz": 2400,
           "load1": 0.42, "load5": 0.38, "load15": 0.31, "procs": 128},
  "memory": {"total": 4294967296, "used": 2147483648, "available": 1073741824,
              "cached": 943718400, "buffers": 0, "used_percent": 65,
              "swap_total": 2147483648, "swap_used": 104857600},
  "pressure": {"cpu": {"some": 2.1, "full": 0}, "io": {"some": 0.8, "full": 0},
                "mem": {"some": 0.4, "full": 0}},
  "disks": [{"device": "/dev/vda1", "mount": "/", "fstype": "ext4", "total": 83751862272,
              "used": 51539607552, "free": 32212254720, "used_pct": 62, "inodes": 0,
              "inodes_used": 0, "inode_pct": 21, "read_bps": 409600, "write_bps": 1228800,
              "read_iops": 12, "write_iops": 30, "latency_ms": 0.4, "read_only": false}],
  "network": [{"iface": "eth0", "up": true, "rx_bytes": 0, "tx_bytes": 0,
                "rx_bps": 1050000, "tx_bps": 397000, "speed_mbps": 1000,
                "duplex": "full", "driver": "virtio_net"}],
  "processes": [{"pid": 6741, "ppid": 1, "user": "deploy", "name": "codex",
                  "command": "codex [4 args redacted]", "cpu_percent": 12.9,
                  "rss_bytes": 536870912, "threads": 9, "started_at": 1793503985715,
                  "state": "S", "read_bps": 0, "write_bps": 0}],
  "agents": [{"id": "atlas-6741", "type": "codex", "label": "Codex",
               "category": "coding agent", "pid": 6741, "project": "relay-worker",
               "cwd": "/srv/relay-worker", "command": "codex [4 args redacted]",
               "started_at": 1793503985715, "runtime_sec": 18000,
               "cpu_percent": 12.9, "rss_bytes": 536870912, "tty": "pts/3",
               "parent": "bash"}],
  "ports": [{"proto": "tcp", "address": "0.0.0.0", "port": 443, "state": "LISTEN",
              "inode": 1234, "pid": 903, "process": "caddy"}],
  "services": [{"name": "ssh.service", "description": "OpenBSD Secure Shell server",
                 "load_state": "loaded", "active_state": "active",
                 "sub_state": "running", "enabled": "enabled", "restarts": 0}],
  "containers": [{"id": "c11a9d3e8f21", "name": "jellyfin",
                   "image": "jellyfin/jellyfin:10.10.3", "state": "running",
                   "status": "Up 3 days", "uptime_sec": 260000,
                   "cpu_percent": 12.4, "mem_bytes": 1929379840,
                   "mem_limit": 8589934592, "restarts": 0,
                   "ports": ["0.0.0.0:8096->8096/tcp"]}],
  "sensors": [{"chip": "k10temp", "label": "CPU package", "kind": "temperature",
                "value": 48, "unit": "°C"}],
  "gpus": [{"index": 0, "vendor": "nvidia", "name": "RTX 4080", "util_percent": 38,
             "mem_used": 6442450944, "mem_total": 17179869184, "temp_c": 61,
             "power_w": 120, "power_limit_w": 320,
             "processes": [{"pid": 39221, "name": "ollama", "mem_bytes": 4294967296}]}],
  "smart": [{"device": "/dev/nvme0n1", "model": "SN850X", "type": "nvme",
              "health": "passed", "temperature_c": 52, "wear_percent": 3,
              "reallocated": 0, "power_on_hours": 12400}],
  "users": [{"name": "dev", "tty": "pts/2", "host": "192.0.2.20", "started_at": 1793503985715}],
  "updates": {"manager": "apt", "pending": 12, "security": 2, "checked_at": 1793523007000},
  "fd": {"allocated": 2432, "max": 9223372036854775807, "conntrack": 184},
  "warnings": ["containers: docker socket unavailable"]
}
```

Collectors that fail add a `warnings` entry and leave their field empty; the
snapshot is never a 500 for one missing source. Command-line arguments are
replaced with `[N args redacted]`; environment variables, prompts and file
contents are never read.

## Hub API

Base path `/api/v1`. `read` covers every GET below; `actions:run` is needed only
for the action run route. Everything that writes configuration requires an admin
session.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/login`, `/auth/logout` | session cookie |
| GET | `/auth/me` | identity, mode, version, scopes |
| GET | `/fleet/summary` | `{nodes: NodeView[], updated}` |
| GET | `/nodes` | `NodeView[]` with health |
| POST | `/nodes` | `{id, name, url, token, transport, conn?, labels?}` |
| GET | `/nodes/{id}` | `NodeView` with the latest snapshot |
| PATCH | `/nodes/{id}` | name, URL, labels, token, transport |
| DELETE | `/nodes/{id}` | removes the node and its history |
| POST | `/nodes/{id}/test` | polls once and reports the result |
| GET | `/nodes/{id}/snapshot` | latest snapshot |
| GET | `/nodes/{id}/series?metric=&range=` | min/avg/max points; `range` is `1h`, `6h`, `24h`, `7d`, `30d`, `13mo`, or `from`/`to` RFC 3339 |
| GET | `/nodes/{id}/{processes,agents,services,containers,ports}` | from the latest snapshot |
| GET | `/nodes/{id}/actions` | advertised actions |
| POST | `/nodes/{id}/actions/{action}/run` | `read`+`actions:run`; agent `allow_api` and allowlists apply |
| GET | `/nodes/{id}/action-runs`, `/action-runs` | audit rows |
| GET | `/agents` | sessions from every node |
| GET | `/actions` | actions from every node |
| GET | `/events?node=&kind=&severity=&q=&since=&limit=` | newest first |
| GET | `/events/{id}` | one event |
| GET | `/alerts?state=firing` | alerts |
| GET/POST | `/alerts/rules`, `/alerts/rules/{id}` | metric and event rules |
| GET | `/alerts/deliveries?alert=` | delivery attempts |
| POST | `/alerts/test` | `{channel_id}`, sends a test alert |
| GET/POST | `/channels`, `/channels/{id}` | webhook/ntfy/Discord/Slack/Telegram |
| GET/POST | `/tokens`, `/tokens/{id}` | admin only; the secret is returned once |
| GET | `/settings` | retention, poll interval, version, data dir |
| GET | `/tailnet/peers` | other machines in the hub's tailnet; `?refresh=1` skips the 10 s cache |
| GET | `/stream` | SSE: `node`, `event`, `alert` |

### Tailnet peers

`GET /api/v1/tailnet/peers` runs `tailscale status --json` on the hub (no
shell, 3 s timeout, path from `CUPOLA_TAILSCALE_BIN`) and returns only what the
Add-a-system dialog needs. Node keys and tailnet configuration are never
returned.

```json
{"available": true, "checked_at": 1793523007000,
 "peers": [{"name": "kiosk", "ipv4": "100.101.102.103", "os": "linux",
             "online": true, "dns_name": "kiosk.tailnet-1234.ts.net"}]}
```

When Tailscale is missing, stopped or logged out, the route still answers 200
with `{"available": false, "error": "tailscale is not connected to a tailnet",
"peers": []}`. The result is cached for about 10 s; `refresh=1` forces a new
read. `POST /join/codes` accepts an optional `advertise` origin (for example
`http://100.101.102.103:9797`) and appends `--advertise` to the Linux and macOS
install commands, so the agent binds and advertises its tailnet address.

### Series

`series` returns `{node_id, metric, range, step_sec, points: [{ts, min, avg, max}]}`.
Metrics: `cpu`, `mem`, `load`, `disk`, `inode`, `temp`, `psi_cpu`, `psi_io`,
`net_rx`, `net_tx`, `disk_r`, `disk_w`. Raw 5 s samples cover 48 h, 1-minute
rollups 30 days and 1-hour rollups 13 months; the hub picks the table from the
requested range and downsamples to at most 1200 points.

### Alert rules

```json
{"name": "CPU busy", "type": "metric", "metric": "cpu", "comparator": "gt",
 "threshold": 90, "duration_sec": 120, "severity": "warning",
 "node_id": "", "channel_id": "0c4ee5f44ae6", "enabled": true, "cooldown_sec": 300}
```

```json
{"name": "A unit failed", "type": "event", "kinds": ["service", "container", "node"],
 "severity": "critical", "channel_id": "0c4ee5f44ae6", "enabled": true,
 "cooldown_sec": 300}
```

Metric rules evaluate on every poll; the condition must hold for `duration_sec`.
Event rules evaluate as events arrive, with a per-node cooldown. When a rule has
no channel it still records the alert in the app.

### Webhooks

`POST /channels` with `{name, kind, url, secret?, token?, chat_id?}`. URLs,
tokens and secrets are encrypted with the hub key (AES-256-GCM) and never logged.

Delivery: 5 s timeout, 3 attempts with backoff, no redirects, DNS resolved and
every address checked against the private/loopback/link-local/CGNAT ranges
unless `CUPOLA_ALLOW_PRIVATE_WEBHOOKS=1`. Generic webhooks send stable JSON and,
with a secret, `X-Cupola-Signature: sha256=<hex HMAC over the raw body>`.

```json
{"event": {"kind": "alert", "severity": "warning", "node": "atlas",
            "message": "CPU is 93.1 (threshold > 90.0) on atlas", "ts": 1793523007000},
 "alert": {"id": 1, "rule_id": "5f56", "state": "firing", "value": 93.1},
 "hub": "https://hub.lan"}
```

## Curl example

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $CUPOLA_TOKEN" \
  https://hub.lan/api/v1/nodes/atlas/actions/wake-desk/run
```

`actions:run` requires the action's agent config to set `allow_api: true`, the
token's action allowlist to include it (when set) and the node allowlist to
include the node (when set). The call is synchronous (60 s cap), rate limited per
token/action and audited (`action_runs`) with actor, source, exit code and
duration. The token is never logged.

## Ingest (agent → hub, push mode)

A node the hub cannot dial reports instead of being polled. Identity comes from
the agent token, never from the body.

```
POST /api/v1/ingest
Authorization: Bearer <agent token>
Content-Encoding: gzip
X-Cupola-Seq: 4187
X-Cupola-Agent-Ts: 1793523007000
X-Cupola-Agent: 1.2.0

{"snapshot": { ... }, "actions": [...]}
```

| Status | Meaning |
| --- | --- |
| 200 | stored; body `{ok, next_poll_sec}` |
| 401 | unknown or missing agent token |
| 409 | the node is not in push mode, or the sequence is not newer |
| 413 | body over 1 MiB |
| 429 | over 10 samples/second for that node |

The sample timestamp is the hub's receive time, so rollups and retention match
pull. A skew over 60 s between the agent clock and the hub clock adds a
`warnings` entry. Replaying a sequence is a no-op, which makes retries safe.
Push nodes have no action surface: `POST /nodes/{id}/actions/{a}/run` returns
409 for them.

## Modes

`NodeRecord.mode` is `pull` or `push`. A pull node needs `url`; a push node does
not. Both are created the same way (`POST /api/v1/nodes` or the join flow).
