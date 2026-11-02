# Transport design: pull vs push

Status: implemented. Supersedes PLAN §2.2 ("pull, with two dialers") and removes
Bolthole from v1.

## 1. Decision

Collection is **per node**, chosen by reachability, not by preference:

| `mode` | Who initiates | Data | Downward calls |
| --- | --- | --- | --- |
| `pull` (default) | hub → agent | `GET /v1/snapshot` every 5 s | actions, node test, future extensions |
| `push` | agent → hub | `POST /api/v1/ingest` every 5 s | none |

- **pull**: the hub can reach the agent (same LAN, same host, VPN, port map,
  public VPS). This is the only mode that can run actions, because actions are
  a hub→agent request.
- **push**: the agent can reach the hub but not the reverse (NAT, CGNAT,
  homelab behind a consumer router, a VPS with a public hub). Data flows up
  only; the agent stays a client and needs no inbound port.
- Bolthole is deleted. Its only job was making a NATed agent reachable to a
  pulling hub; push does that with no relay, no second daemon and no
  connection-string plumbing. See §7.

## 2. Why: the deployment shapes

The hub is expected to have a public address. The phone is expected to be
anywhere. That removes the dashboard-side relay question entirely: the PWA
always talks to the hub over HTTPS, whatever network it is on.

| Shape | Hub | Agent reachable by hub? | Mode |
| --- | --- | --- | --- |
| Public hub, monitoring NATed hosts | VPS | no | push |
| Public hub, monitoring its neighbours | VPS | yes (same host/VPC/LAN) | pull |
| Homelab hub, homelab hosts | LAN | yes | pull |
| All-in-one `cupola serve` | same host | yes (loopback) | pull |

The rule: **if the hub can dial the agent, use pull; if it cannot, use push.**
No third transport is needed, and no mode is chosen to make one deployment
shape work that the other cannot.

### The one thing push gives up

An action needs a request that travels downward. For an agent behind CGNAT the
hub cannot make that request, so `push` nodes cannot run actions, and the Apps
tab is read-only for them ("reporting only; actions need a reachable pull
transport"). Documented remedies when a NATed host must run actions:

1. port-map the agent's listen port (operator's choice, one firewall rule);
2. put the hub in that LAN (`cupola hub` / `cupola serve`), phone reaches the
   public hub or the LAN hub directly;
3. join both networks with the operator's own VPN (Tailscale, WireGuard).

None of these need Cupola code. This is a deliberate trade: an operator who
wants remote actions keeps one reachable path; an operator who only wants
monitoring gets zero-config push.

## 3. Current implementation (what exists)

- `internal/hub/poller.go`: one global ticker (`CUPOLA_POLL_INTERVAL`, default
  5 s) → `pollAll` over all nodes → 8 concurrent `pollNode` → 12 s deadline →
  `fetchSnapshot` + `fetchActions` → `SaveSnapshot`, `UpdateNodeMeta`,
  `SetNodeStatus`, `diffEvents`, `evaluateMetricRules`, bus send.
- Offline detection: a `failures` counter per node; `>= 3` failures sets
  `offline` and emits a critical event. There is **no backoff** today, despite
  PLAN §2.2 claiming pull wins because "the hub controls cadence/backoff".
- `internal/agent/agent.go`: agent serves `GET /v1/snapshot` from a cache with a
  1.5 s TTL and single-flight; the snapshot is collected on demand, so the
  cadence is entirely the hub's.
- `internal/hub/transport.go`: `direct` (plain HTTP client) or `bolthole`
  (cached relay client per node, connection string decrypted from
  `nodes.conn_enc`).
- Storage: `nodes.token_enc` is the only column holding the agent token. There
  is no way to find a node by its token, which push requires.

## 4. Push design

### 4.1 Protocol

```
POST /api/v1/ingest
Authorization: Bearer <agent token>
Content-Type: application/json
Content-Encoding: gzip
X-Cupola-Seq: 4187
X-Cupola-Agent: 1.2.0
X-Cupola-Agent-Ts: 1793523007000

{"snapshot": {...}, "actions_digest": "sha256:..."}
```

Response `200 {"ok": true, "next_poll_sec": 5}`; `401` bad token; `409` stale
`seq`; `413` body over 1 MiB; `429` over the per-node rate limit.

Rules:

- **Identity comes from the token, never from the body.** The hub hashes the
  presented token, looks up `nodes.token_hash`, and takes the node id from that
  row. A body-supplied node id is ignored.
- **`seq` is monotonic per agent**, incremented per send, persisted only in
  the agent's memory. `seq <= nodes.last_seq` is dropped with `409` — this makes
  retries and replayed requests idempotent, and makes duplicate ingest
  impossible without any dedupe table.
- **Gaps are allowed and recorded.** A missing `seq` is not an error; the hub
  appends a `warnings` entry so a flaky link is visible instead of silent.
- **Timestamps**: the sample timestamp is the hub's receive time (monotonic,
  no clock trust). The agent's own clock goes into a side column only, and a
  skew over 60 s raises a `warnings` entry on the node. This keeps rollups and
  retention identical to pull.
- **No queue on the agent.** If the hub is unreachable, the pusher keeps the
  last snapshot in memory, retries on the next tick, and forgets the rest. Pull
  already loses data while the hub is down, so this is not a regression — and a
  disk-backed queue would break the "< 30 MB RSS, agent is stateless" budget.
- **Body is one snapshot**, not deltas. Deltas would be a second data model in
  both ends for a bandwidth saving that gzip already mostly captures
  (~5–15 KB per node per 5 s after compression).

### 4.2 Components

| Component | What | Rough size |
| --- | --- | --- |
| `internal/hub/store/migrations/00X_push.sql` | `nodes.mode TEXT NOT NULL DEFAULT 'pull'`, `nodes.token_hash TEXT UNIQUE`, `nodes.last_seq INTEGER NOT NULL DEFAULT 0`, `nodes.agent_ts INTEGER NOT NULL DEFAULT 0`; Go migration hook backfills `token_hash` by decrypting `token_enc` with the hub key, then drops `conn_enc` | 60 |
| `internal/agent/push.go` | `Pusher`: interval with ±10 % jitter, gzip, token auth, `seq`, in-memory last snapshot, exponential backoff 5 s → 60 s, honours `next_poll_sec` | 300 |
| `internal/hub/ingest.go` | `POST /api/v1/ingest`: token-hash lookup, size cap, rate limit (10/s per node), `seq` check, then `pipeline.processSnapshot` | 250 |
| `internal/hub/pipeline.go` | `processSnapshot(ctx, node, snap, actions)` extracted verbatim from `pollNode`: save, meta, status, offline transition, `diffEvents`, `evaluateMetricRules`, bus, health, plus the new janitor-facing offline path | 150 (moved) |
| `internal/hub/poller.go` | Only polls `mode='pull'`; adds real exponential backoff (5 s doubling to 5 min, reset on success) | −50 net |
| `internal/hub/janitor.go` | Single loop: `last_seen` older than 3 × that node's expected interval → `offline` + critical event; back → "reporting again". Replaces the `failures` map for both modes | 80 |
| `internal/hub/api.go` | `handleTestNode` branches on mode: pull = live fetch, push = report `last_seen`/status. Action run returns `409 push_mode` for push nodes | 40 |
| `internal/agent/config.go`, `cmd/cupola` | `push: {enabled, hub_url, interval}`; `--join` writes them; agent prints mode on start | 80 |
| `web/` | Node form: mode selector instead of reachability guessing; `types.ts`/`queries.ts` drop `'bolthole'`; Apps tab on a push node shows the disabled reason | 120 |

Total: **4–6 days** including fixture tests, an agent→hub integration test in
`internal/hub/ingest_test.go`, and a Playwright check for the push node's Apps
tab.

### 4.3 Invariants both modes must keep

1. One sample row per node per interval — `seq` (push) and the single-flight
   poll (pull) both guarantee it.
2. Events, alerts, rollups and SSE come from `pipeline.processSnapshot`
   only. No mode-specific copy.
3. `last_seen` is the single source of truth for "is it alive"; the poller no
   longer owns that state.
4. The hub's read API, `docs/API.md` hub section, and the PWA are unchanged.
   Push is invisible above the store.

## 5. Pull is kept, and it is the richer mode

Pull stays the default and the only mode with:

- actions (`POST /v1/actions/{id}/run`, audited, typed confirmation);
- the node **test** button (a live `GET /v1/snapshot`);
- any future downward extension: on-demand full process list, port ownership
  re-scan, tail a unit's journal, container logs — all of these are
  hub-initiated request/response and fit pull without new transport work.

The agent already serves those routes (`/v1/processes`, `/v1/agents`,
`/v1/services`, `/v1/containers`, `/v1/ports`, `/v1/stream`); today the hub
does not use them, which is why adding them later costs nothing in pull and is
impossible in push.

## 6. Rejected alternatives

| Alternative | Why not |
| --- | --- |
| Push only | Drops actions, the test button, and every future downward feature. Also forces a public hub for everyone, including LAN-only deployments. |
| Pull only (today) | Needs Bolthole for NATed agents — a relay, a second credential type (`conn_enc`), a per-node outbound session on the hub, and a dashboard client that was never written. |
| Mode by transport (`bolthole` = push, `direct` = pull) | The transport is an implementation detail; reachability is the actual fact. A port-mapped NAT host and a LAN host are both `direct` but only one has a downward path. Mode must be an explicit per-node property. |
| Long-lived connection carrying both directions | This is a custom protocol (framing, heartbeats, reconnects, backpressure) to avoid two 40-line code paths. Bolthole was that protocol, and the maintenance cost is what this document removes. |
| Long-poll / SSE subscription for event push | Cuts event latency from ~6 s to ~1 s and adds a second live channel to supervise. Nothing in the acceptance criteria needs sub-second events. Revisit only with a measured complaint. |

## 7. Removing Bolthole

Bolthole had two roles:

1. **Agent exposure** so a public hub can pull a NATed agent. Push covers this
   directly, with no relay process. **Deleted by this decision.**
2. **Hub exposure** so a PWA can reach a private hub. The hub is expected to
   have a public address, and the dashboard-side npm client was never
   implemented (`docs/reports/ACCEPTANCE.md`, known limitation 4). No user,
   no code path. **Deleted, not replaced.**

Removal list:

| File | Change |
| --- | --- |
| `go.mod` | drop `github.com/abcdlsj/bolthole` |
| `internal/hub/transport.go` | delete relay client cache, keep `direct` only (~50 lines left) |
| `internal/hub/join.go`, `internal/agent/join.go` | drop the `bolthole`/`conn` branch; join becomes "agent tells the hub who it is" and works for both modes |
| `internal/agent/config.go`, `agent.go` | drop `relay`, `--relay`, `bolthole.Expose` |
| `cmd/cupola` | drop relay flags and the connection-string banner |
| `internal/model/model.go` | `Transport` becomes `Mode` (`pull`/`push`); `conn_enc` dropped by migration |
| `web/src/data/types.ts`, `queries.ts`, `features/settings/SettingsPages.tsx` | remove the "Bolthole relay" option |
| `deploy/cloudflare/` | delete (worker/wrangler deploy for the relay) |
| `docs/PLAN.md` | rewrite §2.2, §2.3 (dashboard transport = HTTPS only), §2.4 matrix, §15.5 verification step, §16 M5 |
| `docs/API.md`, `docs/DEPLOY.md`, `README.md`, `AGENTS.md` | remove relay config and connection-string docs; add `mode` and `push` config |
| `docs/reports/ACCEPTANCE.md` | strike the relay criterion; add push acceptance |
| `scripts/demoagent/main.go` | emit a snapshot to the hub's ingest endpoint (fixture for tests) |

## 8. Effects on API, storage and the PWA

- **New public write surface**: `POST /api/v1/ingest`, bearer agent token,
  gzip, 1 MiB cap, 10/s per node, no redirects, not reachable by API tokens
  (agent tokens only). Add to `docs/API.md` as its own section and to the
  security review.
- **Storage**: 3 columns added, 1 dropped (`conn_enc`); no new table. Rollups,
  retention and `/series` are untouched.
- **PWA**: no API change. Two visible differences: the node list shows the
  mode, and a push node's Apps tab explains why it is empty. Live updates
  through SSE still work because `pipeline` publishes to the same bus.
- **Acceptance matrix**: every criterion needs a pass in both modes; "relay
  mode works with no inbound ports" becomes "push mode works with no inbound
  port on the agent and no relay process".

## 9. Open items

1. Whether `push.interval` should be settable per node from the hub
   (`next_poll_sec` already in the response) or stay agent-local in v1.
2. Whether the ingest endpoint should also accept `POST /api/v1/ingest/events`
   for agent-side events (action runs, journal hits) — cheap, but it makes
   push slightly bidirectional in spirit; not needed while push has no actions.
3. Node onboarding copy: push nodes only need "hub URL + token", so the join
   code flow becomes the primary path and manual URL entry the fallback.

## 10. As built

Deviations from the plan above, all deliberate:

- The offline janitor lives in `poller.sweepOffline` (same ticker, both modes)
  rather than a separate `janitor.go` file; `last_seen` is the only liveness
  signal and `poller.markFailure` is gone.
- The pipeline is a method on `*poller` (`pipeline.go`), because the puller also
  owns the per-node backoff state that both modes reset.
- The ingest rate limit is 10 samples/second per node, not 1: a retry burst
  after a brief hop failure is normal, and the `seq` check is the real
  duplicate guard.
- `nodes.conn_enc` is left in the schema as a dead column instead of a table
  rebuild; `mode` supersedes the old `transport` values and the migration maps
  `bolthole` rows to `push`.
- The node form keeps one field for the token; the mode selector replaces the
  old transport selector, and the URL field is disabled in push mode.
