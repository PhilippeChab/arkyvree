#!/usr/bin/env bash
# Tests the self-hosted image as ONCE runs it (docs/self-hosting.md's "How the image is tested"): installs the latest
# release, signs up its admin, uploads a portrait, then updates to the image under test while the site is polled, and
# checks what a self-hoster relies on: the account and the portrait kept, the migrations run, a PDF drawn by the worker,
# a backup restored, a restart. With --background, ONCE's own background runner then updates the install and backs it
# up by itself. CI runs it on a runner (.github/workflows/app-image.yml); scripts/once/local.sh runs it in
# Docker-in-Docker on a developer's machine. It changes the machine it runs on (ports 80 and 443, /etc/hosts, Docker):
# run it on a throwaway one.
#
#   scripts/once/test.sh --image <image under test> [--release <image>] [--background]
set -Eeuo pipefail
shopt -s inherit_errexit

# shellcheck source=scripts/once/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  echo "Usage: $0 --image <image under test> [--release <image>] [--background]" >&2
  exit 2
}

IMAGE=""
RELEASE_IMAGE="ghcr.io/philippechab/arkyvree:latest"
BACKGROUND=""
while (($#)); do
  case "$1" in
    --image) IMAGE="${2:-}" && shift ;;
    --release) RELEASE_IMAGE="${2:-}" && shift ;;
    --background) BACKGROUND=1 ;;
    *) usage ;;
  esac
  shift
done
[[ -n "$IMAGE" ]] || usage

WORK="$(mktemp -d)"
BACKUPS="$WORK/backups"
COOKIES="$WORK/cookies"
EMAIL="admin@example.com"
PASSWORD="once-test-password"
# A 1x1 PNG, as a portrait
PORTRAIT_PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
STARTED=$SECONDS
CHARACTER_ID=""
PORTRAIT_URL=""
POLLER_PID=""
mkdir -p "$BACKUPS"

# ---------------------------------------------------------------------------------------------------------------------
# Reporting

# Runs one step (`$1`, its title; the rest, its command), timed
step() {
  local title="$1" started=$SECONDS
  shift
  log "== $title"
  "$@"
  log "   done in $((SECONDS - started))s"
}

# On a failure, what explains it: the containers, ONCE's apps, the app's and the proxy's logs, the site's polling
on_exit() {
  local status=$?
  [[ -z "$POLLER_PID" ]] || kill "$POLLER_PID" 2>/dev/null || true
  if ((status == 0)); then
    log "All checks passed in $((SECONDS - STARTED))s"
    return
  fi
  set +e
  log "Failed after $((SECONDS - STARTED))s: what ONCE and the app show"
  echo "--- docker ps -a"
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
  echo "--- once list"
  once list
  local name
  for name in $(docker ps -a --format '{{.Names}}' | grep -E '^once-'); do
    echo "--- docker logs $name (last 200 lines)"
    docker logs --tail 200 "$name" 2>&1
  done
  if [[ -s "$WORK/poll.log" ]]; then
    echo "--- the site, polled during the update (time, /up, /)"
    cat "$WORK/poll.log"
  fi
  if [[ -s "$WORK/background.log" ]]; then
    echo "--- once background run"
    cat "$WORK/background.log"
  fi
}
trap on_exit EXIT
# A command that fails outside a check of its own still says which
trap 'log "FAILED: \`$BASH_COMMAND\` (line $LINENO)" >&2' ERR

# ---------------------------------------------------------------------------------------------------------------------
# The app, through its own routes, as a browser calls them

# A request to the app: `$1` its method, `$2` its path, `$3` its JSON body (optional), `$4` an API key (optional).
# Answers its body; any status but 2xx fails the step
call() {
  local method="$1" path="$2" body="${3:-}" key="${4:-}" status
  local args=(-s -o "$WORK/response" -w '%{http_code}' -X "$method" -b "$COOKIES" -c "$COOKIES" -H "Origin: $APP_BASE")
  [[ -z "$body" ]] || args+=(-H "Content-Type: application/json" --data "$body")
  [[ -z "$key" ]] || args+=(-H "Authorization: Bearer $key")
  status=$(curl "${args[@]}" "$APP_BASE$path") || true
  [[ "$status" == 2* ]] || die "$method $path answered $status: $(head -c 500 "$WORK/response")"
  cat "$WORK/response"
}

# An address the app gives, made absolute: some it gives from its root (`/files/…`)
absolute() {
  if [[ "$1" == /* ]]; then echo "$APP_BASE$1"; else echo "$1"; fi
}

# Waits until the app itself answers (`/up` answers the updating page's 200 too), up to `$1` seconds
wait_for_app() {
  local within="${1:-180}" deadline=$((SECONDS + ${1:-180})) status
  until status=$(curl -s -o "$WORK/policy" -w '%{http_code}' --max-time 5 "$APP_BASE/auth/sign-up-policy") &&
    [[ "$status" == 200 ]] && jq -e 'has("signUpPolicy")' "$WORK/policy" >/dev/null 2>&1; do
    ((SECONDS < deadline)) || die "The app didn't answer within ${within}s (last: $status)"
    sleep 1
  done
}

# The code the verification email to `$EMAIL` holds, from Mailpit, once it's arrived
read_verification_code() {
  local id="" tries=0
  until [[ -n "$id" && "$id" != null ]]; do
    ((tries++ < 60)) || die "No verification email reached Mailpit"
    sleep 1
    id=$(curl -fs "$MAILPIT/api/v1/search?query=to:$EMAIL" | jq -r '.messages[0].ID')
  done
  # The email's preview line, in its HTML: "Your verification code is 12345678"
  curl -fs "$MAILPIT/api/v1/message/$id" | jq -r '.HTML' | grep -oE 'code is [0-9]+' | sed -n 1p | grep -oE '[0-9]+' ||
    die "The verification email holds no code"
}

# The running app's container: exactly one
app_container() {
  local names
  names=$(docker ps --filter "name=^once-app-" --format '{{.Names}}')
  [[ $(wc -w <<<"$names") == 1 ]] || die "Expected one running app container, found: ${names:-none}"
  echo "$names"
}

sign_up() {
  rm -f "$COOKIES"
  local body
  body=$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{emailAddress: $e, password: $p, passwordConfirmation: $p}')
  call POST /auth/sign-up "$body" >/dev/null
  local code
  code=$(read_verification_code)
  call POST /auth/verify-email "$(jq -nc --arg e "$EMAIL" --arg c "$code" '{emailAddress: $e, code: $c}')" >/dev/null
  check_signed_in_admin
}

sign_in() {
  rm -f "$COOKIES"
  call POST /auth/sign-in "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{emailAddress: $e, password: $p}')" >/dev/null
  check_signed_in_admin
}

# The session's account, the instance's first: its admin
check_signed_in_admin() {
  call GET /auth/me | jq -e --arg e "$EMAIL" '.emailAddress == $e and .isAdmin == true' >/dev/null ||
    die "/auth/me isn't the admin: $(cat "$WORK/response")"
}

# A human of the core rules, with 10 in each ability, as the app's Create Character dialog makes one
create_character() {
  local ruleset human scores body
  ruleset=$(call GET "/api/rulesets?scope=base&search=Core%20SRD%203.5" |
    jq -r '.items[] | select(.name == "Core SRD 3.5") | .id')
  [[ -n "$ruleset" ]] || die "The install has no Core SRD 3.5"
  human=$(call GET "/api/characters/creation/race?rulesetId=$ruleset&search=Human" |
    jq -r '.items[] | select(.name == "Human") | .id')
  scores=$(call GET "/api/rulesets/$ruleset/entities/abilities" | jq -c '[.items[] | {(.id): 10}] | add')
  body=$(jq -nc --arg r "$ruleset" --arg h "$human" --argjson s "$scores" '{
    rulesetId: $r, name: "Once Tester", picks: {race: $h}, scores: {score: $s},
    fields: {CHARACTER_XP: 0, CHARACTER_ALIGNMENT: "True Neutral", CHARACTER_GENDER: "Other"}
  }')
  CHARACTER_ID=$(call POST /api/characters "$body" | jq -r '.id')
  log "   character $CHARACTER_ID"
}

create_character_with_portrait() {
  create_character
  upload_portrait
}

# The portrait's upload as the browser makes it, without S3: a link the server signs, the file sent to it (the server's
# disk keeps it), then attached
upload_portrait() {
  base64 -d <<<"$PORTRAIT_PNG" >"$WORK/portrait.png"
  local size upload url signed status
  size=$(wc -c <"$WORK/portrait.png")
  upload=$(call POST /api/attachments/direct-uploads "$(jq -nc --arg id "$CHARACTER_ID" --argjson size "$size" '{
    recordType: "Character", recordId: $id, name: "portrait", filename: "portrait.png", contentType: "image/png",
    byteSize: $size
  }')")
  url=$(absolute "$(jq -r '.presignedUrl' <<<"$upload")")
  signed=$(jq -r '.signedId' <<<"$upload")
  status=$(curl -s -o "$WORK/response" -w '%{http_code}' -X PUT -H "Content-Type: image/png" \
    --data-binary "@$WORK/portrait.png" "$url") || true
  [[ "$status" == 2* ]] || die "The portrait's upload answered $status: $(cat "$WORK/response")"
  call POST "/api/attachments/$signed/attach" >/dev/null
  check_portrait
}

# The portrait reads back, byte for byte, from the address the app gives it
check_portrait() {
  PORTRAIT_URL=$(call GET "/api/attachments?recordType=Character&recordId=$CHARACTER_ID&name=portrait" | jq -r '.url')
  [[ "$PORTRAIT_URL" != null ]] || die "The character has no portrait: $(cat "$WORK/response")"
  PORTRAIT_URL=$(absolute "$PORTRAIT_URL")
  curl -fs -o "$WORK/portrait.read" "$PORTRAIT_URL" || die "The portrait doesn't read back from $PORTRAIT_URL"
  cmp -s "$WORK/portrait.png" "$WORK/portrait.read" || die "The portrait read back differs from the one uploaded"
}

# The account and its portrait, after the install changed under them
check_data_kept() {
  wait_for_app
  sign_in
  check_portrait
}

# ---------------------------------------------------------------------------------------------------------------------
# ONCE

# Installs the latest release, to update from it. A release that doesn't deploy (none published yet, or a broken one)
# leaves the image under test to install fresh: the update then replaces it with itself
install_release() {
  if docker pull -q "$RELEASE_IMAGE" >/dev/null && push_image "$RELEASE_IMAGE" && deploy_app; then
    log "   installed the release, $RELEASE_IMAGE"
    return
  fi
  log "   WARNING: the release ($RELEASE_IMAGE) didn't deploy: installing the image under test fresh instead"
  once remove "$APP_HOST" --remove-data >/dev/null 2>&1 || true
  push_image "$IMAGE"
  deploy_app
}

# Polls the site every half second until `$WORK/poll.stop` exists: /up (ONCE's probe), which must always answer, and
# /, which may answer the updating page meanwhile, but never a proxy's error nor a refused connection
poll_site() {
  local up page
  while [[ ! -e "$WORK/poll.stop" ]]; do
    up=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$APP_BASE/up") || true
    page=$(curl -s -o "$WORK/poll.body" -w '%{http_code}' --max-time 5 "$APP_BASE/") || true
    if [[ "$page" == 503 ]] && grep -q "Arkyvree is updating" "$WORK/poll.body"; then page=updating; fi
    echo "$(date -u +%H:%M:%S.%N | cut -c1-12) $up $page" >>"$WORK/poll.log"
    sleep 0.5
  done
}

# What the polling saw: every request answered, by the app or its updating page
check_polling() {
  touch "$WORK/poll.stop"
  wait "$POLLER_PID" 2>/dev/null || true
  POLLER_PID=""
  local total failed updating
  total=$(wc -l <"$WORK/poll.log")
  failed=$(awk '$2 !~ /^[23]/ || ($3 !~ /^[23]/ && $3 != "updating")' "$WORK/poll.log")
  updating=$(awk '$3 == "updating"' "$WORK/poll.log" | wc -l)
  [[ -z "$failed" ]] || die "The site failed requests during the update (time, /up, /):"$'\n'"$failed"
  log "   polled $total times: every request answered, $updating of them by the updating page"
}

# The image under test, pushed under the tag ONCE installs, and the update to it, the site polled throughout; then a
# backup at once, which comes while the new version still starts, as ONCE's automatic update and daily backup do
update_to_image() {
  push_image "$IMAGE"
  rm -f "$WORK/poll.log" "$WORK/poll.stop"
  poll_site &
  POLLER_PID=$!
  sleep 2
  once update "$APP_HOST"
  once backup "$APP_HOST" "$BACKUPS/after-update.tar.gz"
  check_dump "$BACKUPS/after-update.tar.gz"
  wait_for_app
  sleep 2
  check_polling
}

# The running app is the image under test, and its database holds the migrations the image ships
check_version() {
  local container image_id running_id journal applied
  container=$(app_container)
  image_id=$(docker image inspect -f '{{.Id}}' "$IMAGE")
  running_id=$(docker inspect -f '{{.Image}}' "$container")
  [[ "$running_id" == "$image_id" ]] || die "The app runs $running_id, not the image under test ($image_id)"
  journal=$(docker exec "$container" cat /app/drizzle/meta/_journal.json |
    jq -r '"\(.entries | length) \(.entries[-1].when)"')
  applied=$(docker exec -u postgres "$container" psql -h /run/postgresql -d arkyvree -tAF ' ' \
    -c 'SELECT count(*), max(created_at) FROM drizzle.__drizzle_migrations')
  [[ "$applied" == "$journal" ]] || die "The database's migrations ($applied) aren't the image's ($journal)"
  log "   the app runs the image under test; its $(cut -d' ' -f1 <<<"$journal") migrations are applied"
}

check_updated() {
  check_data_kept
  check_version
}

# A backup archive holds the database's dump (pre-backup's), not only the database's folder as copied
check_dump() {
  tar -tzf "$1" >"$WORK/listing"
  grep -qx 'data/backup/arkyvree.dump' "$WORK/listing" ||
    die "$(basename "$1") holds no database dump, only: $(grep -v '^data/postgres/.' "$WORK/listing" | tr '\n' ' ')"
  log "   $(basename "$1") holds the database's dump"
}

# A character's PDF, queued through the public API (an API key of the admin's) and drawn by the worker
export_pdf() {
  local key export_id status="pending" tries=0
  key=$(call POST /auth/api-keys '{"name": "ONCE test", "expiresInDays": 1, "readOnly": false}' | jq -r '.token')
  export_id=$(call POST "/v1/characters/$CHARACTER_ID/pdf" "" "$key" | jq -r '.id')
  while [[ "$status" == pending ]]; do
    ((tries++ < 120)) || die "The PDF wasn't ready within 2 minutes"
    sleep 1
    status=$(call GET "/v1/exports/$export_id" "" "$key" | jq -r '.status')
  done
  [[ "$status" == ready ]] || die "The PDF export is $status"
  call GET "/v1/exports/$export_id/download" "" "$key" >"$WORK/sheet.pdf"
  [[ "$(head -c 5 "$WORK/sheet.pdf")" == "%PDF-" ]] || die "The export isn't a PDF"
  log "   the worker drew a $(wc -c <"$WORK/sheet.pdf")-byte PDF"
}

# A backup, the install removed with its data, and the backup restored (under its hostname, which it takes again)
backup_and_restore() {
  once backup "$APP_HOST" "$BACKUPS/before-restore.tar.gz"
  check_dump "$BACKUPS/before-restore.tar.gz"
  once remove "$APP_HOST" --remove-data
  once restore "$BACKUPS/before-restore.tar.gz"
  check_data_kept
}

# The app's container stopped and started again, as a reboot does
restart() {
  once stop "$APP_HOST"
  once start "$APP_HOST"
  check_data_kept
}

# ONCE's own background runner, with automatic updates and backups on: a new image published under the tag, then the
# runner's first check (five minutes in) updates the install and backs it up in the same pass, the backup seconds after
# the update. The restored install is new to the runner (a restore names the app anew), so both are due.
background_cycle() {
  once update "$APP_HOST" --auto-update=true --auto-backup=true --backup-path "$BACKUPS/automatic"
  wait_for_app
  printf 'FROM %s\nLABEL arkyvree.once-test="%s"\n' "$IMAGE" "$(date +%s)" |
    docker build -q -t "$DEPLOYED_IMAGE" - >/dev/null
  docker push -q "$DEPLOYED_IMAGE" >/dev/null
  local new_id deadline=$((SECONDS + 420)) runner
  new_id=$(docker image inspect -f '{{.Id}}' "$DEPLOYED_IMAGE")
  once background run >"$WORK/background.log" 2>&1 &
  runner=$!
  log "   the runner checks every five minutes: waiting for its update and its backup"
  until [[ "$(docker inspect -f '{{.Image}}' "$(app_container 2>/dev/null)" 2>/dev/null)" == "$new_id" ]] &&
    compgen -G "$BACKUPS/automatic/*.tar.gz" >/dev/null &&
    grep -qE "Auto-backup (completed|failed)" "$WORK/background.log"; do
    ((SECONDS < deadline)) || die "ONCE's runner didn't update and back up the install within 7 minutes"
    kill -0 "$runner" 2>/dev/null || die "ONCE's runner stopped"
    sleep 5
  done
  sleep 5
  kill "$runner" && wait "$runner" 2>/dev/null || true
  grep -q "Auto-update completed" "$WORK/background.log" || die "ONCE's runner didn't report its update"
  grep -q "Auto-backup completed" "$WORK/background.log" || die "ONCE's runner didn't report its backup"
  local archive
  archive=$(compgen -G "$BACKUPS/automatic/*.tar.gz" | sed -n 1p)
  check_dump "$archive"
  check_data_kept
}

# ---------------------------------------------------------------------------------------------------------------------

docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull -q "$IMAGE" >/dev/null
log "Testing $IMAGE with ONCE $ONCE_VERSION, updating from $RELEASE_IMAGE"
step "Install ONCE" install_once
step "Start Mailpit and the registry" start_services
step "Install the latest release" install_release
step "Sign up the admin, through the email's code" sign_up
step "Create a character and upload its portrait" create_character_with_portrait
step "Update to the image under test, polling the site, then back it up at once" update_to_image
step "Check the account, the portrait and the version" check_updated
step "Export a PDF (the worker)" export_pdf
step "Back up, remove, restore" backup_and_restore
step "Restart" restart
if [[ -n "$BACKGROUND" ]]; then step "ONCE's background update and backup" background_cycle; fi
