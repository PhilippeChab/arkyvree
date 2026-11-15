#!/usr/bin/env bash
# The ONCE test and a hands-on ONCE install on a developer's machine (docs/self-hosting.md's "How the image is tested"),
# each in a privileged Docker-in-Docker container of its own: ONCE takes that container's ports 80 and 443 and its
# Docker, never the computer's. Without --image, it builds the image from the working tree (docker/Dockerfile).
# Everything it starts, and the image it built, is removed when it ends.
#
#   scripts/once/local.sh test [--image <image>] [--release <image>] [--background]   bun run test:once
#   scripts/once/local.sh try [--image <image>]                                      bun run once:try
#
# `try` opens ONCE's own screen; quitting it removes the install. The app answers at http://arkyvree.localhost:8080
# (ONCE_TRY_PORT) and Mailpit at http://127.0.0.1:8026 (ONCE_TRY_MAIL_PORT), on this computer only. ONCE_KEEP=1 leaves
# the Docker-in-Docker container in place when it ends, for a look inside.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIND_IMAGE=docker:28.5.2-dind
BUILT_IMAGE=arkyvree-app:once-local
TRY_PORT="${ONCE_TRY_PORT:-8080}"
TRY_MAIL_PORT="${ONCE_TRY_MAIL_PORT:-8026}"

usage() {
  sed -n '7,8p' "${BASH_SOURCE[0]}" | sed 's/^#  //' >&2
  exit 2
}

log() { printf '[once local] %s\n' "$*"; }

MODE="${1:-}"
[[ "$MODE" == test || "$MODE" == try ]] || usage
shift
# One container per mode: a test can run beside a hands-on install
DIND="arkyvree-once-$MODE"
IMAGE=""
PASSED=()
while (($#)); do
  case "$1" in
    --image) (($# >= 2)) || usage && IMAGE="$2" && shift ;;
    --release) [[ "$MODE" == test && $# -ge 2 ]] || usage && PASSED+=("$1" "$2") && shift ;;
    --background) [[ "$MODE" == test ]] || usage && PASSED+=("$1") ;;
    *) usage ;;
  esac
  shift
done

BUILT=""
cleanup() {
  if [[ -n "${ONCE_KEEP:-}" ]]; then
    log "ONCE_KEEP is set: $DIND stays (docker exec -it $DIND sh; docker rm -f -v $DIND removes it)"
    return
  fi
  log "Removing the Docker-in-Docker container and everything in it"
  docker rm -f -v "$DIND" >/dev/null 2>&1 || true
  if [[ -n "$BUILT" ]]; then docker rmi "$BUILT" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

if [[ -z "$IMAGE" ]]; then
  log "Building the image from the working tree"
  BUILT="$BUILT_IMAGE"
  docker build -f "$ROOT/docker/Dockerfile" -t "$BUILT" "$ROOT"
  IMAGE="$BUILT"
fi

ports=()
if [[ "$MODE" == try ]]; then ports=(-p "127.0.0.1:$TRY_PORT:80" -p "127.0.0.1:$TRY_MAIL_PORT:8025"); fi
docker rm -f -v "$DIND" >/dev/null 2>&1 || true
log "Starting Docker-in-Docker ($DIND_IMAGE)"
docker run -d --privileged --name "$DIND" -e DOCKER_TLS_CERTDIR= ${ports[@]+"${ports[@]}"} "$DIND_IMAGE" >/dev/null
tries=0
until docker exec "$DIND" docker info >/dev/null 2>&1; do
  ((tries++ < 60)) || {
    docker logs "$DIND"
    exit 1
  }
  sleep 1
done
docker exec "$DIND" apk add -q --no-cache bash coreutils curl grep jq tar >/dev/null
# An image this computer has goes in; any other, the container pulls
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  log "Loading $IMAGE into it"
  docker save "$IMAGE" | docker exec -i "$DIND" docker load -q >/dev/null
fi
docker cp "$ROOT/scripts/once" "$DIND:/once"

if [[ "$MODE" == test ]]; then
  docker exec "$DIND" bash /once/test.sh --image "$IMAGE" ${PASSED[@]+"${PASSED[@]}"}
  exit
fi

docker exec "$DIND" bash /once/try.sh --image "$IMAGE" --port "$TRY_PORT"
log ""
log "Arkyvree:  http://arkyvree.localhost:$TRY_PORT (the first account to confirm its email is the admin)"
log "Mailpit:   http://127.0.0.1:$TRY_MAIL_PORT (the emails Arkyvree sends, the verification code among them)"
log "Opening ONCE's screen: quitting it removes the install"
docker exec -it -e ONCE_NO_SELF_UPDATE=1 "$DIND" once || true
