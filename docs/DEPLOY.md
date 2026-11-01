# Deploying Cupola

One binary, three commands: `agent`, `hub`, `serve`. Linux is the target; macOS
builds for development with reduced collectors (no systemd, ports, SMART,
updates or PSI).

## Agent

```bash
cupola agent --init --node atlas --name atlas --config /etc/cupola/agent.json
```

This writes `/etc/cupola/agent.json` and `/etc/cupola/agent.token` with mode
0600 and prints the token once. The token goes into the hub when the node is
added. The agent serves loopback only unless `allow_remote` is set.

`agent.json` (JSON, undocumented fields are rejected):

```json
{
  "listen": "127.0.0.1:9797",
  "node_id": "atlas",
  "name": "atlas",
  "labels": ["prod", "vps"],
  "token_file": "/etc/cupola/agent.token",
  "allow_remote": false,
  "relay": {"url": "https://relay.example.net", "code_file": "/etc/cupola/agent.code"},
  "collect": {"updates": false, "docker": true, "smart": true, "gpu": true, "processes": 40},
  "actions": [
    {
      "id": "wake-desk",
      "name": "Wake desk",
      "description": "Send a Wake-on-LAN packet to the study PC",
      "icon": "wake",
      "type": "wol",
      "mac": "02:00:00:00:00:01",
      "broadcast": "192.0.2.255",
      "port": 9,
      "allow_api": true
    },
    {
      "id": "backup-now",
      "name": "Backup now",
      "description": "Run the nightly restic job",
      "icon": "backup",
      "type": "script",
      "script": "/usr/local/lib/cupola/backup.sh",
      "cwd": "/",
      "timeout": "60s",
      "danger": false,
      "allow_api": false
    }
  ]
}
```

Actions are defined **only** here (or by a local admin command); the hub can
never create or edit them. Scripts run directly (`exec.CommandContext`), with no
shell and no user arguments, a fixed working directory and a scrubbed
environment (PATH and LANG only). The timeout is 1–60 s; output is capped at
8 KiB and marked truncated. One run per action at a time. `wol` builds the
102-byte magic packet; no script is needed. The API advertises only id, name,
description, icon, danger and `allow_api`; script paths, MACs and broadcast
addresses never leave the host.

`allow_api: true` makes the action callable by a hub token with `actions:run`
(and a matching allowlist). Everything else is UI-only.

### Collectors and privileges

- Base metrics use gopsutil; PSI, diskstats, netdev and sockets use
  `prometheus/procfs`; link speed/driver use `safchain/ethtool`; units use
  `coreos/go-systemd`; containers use the Docker client over the socket; SMART
  uses `anatol/smart.go` with a `smartctl --json` fallback; NVIDIA GPUs use
  `NVIDIA/go-nvml` in a `linux && cgo` build, AMD GPUs are read from sysfs.
- SMART and full port ownership need root. The Docker socket is root-equivalent.
- NVIDIA metrics need a cgo build with the NVML headers; the default
  `CGO_ENABLED=0` release reports no NVIDIA GPU and no SMART through NVML-only
  hosts.
- The macOS build skips systemd, ports, SMART, updates and PSI. It is for
  development, not for production monitoring.

### systemd

```bash
install -m 0755 cupola /usr/local/bin/cupola
install -d -m 0750 -o root -g root /etc/cupola
install -m 0600 agent.json agent.token /etc/cupola/
install -m 0644 deploy/systemd/cupola-agent.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now cupola-agent
```

## Hub

```bash
CUPOLA_ADMIN_PASSWORD='a long password' \
CUPOLA_DATA_DIR=/var/lib/cupola \
CUPOLA_LISTEN=127.0.0.1:8080 \
CUPOLA_PUBLIC_URL=https://hub.example.com \
cupola hub --web-dir /usr/local/share/cupola/web
```

Environment:

| Variable | Default | Meaning |
| --- | --- | --- |
| `CUPOLA_LISTEN` | `127.0.0.1:8080` | HTTP listen address |
| `CUPOLA_DATA_DIR` | `data` | SQLite, secret key, local agent config |
| `CUPOLA_WEB_DIR` | `web/dist` | built PWA; `assisted` fallback page if missing |
| `CUPOLA_PUBLIC_URL` | — | links in webhook payloads |
| `CUPOLA_ADMIN_PASSWORD` | — | first start; re-set to rotate, then remove |
| `CUPOLA_SECRET` | generated | 32 bytes base64; encrypts tokens, relay strings, webhook URLs |
| `CUPOLA_POLL_INTERVAL` | `5s` | per-node poll cadence |
| `CUPOLA_ALLOW_PRIVATE_WEBHOOKS` | `0` | allow private webhook targets |
| `CUPOLA_CORS_ORIGINS` | — | comma-separated origins for a static PWA |

`secret.key` is generated in the data directory (0600) when `CUPOLA_SECRET` is
not set. Back it up with the database: without it, node tokens and webhook URLs
cannot be decrypted. The hub stores node tokens, Bolthole connection strings,
webhook URLs and channel secrets encrypted (AES-256-GCM); admin passwords are
Argon2id; API tokens are SHA-256 hashes.

Storage: SQLite in WAL mode, one writer. Raw 5 s samples for 48 h, 1-minute
rollups for 30 days, 1-hour rollups for 13 months, events and action runs for
90 days. Rollups run every ten minutes and use min/avg/max.

Add nodes in Settings → Nodes or:

```bash
curl -fsS -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"id":"atlas","name":"atlas","url":"http://192.0.2.5:9797","token":"<agent token>"}' \
  https://hub.example.com/api/v1/nodes
```

### All-in-one

`cupola serve` starts the hub and a local agent, registers it as `local` and
keeps its config at `<data-dir>/local-agent.json` (0600). Edit that file to add
actions, then restart.

### Hub systemd

```bash
useradd --system --home /var/lib/cupola --shell /usr/sbin/nologin cupola
install -d -m 0700 -o cupola -g cupola /var/lib/cupola
install -m 0644 deploy/systemd/cupola-hub.service /etc/systemd/system/
# /etc/cupola/hub.env (0600): CUPOLA_ADMIN_PASSWORD=..., CUPOLA_PUBLIC_URL=...
systemctl daemon-reload && systemctl enable --now cupola-hub
```

Put TLS in front (Caddy, nginx or Cloudflare). The hub sets CSP, HSTS when it
sees HTTPS, `X-Frame-Options`, `X-Content-Type-Options` and `Referrer-Policy`.

## Docker

```bash
# hub (builds the PWA in the image)
docker build -f deploy/Dockerfile.hub -t cupola-hub .
# agent
docker build -f deploy/Dockerfile.agent -t cupola-agent .
```

`deploy/docker-compose.yml` runs both. The agent container uses `pid: host` and
read-only `/proc`, `/sys`, `/etc/os-release`, `/etc/passwd`, `/etc/group` and the
Docker socket; mount the agent config and token at `/etc/cupola` (0600). The
socket is root-equivalent: remove it if you do not need container metrics.

## Relay (Bolthole)

```bash
# agent on a NATed host
cupola agent --config /etc/cupola/agent.json    # relay.url + relay.code_file set
# it prints: relay: https://relay.example.net/#k=…
```

Add the node with `"transport":"bolthole"` and the printed connection string as
`conn` (stored encrypted). No inbound port is opened. A local relay for testing:

```bash
git clone https://github.com/abcdlsj/bolthole && cd bolthole
go run ./cmd/relay      # see its README for the flag; default 127.0.0.1:8787
```

## GitHub Pages PWA

`.github/workflows/pages.yml` builds the web app with the repository base path
and deploys it. On first load the static build asks for a hub URL and a read
token (or accepts `#hub=…&token=…` in the fragment, which is stored in
localStorage and removed from the address bar). The hub must allow the Pages
origin in `CUPOLA_CORS_ORIGINS`. The token only gets `read`; actions from a
static PWA need a token with `actions:run` and agent `allow_api: true`.

## Cloudflare

What runs there: the static PWA (Workers Assets) and the Bolthole relay (a
Worker in the Bolthole repository). The hub and the agent do not: the hub needs
SQLite, a long-lived poller and a persistent key, the agent needs host access.

```bash
cd web && VITE_BASE=/ npm run build
npx wrangler deploy --config ../deploy/cloudflare/wrangler.jsonc
```

The config declares no route, so the Worker lives at
`<name>.<account>.workers.dev`; the deployed URL is recorded in
`deploy/cloudflare/README.md` (never the account ID). Add a custom domain only
with the operator's exact zone and two-digit subdomain, and remove the route and
DNS record when done. A static PWA talks to a hub over HTTPS with a read token;
set `CUPOLA_CORS_ORIGINS` to the Worker origin.

## Backups and rotation

- Copy `cupola.db*` and `secret.key` together; both are needed.
- Rotate the admin password by restarting with a new `CUPOLA_ADMIN_PASSWORD`
  (the hash is re-derived), then remove the variable.
- Revoke tokens in Settings → Tokens; they are deleted, not disabled.
- Change an agent token by editing `agent.token`, restarting the agent and
  updating the node's token in Settings → Nodes.

## Limits in v1

- No user accounts or RBAC; one admin and scoped tokens.
- No remote restart/kill; only configured scripts and WOL.
- No Web Push; alerts are in-app and in the channels you configure.
- Services/containers/ports/SMART/GPU are Linux collectors; macOS is reduced.
