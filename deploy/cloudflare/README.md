# Cloudflare

## What can run on Cloudflare

| Component | Runs on Workers? | Why |
| --- | --- | --- |
| Static PWA (`web/dist`) | **yes** | Workers Assets, SPA fallback; no server code |
| Bolthole relay | **yes** | the `bolthole` repo ships a Worker with a Durable Object per agent (separate project) |
| Hub (`cupola hub`) | no | Go binary with SQLite, a long-lived poller and a persistent key; needs a VM/box or Docker (or Cloudflare Containers, not used here) |
| Agent (`cupola agent`) | no | reads `/proc`, `/sys`, systemd, Docker socket, SMART/NVML of a real host |

## Static PWA (deployed)

```bash
cd web && VITE_BASE=/ npm run build
npx wrangler deploy --config ../deploy/cloudflare/wrangler.jsonc
```

`wrangler.jsonc` declares Assets with `not_found_handling: single-page-application`
and **no route**: the Worker lives at `https://cupola.<account>.workers.dev`. A
custom domain is added only when the operator supplies the exact zone and the
two-digit subdomain; then add a `routes` entry and a DNS record, and remove them
again when done.

Deployed 2026-11-01: `https://cupola.abcdlsj.workers.dev` (version id recorded
by wrangler; not committed).

The static build has no hub baked in: on first load it asks for the hub URL and
a read token, or accepts `#hub=…&token=…` (stored in localStorage, stripped from
the address bar). The hub must allow the Worker origin in `CUPOLA_CORS_ORIGINS`.
Actions need a token with `actions:run` and agent `allow_api: true`.

## Relay

```bash
git clone https://github.com/abcdlsj/bolthole && cd bolthole
npx wrangler deploy          # prints the relay URL
# optional: npx wrangler secret put BOLTHOLE_KEYS
```

Then point the agent at it (`relay.url` in `agent.json`), start the agent, and
give the printed connection string to the hub (`transport: bolthole`, `conn`).
Nothing listens on an inbound port. See Bolthole's `docs/deploy.md`.

## Note on `workers.dev`

On the network used for this deployment `*.workers.dev` resolves to poisoned
addresses (public DoH returns different answers) and connections to Cloudflare's
anycast IPs time out, so the deployed URL could not be loaded from that machine
even though the upload succeeded. Bind a custom domain, or open it from another
network, to verify.
