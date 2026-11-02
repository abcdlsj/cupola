# Cupola v1 acceptance

Date: 2026-11-01. Scope: PLAN §16 milestones M1–M5. M0 was approved earlier.

## Commands and results

```text
go vet ./...                                  pass
go test ./...                                 pass (cmd, agent, collect, hub, store, version)
CGO_ENABLED=0 go build ./cmd/cupola           pass
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 build   pass
cd web && npm ci                              pass
cd web && npm run lint                        pass (0 errors)
cd web && npm test                            pass (5 unit tests)
cd web && npm run build                       pass
cd web && npx playwright test                 pass (62 passed, 2 skipped (64 total))
node .../lint.mjs --app web/src               0 FAIL, 8 WARN (defended)
node .../inspect.mjs --app <17 screens>       0 FAIL at 1440/768/390; WARNs defended
```

## Acceptance criteria

| Criterion | State | Evidence |
| --- | --- | --- |
| One command starts a hub, one binary an agent | pass | `cupola hub`, `cupola agent`; `cupola serve` embedded agent |
| 3 nodes, 24 h history, processes, AI agents, services, containers, ports | pass | demo hub + seeded 24 h; live macOS and beelink snapshots |
| Remote action tile runs a configured script/WOL | pass | UI run + API run; WOL packet verified on beelink (102 bytes) |
| Curl token can trigger only allowed actions; audit exists | pass | `actions:run` + allowlist; 403 on mismatch; `action_runs` row and event |
| Event webhook rule fires and can be tested | pass | local webhook received test + fired rule with `X-Cupola-Signature` |
| Every object/view has a URL; copy link; back/forward | pass | routes for every tab, detail and setting; Playwright covers navigation |
| PWA installs on iOS/Android; offline shows last state | partial | installable manifest/SW and offline banner verified in WebKit/Chromium; not installed on a physical phone |
| Push mode needs no inbound port; pull keeps actions | implemented | `internal/hub/ingest.go` + `internal/agent/push.go`; sequence replay rejected, action run on a push node returns 409 |
| Docker compose and systemd documented and tested | documented only | files added; no Docker daemon here, systemd units not installed on a real host |
| taste-skill inspect 0 FAIL at 390/768/1440 | pass | 17 screens; `hero-void`/`no-data-hue` WARNs defended below |
| Go tests, frontend tests and build pass | pass | above |

## Security review

- No shell, no user arguments, fixed scripts; process-group kill on timeout.
- Agent loopback-only unless `allow_remote`; constant-time token compare.
- Admin password Argon2id; session HMAC; tokens hashed with scopes, allowlists,
  expiry; login and action rate limits; CSRF on cookie writes.
- Webhooks: SSRF guard on resolved addresses (private, loopback, link-local,
  CGNAT, ULA), no redirects, 5 s timeout, HMAC signature, encrypted at rest.
- Node tokens, webhook URLs and channel secrets encrypted with AES-256-GCM;
  node tokens are also indexed by SHA-256 so ingest can resolve a node without
  scanning. The hub key is 0600 in the data directory.
- Secrets are never logged; error messages from agents are reduced to a reason
  and do not include hosts or addresses.
- The public repository contains no real hosts, IPs, tokens, account IDs or
  database files; screenshots use fictional nodes only.

### Defended taste-skill WARNs

- `no-data-hue` on `/nodes/:id` and the metric tabs: the dealt sheet sets the
  main series in `--chart-1` white and spends the accent on the 1 px selection
  line, the range underline and the event marker.
- `hero-void` on `/nodes` (three nodes), the App tab (two actions) and
  `/settings/nodes` in a read-only token session (the add form is admin-only):
  the page ends where its data ends; richer fleets fill it.
- Lint: `mono` (every figure is IBM Plex Mono by design), `shadow` (dialog,
  tooltip and chart readout only) and em dashes (the missing-value mark).

## Known limitations

1. SMART, full port ownership and container stats need root/group access; the
   beelink verification ran without sudo, so SMART was empty.
2. NVIDIA metrics require a cgo build with NVML; the default release is
   CGO_ENABLED=0 and reports no NVIDIA GPU.
3. Fans are not reported (gopsutil 4.26 exposes temperatures only).
4. A static PWA build is wired but not deployed from here; it reaches the hub
   over HTTPS with a read token. There is no relay transport by design.
5. Docker images were not built (no daemon); Cloudflare was not deployed (no
   zone/subdomain given).
6. The macOS agent is a development target: no systemd, ports, SMART, updates,
   PSI or container metrics without a Docker socket.
