#!/usr/bin/env bash
# The self-hosted image's entrypoint (docs/self-hosting.md): reads ONCE's settings, starts the bundled PostgreSQL unless
# DATABASE_URL names another database, migrates it, then runs the server and the worker and watches them with the
# database. If any of them stops, the container stops with them, and Docker (or ONCE) starts it again.
set -euo pipefail

# shellcheck source=docker/lib.sh
source /usr/local/lib/arkyvree/lib.sh

SERVER_PID=""
WORKER_PID=""
PAGE_PID=""
STOPPING=""

# ONCE's settings, under Arkyvree's names: its URL (with its scheme: http when DISABLE_SSL is set, which makes the
# session cookie plain), its secret, and the port and volume it expects
read_settings() {
  export APP_URL="${APP_URL:-${BASE_URL:-}}"
  [[ -n "$APP_URL" ]] || die "Set BASE_URL or APP_URL to the address people open Arkyvree at (ONCE sets BASE_URL)"
  export STORAGE_PATH PORT="${PORT:-80}" HOST="${HOST:-0.0.0.0}"
  export WORKER_CONCURRENCY="${WORKER_CONCURRENCY:-1}"
  export EMAIL_SETUP_PAGE="${EMAIL_SETUP_PAGE:-true}"
  # The updating page and the server it hands over to share the port a moment (hand_over_port)
  export REUSE_PORT=true
  export SIGNING_SECRET="${SIGNING_SECRET:-${SECRET_KEY_BASE:-$(read_or_create_secret)}}"
  ROLE="${ROLE:-all}"
  case "$ROLE" in
    all) ;;
    web | worker) [[ -n "${DATABASE_URL:-}" ]] || die "ROLE=$ROLE needs DATABASE_URL: only ROLE=all runs the bundled database" ;;
    *) die "ROLE is $ROLE: it's all, web or worker" ;;
  esac
}

# A secret kept in the volume, for an install that sets neither SIGNING_SECRET nor SECRET_KEY_BASE (a plain docker run)
read_or_create_secret() {
  local file="$STORAGE_PATH/.signing-secret"
  if [[ ! -s "$file" ]]; then
    install -d "$STORAGE_PATH"
    (umask 077 && head -c 48 /dev/urandom | base64 | tr -d '\n' >"$file")
  fi
  cat "$file"
}

# A stop asked while the container starts: what started stops, and the container exits
abort_start() {
  log "Stopped while starting"
  stop_page
  stop_postgres
  exit 0
}

# Runs a long start step (`pid`, started in the background) to its end, so that a stop asked meanwhile is heard: the
# step is stopped, then the start
wait_step() {
  local pid="$1" status
  while true; do
    set +e
    wait "$pid"
    status=$?
    set -e
    if [[ -n "$STOPPING" ]]; then
      kill -TERM "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      abort_start
    fi
    kill -0 "$pid" 2>/dev/null || return "$status"
  done
}

# The updating page, on the port, while this container waits for the version it replaces (hold_volume)
start_page() {
  (run_as "$APP_USER" env UPDATING_PAGE=true ./server-bin) &
  PAGE_PID=$!
}

stop_page() {
  [[ -n "$PAGE_PID" ]] || return 0
  kill -TERM "$PAGE_PID" 2>/dev/null || true
  wait "$PAGE_PID" 2>/dev/null || true
  PAGE_PID=""
}

# The volume's lock, held as long as this container runs (its processes inherit it): one database server on the volume
# at a time. ONCE starts an update's container, waits for its /up, then removes the one it replaces, so the new one
# answers the updating page until the old one is gone, and goes on answering it until its server takes over
hold_volume() {
  exec 9>"$STORAGE_PATH/.arkyvree.lock"
  if flock -n 9; then return; fi
  log "The version this one replaces still runs on this volume: answering the updating page until it stops"
  start_page
  flock -w 600 9 &
  wait_step $! || die "The version this one replaces didn't stop within 10 minutes"
  log "The version this one replaces stopped"
}

# The volume's folders, each its owner's: a restored backup's files, or an image whose users' ids changed, come back
prepare_storage() {
  install -d "$STORAGE_PATH/files" "$STORAGE_PATH/backup"
  # A large volume's repair takes a while: a step a stop can interrupt
  {
    own_tree "$APP_USER" "$STORAGE_PATH/files"
    own_tree postgres "$STORAGE_PATH/backup"
    own_tree postgres "$PGDATA_DIR"
  } &
  wait_step $!
}

# The bundled database, unless DATABASE_URL names another one
start_database() {
  init_postgres &
  wait_step $!
  # A server stopped without its shutdown (ONCE removes the version it replaces at once) leaves its pid file, which
  # would name a live process of this container's: under the lock, nothing else runs on the folder
  rm -f "$PGDATA_DIR/postmaster.pid"
  start_postgres || abort_start
  ensure_database
}

# Whether something listens on the port `count` times over: the updating page, then its server beside it
count_listeners() {
  local port
  port=$(printf ':%04X' "$PORT")
  awk -v port="$port" '$2 ~ port"$" && $4 == "0A"' /proc/net/tcp /proc/net/tcp6 2>/dev/null | wc -l
}

# The port, from the updating page to the server: the page goes once the server listens beside it, so the proxy never
# finds the port closed
hand_over_port() {
  [[ -n "$PAGE_PID" ]] || return 0
  local tries=0
  until (($(count_listeners) >= 2)); do
    [[ -z "$STOPPING" ]] || break
    kill -0 "$SERVER_PID" 2>/dev/null || break
    ((tries++ < 600)) || break
    sleep 0.2
  done
  stop_page
}

# Stops what runs, in order: the server and the worker (each finishes within 30 seconds), then the database
stop_all() {
  local pid
  for pid in "$SERVER_PID" "$WORKER_PID"; do
    if [[ -n "$pid" ]]; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
  for pid in "$SERVER_PID" "$WORKER_PID"; do
    if [[ -n "$pid" ]]; then wait "$pid" 2>/dev/null || true; fi
  done
  stop_page
  stop_postgres
}

# A stop: noted for the start's steps, and passed on at once to the server and the worker once they run, so that the
# watch below (`wait -n`) ends even when the stop came just before it
on_signal() {
  STOPPING=1
  local pid
  for pid in "$SERVER_PID" "$WORKER_PID"; do
    if [[ -n "$pid" ]]; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
}

start_processes() {
  if [[ "$ROLE" != worker ]]; then
    (run_as "$APP_USER" ./server-bin) &
    SERVER_PID=$!
    hand_over_port
  fi
  if [[ "$ROLE" != web && -z "$STOPPING" ]]; then
    # Below the server's priority: a PDF being drawn leaves the pages responsive
    (run_as "$APP_USER" nice -n 10 ./worker-bin) &
    WORKER_PID=$!
  fi
}

main() {
  trap on_signal TERM INT
  read_settings
  if uses_bundled_database; then
    DATABASE_URL="$(bundled_database_url)"
    export DATABASE_URL DIRECT_DATABASE_URL="$DATABASE_URL"
    hold_volume
    prepare_storage
    start_database
  else
    log "Using the database DATABASE_URL names"
    prepare_storage
  fi
  if [[ "$ROLE" != worker ]]; then
    log "Migrating the database"
    (run_as "$APP_USER" ./migrate-bin) &
    wait_step $! || {
      stop_page
      stop_postgres
      die "The migrations failed"
    }
  fi
  start_processes
  if [[ -n "$STOPPING" ]]; then
    log "Stopping"
    stop_all
    log "Stopped"
    exit 0
  fi
  local watched=()
  for pid in "$SERVER_PID" "$WORKER_PID" "$PG_PID"; do
    if [[ -n "$pid" ]]; then watched+=("$pid"); fi
  done
  set +e
  wait -n "${watched[@]}"
  local status=$?
  set -e
  if [[ -n "$STOPPING" ]]; then
    log "Stopping"
  else
    log "A process stopped (exit $status): stopping the others"
  fi
  stop_all
  log "Stopped"
  [[ -n "$STOPPING" ]] && exit 0
  exit 1
}

main "$@"
