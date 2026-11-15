# Shared by the self-hosted image's entrypoint and its ONCE hooks (docs/self-hosting.md): the bundled PostgreSQL, kept
# in /storage/postgres, reached over a unix socket only, never a network interface.
# shellcheck shell=bash

PGDATA_DIR="${STORAGE_PATH:-/storage}/postgres"
PG_SOCKET_DIR=/run/postgresql
APP_USER=arkyvree
APP_DATABASE=arkyvree
PG_PID=""

log() { echo "[entrypoint] $*"; }

die() {
  echo "[entrypoint] $*" >&2
  exit 1
}

# Runs a command as another user, replacing the shell that runs it (no extra process between, so signals reach it)
run_as() {
  local user="$1"
  shift
  exec setpriv --reuid="$user" --regid="$user" --init-groups -- env HOME=/tmp "$@"
}

# Whether the database is the bundled one: no DATABASE_URL from outside (Neon, a managed Postgres)
uses_bundled_database() { [[ -z "${DATABASE_URL:-}" ]]; }

# The bundled database's address, as the server, the worker and the migrations read it
bundled_database_url() { echo "postgresql://${APP_USER}@localhost/${APP_DATABASE}?host=${PG_SOCKET_DIR}"; }

# Creates the data directory on a first start: owned by postgres, local connections only, UTF-8
init_postgres() {
  install -d -o postgres -g postgres -m 2775 "$PG_SOCKET_DIR"
  if [[ -f "$PGDATA_DIR/PG_VERSION" ]]; then return; fi
  log "Creating the database in $PGDATA_DIR"
  install -d -o postgres -g postgres -m 0700 "$PGDATA_DIR"
  (run_as postgres initdb -D "$PGDATA_DIR" -U postgres -E UTF8 --locale=C.UTF-8 --auth-local=trust --auth-host=reject) ||
    die "initdb failed"
}

# Starts PostgreSQL in the background (PG_PID), listening on its socket only, and waits until it takes connections
start_postgres() {
  (run_as postgres postgres -D "$PGDATA_DIR" -c listen_addresses='' -c unix_socket_directories="$PG_SOCKET_DIR") &
  PG_PID=$!
  local tries=0
  until pg_isready -q -h "$PG_SOCKET_DIR" -U postgres; do
    kill -0 "$PG_PID" 2>/dev/null || die "PostgreSQL stopped as it started"
    ((tries++ < 120)) || die "PostgreSQL didn't start within a minute"
    sleep 0.5
  done
}

# Stops PostgreSQL with a fast shutdown (SIGINT): open sessions end, what's committed is kept
stop_postgres() {
  [[ -n "$PG_PID" ]] || return 0
  kill -INT "$PG_PID" 2>/dev/null || true
  wait "$PG_PID" 2>/dev/null || true
  PG_PID=""
}

# The app's role and database, made on a first start: the role owns the database, and isn't a superuser
ensure_database() {
  local psql=(psql -q -v ON_ERROR_STOP=1 -h "$PG_SOCKET_DIR" -U postgres -d postgres -tA)
  if [[ -z "$("${psql[@]}" -c "SELECT 1 FROM pg_roles WHERE rolname = '$APP_USER'")" ]]; then
    "${psql[@]}" -c "CREATE ROLE $APP_USER LOGIN"
  fi
  if [[ -z "$("${psql[@]}" -c "SELECT 1 FROM pg_database WHERE datname = '$APP_DATABASE'")" ]]; then
    "${psql[@]}" -c "CREATE DATABASE $APP_DATABASE OWNER $APP_USER"
  fi
}
