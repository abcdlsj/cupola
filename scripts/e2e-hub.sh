#!/usr/bin/env bash
# Starts three fictional agents and a hub for the Playwright suite. Every host
# and figure here is fake; see docs/reports/M5.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DATA="$ROOT/.e2e-data"
BIN="$DATA/cupola"
DEMO="$DATA/demoagent"
rm -rf "$DATA"
mkdir -p "$DATA"

(cd web && npm run build)
go build -o "$BIN" ./cmd/cupola
go build -o "$DEMO" ./scripts/demoagent

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

"$DEMO" --node atlas --listen 127.0.0.1:9801 --token e2e-atlas-token >"$DATA/atlas.log" 2>&1 & pids+=($!)
"$DEMO" --node beelink --listen 127.0.0.1:9802 --token e2e-beelink-token >"$DATA/beelink.log" 2>&1 & pids+=($!)
"$DEMO" --node studio --listen 127.0.0.1:9803 --token e2e-studio-token >"$DATA/studio.log" 2>&1 & pids+=($!)

CUPOLA_ADMIN_PASSWORD=e2e-password-123 \
CUPOLA_DATA_DIR="$DATA" \
CUPOLA_LISTEN=127.0.0.1:4180 \
CUPOLA_POLL_INTERVAL=2s \
"$BIN" hub --web-dir "$ROOT/web/dist" >"$DATA/hub.log" 2>&1 & pids+=($!)

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4180/healthz >/dev/null 2>&1; then break; fi
  sleep 0.5
done

JAR="$DATA/cookies.txt"
curl -fsS -c "$JAR" -H 'Content-Type: application/json' \
  -d '{"password":"e2e-password-123"}' \
  http://127.0.0.1:4180/api/v1/auth/login >/dev/null

add_node() {
  curl -fsS -b "$JAR" -H 'Content-Type: application/json' \
    -d "{\"id\":\"$1\",\"name\":\"$1\",\"url\":\"http://127.0.0.1:$2\",\"token\":\"$3\",\"labels\":[\"$4\"]}" \
    http://127.0.0.1:4180/api/v1/nodes >/dev/null
}
add_node atlas 9801 e2e-atlas-token prod
add_node beelink 9802 e2e-beelink-token homelab
add_node studio 9803 e2e-studio-token workstation

# Wait until every node has a snapshot and the agent roster is populated, so the
# suite never races the first poll.
for _ in $(seq 1 40); do
  count=$(curl -fsS -b "$JAR" http://127.0.0.1:4180/api/v1/agents 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ' || true)
  if [ "${count:-0}" -ge 7 ]; then break; fi
  sleep 0.5
done
sleep 1
curl -fsS -X POST -H 'Authorization: Bearer e2e-beelink-token' http://127.0.0.1:9802/demo/trigger >/dev/null
curl -fsS -X POST -H 'Authorization: Bearer e2e-studio-token' http://127.0.0.1:9803/demo/trigger >/dev/null

wait
