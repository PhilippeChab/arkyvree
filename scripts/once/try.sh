#!/usr/bin/env bash
# Installs an image with ONCE for a hands-on look, inside the Docker-in-Docker container scripts/once/local.sh starts
# (`bun run once:try`): ONCE, Mailpit and the image, as test.sh installs them. The container passes its port 80 (ONCE's
# proxy) on to the computer's `--port`, so the app's address carries that port: APP_URL says so, which Arkyvree reads
# before ONCE's BASE_URL.
#
#   scripts/once/try.sh --image <image> --port <the computer's port>
set -euo pipefail
shopt -s inherit_errexit

# shellcheck source=scripts/once/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

IMAGE=""
PORT=""
while (($#)); do
  case "$1" in
    --image) IMAGE="${2:-}" && shift ;;
    --port) PORT="${2:-}" && shift ;;
    *) die "Usage: $0 --image <image> --port <port>" ;;
  esac
  shift
done
[[ -n "$IMAGE" && -n "$PORT" ]] || die "Usage: $0 --image <image> --port <port>"

docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull -q "$IMAGE" >/dev/null
install_once
start_services 0.0.0.0
push_image "$IMAGE"
deploy_app --env "APP_URL=http://$APP_HOST:$PORT"
