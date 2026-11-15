# Shared by the self-hosted image's entrypoint and its ONCE hooks (docs/self-hosting.md): the bundled PostgreSQL, kept
# in /storage/postgres, reached over a unix socket only, never a network interface. Each OS user connects as its own
# role (peer authentication): the app as `arkyvree`, which owns its database and isn't a superuser; the admin steps
# (creating the database, dumping and loading it) as `postgres`.
# shellcheck shell=bash

STORAGE_PATH="${STORAGE_PATH:-/storage}"
PGDATA_DIR="$STORAGE_PATH/postgres"
PG_SOCKET_DIR=/run/postgresql
APP_USER=arkyvree
APP_DATABASE=arkyvree
PG_PID=""

log() { echo "[entrypoint] $*"; }

die() {
  echo "[entrypoint] $*" >&2
  exit 1
}

# Runs a command as another user, replacing the shell that runs it (no extra process between, so signals reach it):
# call it in a subshell, `(run_as user cmd)`
run_as() {
  local user="$1"
  shift
  exec setpriv --reuid="$user" --regid="$user" --init-groups -- env HOME=/tmp "$@"
}

# psql as the postgres superuser, on the maintenance database
psql_admin() { (run_as postgres psql -q -v ON_ERROR_STOP=1 -h "$PG_SOCKET_DIR" -d postgres -tA "$@"); }

# Whether the database is the bundled one: no DATABASE_URL from outside (Neon, a managed Postgres)
uses_bundled_database() { [[ -z "${DATABASE_URL:-}" ]]; }

# The bundled database's address, as the server, the worker and the migrations read it (as the arkyvree OS user)
bundled_database_url() { echo "postgresql://${APP_USER}@localhost/${APP_DATABASE}?host=${PG_SOCKET_DIR}"; }

# Gives `dir` and everything in it to `owner` when anything in it belongs to someone else: a restored backup, or an
# image whose users' ids changed. The check stops at the first file that differs, so a start that needs nothing is quick
own_tree() {
  local owner="$1" dir="$2"
  [[ -e "$dir" ]] || return 0
  if [[ -n "$(find "$dir" \( ! -user "$owner" -o ! -group "$owner" \) -print -quit)" ]]; then
    log "Giving $dir back to $owner"
    chown -R "$owner:$owner" "$dir"
  fi
}

# Creates the data directory on a first start, in a temporary folder renamed into place once whole: a start stopped
# halfway leaves no folder that can't start
init_postgres() {
  install -d -o postgres -g postgres -m 2775 "$PG_SOCKET_DIR"
  if [[ -f "$PGDATA_DIR/PG_VERSION" ]]; then return; fi
  log "Creating the database in $PGDATA_DIR"
  local building="$PGDATA_DIR.creating"
  rm -rf "$building"
  install -d -o postgres -g postgres -m 0700 "$building"
  (run_as postgres initdb -D "$building" -U postgres -E UTF8 --locale=C.UTF-8 --auth-local=peer --auth-host=reject) ||
    die "initdb failed"
  rm -rf "$PGDATA_DIR"
  mv "$building" "$PGDATA_DIR"
}

# Starts PostgreSQL in the background (PG_PID), listening on its socket only, and waits until it takes connections; a
# stop asked meanwhile (`STOPPING`, the entrypoint's) ends the wait
start_postgres() {
  (run_as postgres postgres -D "$PGDATA_DIR" -c listen_addresses='' -c unix_socket_directories="$PG_SOCKET_DIR") &
  PG_PID=$!
  local tries=0
  until (run_as postgres pg_isready -q -h "$PG_SOCKET_DIR" -d postgres); do
    [[ -z "${STOPPING:-}" ]] || return 1
    kill -0 "$PG_PID" 2>/dev/null || die "PostgreSQL stopped as it started"
    ((tries++ < 600)) || die "PostgreSQL didn't start within five minutes"
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
  if [[ -z "$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname = '$APP_USER'")" ]]; then
    psql_admin -c "CREATE ROLE $APP_USER LOGIN"
  fi
  if [[ -z "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$APP_DATABASE'")" ]]; then
    psql_admin -c "CREATE DATABASE $APP_DATABASE OWNER $APP_USER"
  fi
}
