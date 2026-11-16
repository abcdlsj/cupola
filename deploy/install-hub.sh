#!/bin/sh
# Cupola hub installer for a systemd host. Run it from the release tarball or
# let it fetch the newest release:
#   curl -fsSL https://raw.githubusercontent.com/abcdlsj/cupola/main/deploy/install-hub.sh \
#     | sudo sh -s -- --admin-password '<password>' --public-url https://hub.example.com
#
# Options:
#   --admin-password <pw>  first-start admin password (prompted when omitted and
#                          no hub.env exists yet; existing installs keep theirs)
#   --public-url <url>     links in webhook payloads
#   --listen <addr>        default 127.0.0.1:8080
#   --data-dir <dir>       default /var/lib/cupola
#   --opt-dir <dir>        binary, web/ and the upgrader's targets, default /opt/cupola
#   --conf-dir <dir>       default /etc/cupola
#   --user <name>          service account, default cupola
#   --version <ver>        release to install, default latest
#   --from <dir>           install from an unpacked release directory instead of
#                          downloading (offline hosts)
#   --units <dir>          systemd units, default <from>/deploy/systemd or the
#                          same path in the release tag
#   --docker               let the hub read /var/run/docker.sock so container
#                          metrics work: adds the socket's group to the service.
#                          The socket is root-equivalent — this is opt-in.
#   --docker-group <name>  group that owns the socket, default its owner group
#   --serve                run `cupola serve`: the hub plus a local agent, so the
#                          panel lists the machine it runs on as `local`
set -eu

ADMIN_PASSWORD=""
PUBLIC_URL=""
LISTEN="127.0.0.1:8080"
DATA_DIR="/var/lib/cupola"
OPT_DIR="/opt/cupola"
CONF_DIR="/etc/cupola"
SERVICE_USER="cupola"
VERSION="latest"
FROM_DIR=""
UNITS_DIR=""
DOCKER="no"
DOCKER_GROUP=""
SERVE="no"

while [ $# -gt 0 ]; do
  case "$1" in
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --public-url) PUBLIC_URL="$2"; shift 2 ;;
    --listen) LISTEN="$2"; shift 2 ;;
    --data-dir) DATA_DIR="$2"; shift 2 ;;
    --opt-dir) OPT_DIR="$2"; shift 2 ;;
    --conf-dir) CONF_DIR="$2"; shift 2 ;;
    --user) SERVICE_USER="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --from) FROM_DIR="$2"; shift 2 ;;
    --units) UNITS_DIR="$2"; shift 2 ;;
    --docker) DOCKER="yes"; shift ;;
    --docker-group) DOCKER="yes"; DOCKER_GROUP="$2"; shift 2 ;;
    --serve) SERVE="yes"; shift ;;
    -h|--help) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "install-hub: must run as root: it creates the service account and units" >&2
  exit 1
fi

REPO="abcdlsj/cupola"
# ref the units come from when a release tarball predates deploy/.
TAG="main"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- the release -----------------------------------------------------------

if [ -n "$FROM_DIR" ]; then
  STAGE="$FROM_DIR"
  [ -f "$STAGE/cupola" ] || { echo "$STAGE has no cupola binary" >&2; exit 1; }
  [ -d "$STAGE/web" ] || { echo "$STAGE has no web/ directory" >&2; exit 1; }
  echo "installing from $STAGE"
else
  if [ "$VERSION" = "latest" ]; then
    BASE="https://github.com/$REPO/releases/latest/download"
    TAG="main"
  else
    BASE="https://github.com/$REPO/releases/download/v${VERSION#v}"
    TAG="v${VERSION#v}"
  fi
  ASSET="cupola_linux_amd64.tar.gz"
  case "$(uname -m)" in
    x86_64|amd64) ;;
    aarch64|arm64) ASSET="cupola_linux_arm64.tar.gz" ;;
    *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  echo "downloading $ASSET from $BASE"
  curl -fsSL "$BASE/$ASSET" -o "$TMP/$ASSET"
  if curl -fsSL "$BASE/checksums.txt" -o "$TMP/checksums.txt"; then
    (cd "$TMP" && grep " $ASSET\$" checksums.txt > "$ASSET.sum" &&
      { sha256sum -c "$ASSET.sum" || shasum -a 256 -c "$ASSET.sum"; }) >/dev/null 2>&1 || {
      echo "checksum mismatch for $ASSET" >&2
      exit 1
    }
  else
    echo "warning: no checksums.txt for this release; installing unverified" >&2
  fi
  STAGE="$TMP/stage"
  mkdir -p "$STAGE"
  tar -C "$STAGE" -xzf "$TMP/$ASSET"
  [ -f "$STAGE/cupola" ] || { echo "$ASSET has no cupola binary" >&2; exit 1; }
  [ -d "$STAGE/web" ] || { echo "$ASSET has no web/ directory" >&2; exit 1; }
fi

# The units travel with the release. Tarballs cut before v1.7.3 have no deploy/,
# so fall back to the same tag on GitHub, and let --units point at a local copy
# for offline hosts.
UNITS="${UNITS_DIR:-}"
if [ -z "$UNITS" ]; then
  if [ -d "$STAGE/deploy/systemd" ]; then
    UNITS="$STAGE/deploy/systemd"
  else
    UNITS="$TMP/units"
    mkdir -p "$UNITS"
    for unit in cupola-hub.service cupola-upgrade.service cupola-upgrade.path; do
      curl -fsSL "https://raw.githubusercontent.com/$REPO/$TAG/deploy/systemd/$unit" -o "$UNITS/$unit" ||
        { echo "cannot fetch $unit; pass --units <dir>" >&2; exit 1; }
    done
  fi
fi
for unit in cupola-hub.service cupola-upgrade.service cupola-upgrade.path; do
  [ -f "$UNITS/$unit" ] || { echo "$UNITS has no $unit" >&2; exit 1; }
done

# --- the service account and its directories -------------------------------

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  echo "created the $SERVICE_USER account"
fi
install -d -m 0755 "$OPT_DIR"
install -d -m 0750 "$CONF_DIR"
install -d -m 0700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DATA_DIR"

# --- Docker, opt-in --------------------------------------------------------

# The socket is root-equivalent: whoever can open it can read every container's
# environment and start a container as root. So it is a flag, never a default.
DOCKER_CONF="/etc/systemd/system/cupola-hub.service.d/10-docker.conf"
if [ "$DOCKER" = "yes" ]; then
  SOCKET="/var/run/docker.sock"
  if [ ! -S "$SOCKET" ]; then
    echo "warning: $SOCKET is missing; container metrics stay empty until Docker runs" >&2
  elif ! curl -fsS --max-time 3 --unix-socket "$SOCKET" http://d/_ping >/dev/null 2>&1; then
    # A stopped daemon leaves the socket file behind, so presence proves nothing.
    echo "warning: nothing answers on $SOCKET; container metrics stay empty until Docker runs" >&2
  fi
  if [ -z "$DOCKER_GROUP" ] && [ -S "$SOCKET" ]; then
    DOCKER_GROUP="$(stat -c '%G' "$SOCKET")"
  fi
  [ -n "$DOCKER_GROUP" ] || DOCKER_GROUP="docker"
  if ! getent group "$DOCKER_GROUP" >/dev/null 2>&1; then
    echo "warning: group $DOCKER_GROUP does not exist yet; the drop-in still names it" >&2
  fi
  install -d -m 0755 "$(dirname "$DOCKER_CONF")"
  cat > "$DOCKER_CONF" <<CONFEOF
# Installed by deploy/install-hub.sh --docker.
[Service]
SupplementaryGroups=$DOCKER_GROUP
CONFEOF
  chmod 0644 "$DOCKER_CONF"
  echo "container metrics: the hub joins group $DOCKER_GROUP (root-equivalent access)"
else
  if [ -f "$DOCKER_CONF" ]; then
    rm -f "$DOCKER_CONF"
    echo "container metrics: off (removed $DOCKER_CONF)"
  fi
fi

# --- all-in-one ------------------------------------------------------------

# `hub` serves other agents only. `serve` also runs an agent for this machine
# and registers it as `local`, which is what a single-box install wants. A
# drop-in rather than a second unit, because ExecStart has to be cleared first.
SERVE_CONF="/etc/systemd/system/cupola-hub.service.d/20-serve.conf"
if [ "$SERVE" = "yes" ]; then
  install -d -m 0755 "$(dirname "$SERVE_CONF")"
  cat > "$SERVE_CONF" <<CONFEOF
# Installed by deploy/install-hub.sh --serve.
[Service]
ExecStart=
ExecStart=$OPT_DIR/cupola serve --web-dir $OPT_DIR/web
CONFEOF
  chmod 0644 "$SERVE_CONF"
  echo "mode: serve (hub plus a local agent for this machine)"
else
  if [ -f "$SERVE_CONF" ]; then
    rm -f "$SERVE_CONF"
    echo "mode: hub (no local agent; removed $SERVE_CONF)"
  fi
fi

# --- the files -------------------------------------------------------------

install -m 0755 "$STAGE/cupola" "$OPT_DIR/cupola"
rm -rf "$OPT_DIR/web.prev"
if [ -d "$OPT_DIR/web" ]; then mv "$OPT_DIR/web" "$OPT_DIR/web.prev"; fi
cp -R "$STAGE/web" "$OPT_DIR/web"
chmod -R a+rX "$OPT_DIR/web"

for unit in cupola-hub.service cupola-upgrade.service cupola-upgrade.path; do
  install -m 0644 "$UNITS/$unit" "/etc/systemd/system/$unit"
done

# hub.env keeps its secrets on a re-run; only the values we were given change.
HUB_ENV="$CONF_DIR/hub.env"
if [ ! -f "$HUB_ENV" ]; then
  umask 077
  : > "$HUB_ENV"
  umask 022
fi
set_env() {
  key="$1"; value="$2"
  [ -n "$value" ] || return 0
  tmp="$HUB_ENV.new"
  : > "$tmp"
  grep -v "^$key=" "$HUB_ENV" >> "$tmp" 2>/dev/null || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$HUB_ENV"
}
set_env CUPOLA_LISTEN "$LISTEN"
set_env CUPOLA_DATA_DIR "$DATA_DIR"
set_env CUPOLA_WEB_DIR "$OPT_DIR/web"
set_env CUPOLA_PUBLIC_URL "$PUBLIC_URL"
set_env CUPOLA_ADMIN_PASSWORD "$ADMIN_PASSWORD"
chown root:root "$HUB_ENV"
chmod 0600 "$HUB_ENV"
if [ -z "$ADMIN_PASSWORD" ] && ! grep -q '^CUPOLA_ADMIN_PASSWORD=' "$HUB_ENV"; then
  echo "note: no CUPOLA_ADMIN_PASSWORD in $HUB_ENV; the hub prints a first-start" >&2
  echo "      password hint in Settings -> About, or re-run with --admin-password" >&2
fi

systemctl daemon-reload
systemctl enable cupola-hub cupola-upgrade.path >/dev/null 2>&1
systemctl restart cupola-hub
systemctl start cupola-upgrade.path

# --- the health check ------------------------------------------------------

echo
echo "waiting for the hub on $LISTEN ..."
for _ in $(seq 1 30); do
  sleep 1
  if curl -fsS "http://${LISTEN}/healthz" >/dev/null 2>&1; then
    echo "hub is up: http://${LISTEN}/"
    echo "  version  $("$OPT_DIR/cupola" version 2>/dev/null | head -1)"
    echo "  data     $DATA_DIR"
    echo "  env      $HUB_ENV"
    echo "  upgrade  systemctl status cupola-upgrade.path"
    exit 0
  fi
done
echo "the hub did not answer on http://${LISTEN}/healthz in 30 s. Check:" >&2
echo "  journalctl -u cupola-hub -n 50 --no-pager" >&2
echo "  systemctl status cupola-hub" >&2
exit 1
