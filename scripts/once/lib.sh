# Shared by the ONCE test (test.sh) and the hands-on install (try.sh): ONCE itself, the services beside it (Mailpit,
# which takes Arkyvree's emails, and a registry ONCE pulls the image under test from), and the install's address.
# docs/self-hosting.md's "How the image is tested" describes them.
# shellcheck shell=bash

ONCE_VERSION="${ONCE_VERSION:-v0.3.4}"
# The install's hostname: ONCE serves a *.localhost one over plain HTTP, and passes BASE_URL=http://arkyvree.localhost
APP_HOST=arkyvree.localhost
APP_BASE="http://$APP_HOST"
# ONCE pulls the image under test from this registry, as it pulls a published one: under one tag, which moves
REGISTRY=localhost:5000
DEPLOYED_IMAGE="$REGISTRY/arkyvree:latest"
MAILPIT="http://127.0.0.1:8025"
# ONCE's background runner would otherwise replace its own binary with the latest release
export ONCE_NO_SELF_UPDATE=1

log() { printf '[once %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

die() {
  printf '[once %s] FAILED: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2
  exit 1
}

# Runs a command as root: directly when the script already is (in Docker-in-Docker), through sudo otherwise (CI)
as_root() {
  if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

# Installs ONCE's release binary, its checksum verified. Not its install script, which also installs a service and opens
# its interactive screen
install_once() {
  if command -v once >/dev/null && [[ "$(once version 2>/dev/null)" == *"${ONCE_VERSION#v}"* ]]; then return; fi
  local arch dir
  case "$(uname -m)" in
    x86_64) arch=amd64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) die "ONCE has no release for $(uname -m)" ;;
  esac
  dir=$(mktemp -d)
  local url="https://github.com/basecamp/once/releases/download/$ONCE_VERSION"
  curl -fsSL --retry 3 -o "$dir/once-linux-$arch" "$url/once-linux-$arch"
  curl -fsSL --retry 3 -o "$dir/checksums.txt" "$url/checksums.txt"
  (cd "$dir" && grep " once-linux-$arch\$" checksums.txt | sha256sum -c -)
  as_root install -m 0755 "$dir/once-linux-$arch" /usr/local/bin/once
  rm -rf "$dir"
  log "ONCE $(once version) installed"
}

# The services beside ONCE: its network made first, so Mailpit joins it (ONCE reuses it) and the app reaches Mailpit by
# name; the registry; and the hostname, which ONCE checks the app answers at after each deploy, and which its resolver
# doesn't map to this machine by itself. Mailpit's page listens on `$1`: this machine only, unless try.sh's
# Docker-in-Docker passes it on to the computer around it
start_services() {
  local mail_address="${1:-127.0.0.1}"
  docker network inspect once >/dev/null 2>&1 || docker network create once >/dev/null
  docker rm -f once-test-mailpit once-test-registry >/dev/null 2>&1 || true
  docker run -d -q --name once-test-mailpit --network once --network-alias mailpit \
    -e MP_SMTP_AUTH_ACCEPT_ANY=1 -e MP_SMTP_AUTH_ALLOW_INSECURE=1 \
    -p "$mail_address:8025:8025" axllent/mailpit:v1.27 >/dev/null
  docker run -d -q --name once-test-registry -p 127.0.0.1:5000:5000 registry:2.8 >/dev/null
  grep -q " $APP_HOST\$" /etc/hosts || echo "127.0.0.1 $APP_HOST" | as_root tee -a /etc/hosts >/dev/null
  local tries=0
  until curl -fs -o /dev/null "http://127.0.0.1:5000/v2/" && curl -fs -o /dev/null "$MAILPIT/api/v1/info"; do
    ((tries++ < 60)) || die "Mailpit or the registry didn't start"
    sleep 0.5
  done
}

# Pushes an image to the registry under the tag ONCE pulls: what the next deploy or update installs
push_image() {
  docker tag "$1" "$DEPLOYED_IMAGE"
  docker push -q "$DEPLOYED_IMAGE" >/dev/null
}

# Deploys the registry's image at the install's hostname, with Mailpit as its SMTP server, and `$@` as more settings
deploy_app() {
  once deploy "$DEPLOYED_IMAGE" --host "$APP_HOST" --auto-update=false \
    --smtp-server mailpit --smtp-port 1025 --smtp-username ci --smtp-password ci \
    --smtp-from "Arkyvree <arkyvree@example.com>" --env SMTP_TLS=none "$@"
}
