#!/usr/bin/env bash
# Readies a Claude Code cloud session (Claude Code on the web), run by the SessionStart hook in .claude/settings.json
# on every session and resume: PostgreSQL started (pre-installed, not running), the dependencies installed, .env.test
# written from .env.test.example, and the test database seeded when its seeds changed. Does nothing outside the cloud,
# where CLAUDE_CODE_REMOTE is never "true". What it prints is the session's first context, so it says what's ready.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

LOG=/tmp/cloud-session-start.log
STATE=.cloud-session
mkdir -p "$STATE"
ready=()
problems=()

log() { echo "[$(date +%T)] $*" >> "$LOG"; }

# Root in the cloud's VM; through sudo otherwise
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
as_postgres() { if [ "$(id -u)" -eq 0 ]; then runuser -u postgres -- "$@"; else sudo -u postgres "$@"; fi; }

# PostgreSQL 16, as .env.test.example's role and database, on the port the cluster listens on
start_postgres() {
  as_root service postgresql start >> "$LOG" 2>&1 || return 1
  local port
  port=$(as_postgres psql -tAc 'show port' 2>> "$LOG") || return 1
  as_postgres psql -tAc "select 1 from pg_roles where rolname = 'devuser'" 2>> "$LOG" | grep -q 1 ||
    as_postgres psql -c "create role devuser login superuser password 'devpass'" >> "$LOG" 2>&1 || return 1
  as_postgres psql -tAc "select 1 from pg_database where datname = 'arkyvree_test'" 2>> "$LOG" | grep -q 1 ||
    as_postgres createdb -O devuser arkyvree_test >> "$LOG" 2>&1 || return 1
  # The example's port is docker compose's (5433); the cluster's is its own
  sed "s#@localhost:5433/#@localhost:${port}/#" .env.test.example > .env.test
  ready+=("PostgreSQL on :${port} (devuser, arkyvree_test), .env.test written")
}

# bun install, once per lockfile. Bun is known to have trouble with the cloud's security proxy: retried with the
# system's CA bundle, which the proxy's certificate is trusted through
install_dependencies() {
  local stamp="$STATE/bun.lock.sha"
  local sum
  sum=$(sha256sum bun.lock | cut -d' ' -f1)
  if [ -d node_modules ] && [ "$(cat "$stamp" 2>/dev/null)" = "$sum" ]; then
    ready+=("dependencies already installed")
    return 0
  fi
  if bun install --frozen-lockfile >> "$LOG" 2>&1 ||
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt bun install --frozen-lockfile >> "$LOG" 2>&1; then
    echo "$sum" > "$stamp"
    ready+=("dependencies installed (bun install)")
    return 0
  fi
  return 1
}

# The test database, seeded again when what seeds it changed: the schema, the content, the seeders and the scripts
seed_test_database() {
  local stamp="$STATE/seeds.sha"
  local sum
  sum=$(git rev-parse HEAD:drizzle HEAD:content HEAD:database HEAD:scripts/db 2>/dev/null | sha256sum | cut -d' ' -f1)
  if [ "$(cat "$stamp" 2>/dev/null)" = "$sum" ]; then
    ready+=("test database already seeded")
    return 0
  fi
  if bun run test:db:reset >> "$LOG" 2>&1; then
    echo "$sum" > "$stamp"
    ready+=("test database seeded (bun run test:db:reset)")
    return 0
  fi
  return 1
}

log "session start in $(pwd)"
# The diff base `bun run test:changed` reads (scripts/parent-branch.sh), absent from a shallow or single-branch clone
git fetch -q origin develop >> "$LOG" 2>&1 || problems+=("git fetch origin develop failed")

if start_postgres; then
  if install_dependencies; then
    seed_test_database || problems+=("seeding the test database failed")
  else
    problems+=("bun install failed, even with the system CA bundle (Bun and the cloud proxy)")
  fi
else
  problems+=("PostgreSQL didn't start")
fi

echo "Cloud session setup (scripts/cloud/session-start.sh, log ${LOG}):"
for line in "${ready[@]}"; do echo "- ready: ${line}"; done
for line in "${problems[@]}"; do echo "- PROBLEM: ${line}: read ${LOG}"; done
exit 0
