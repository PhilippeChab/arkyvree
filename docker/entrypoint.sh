#!/usr/bin/env bash
# The self-hosted image's entrypoint (docs/self-hosting.md): reads ONCE's settings, starts the bundled PostgreSQL unless
# DATABASE_URL names another database, migrates it, then runs the server and the worker and watches them. If either
# stops, the container stops with them, and Docker (or ONCE) starts it again.
set -euo pipefail

# shellcheck source=docker/lib.sh
source /usr/local/lib/arkyvree/lib.sh

SERVER_PID=""
WORKER_PID=""
STOPPING=""

# ONCE's settings, under Arkyvree's names: its URL (with its scheme: http when DISABLE_SSL is set, which makes the
# session cookie plain), its secret, and the port and volume it expects
read_settings() {
  export APP_URL="${APP_URL:-${BASE_URL:-}}"
  [[ -n "$APP_URL" ]] || die "Set BASE_URL or APP_URL to the address people open Arkyvree at (ONCE sets BASE_URL)"
  export STORAGE_PATH="${STORAGE_PATH:-/storage}"
  export PORT="${PORT:-80}"
  export HOST="${HOST:-0.0.0.0}"
  export WORKER_CONCURRENCY="${WORKER_CONCURRENCY:-1}"
  export EMAIL_SETUP_PAGE="${EMAIL_SETUP_PAGE:-true}"
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

# The files' folder, the app's; the database's, postgres's
prepare_storage() {
  install -d -o "$APP_USER" -g "$APP_USER" "$STORAGE_PATH/files"
  install -d -o postgres -g postgres "$STORAGE_PATH/backup"
}

# The volume's lock, held as long as this container runs (its processes inherit it): one database server on the volume
# at a time. ONCE starts an update's container, waits for its /up, then removes the one it replaces, so the new one
# answers the updating page until the old one is gone.
hold_volume() {
  exec 9>"$STORAGE_PATH/.arkyvree.lock"
  if flock -n 9; then return; fi
  log "The version this one replaces still runs on this volume: waiting for it to stop"
  (run_as "$APP_USER" env UPDATING_PAGE=true ./server-bin) &
  local page=$!
  if ! flock -w 600 9; then
    kill -TERM "$page" 2>/dev/null || true
    die "The version this one replaces didn't stop within 10 minutes"
  fi
  kill -TERM "$page" 2>/dev/null || true
  wait "$page" 2>/dev/null || true
  log "The version this one replaces stopped"
}

# The bundled database, unless DATABASE_URL names another one
start_database() {
  if ! uses_bundled_database; then
    log "Using the database DATABASE_URL names"
    return
  fi
  DATABASE_URL="$(bundled_database_url)"
  export DATABASE_URL DIRECT_DATABASE_URL="$DATABASE_URL"
  hold_volume
  init_postgres
  # A server stopped without its shutdown (ONCE removes the version it replaces at once) leaves its pid file, which
  # would name a live process of this container's: under the lock, nothing else runs on the folder
  rm -f "$PGDATA_DIR/postmaster.pid"
  start_postgres
  ensure_database
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
  stop_postgres
}

on_signal() { STOPPING=1; }

main() {
  read_settings
  prepare_storage
  trap on_signal TERM INT
  start_database
  if [[ "$ROLE" != worker ]]; then
    log "Migrating the database"
    (run_as "$APP_USER" ./migrate-bin) || {
      stop_postgres
      die "The migrations failed"
    }
  fi
  local pids=()
  if [[ "$ROLE" != worker ]]; then
    (run_as "$APP_USER" ./server-bin) &
    SERVER_PID=$!
    pids+=("$SERVER_PID")
  fi
  if [[ "$ROLE" != web ]]; then
    # Below the server's priority: a PDF being drawn leaves the pages responsive
    (run_as "$APP_USER" nice -n 10 ./worker-bin) &
    WORKER_PID=$!
    pids+=("$WORKER_PID")
  fi
  set +e
  wait -n "${pids[@]}"
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
