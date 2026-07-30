#!/usr/bin/env bash
# Deletes one user (by email) or ALL users from the database.
# Related rows (Account, Session, OrganisationMembership, EmailVerificationToken,
# PasswordResetToken, Invitation) cascade-delete via FK constraints; AuditEvent
# rows are kept with userId set to NULL (ON DELETE SET NULL).
#
# Usage:
#   scripts/clear-users.sh --email user@example.com [--yes]
#   scripts/clear-users.sh --all [--yes]
#
# Options:
#   --email <email>   Delete a single user by email (case-insensitive).
#   --all             Delete every user in the table.
#   --yes             Skip the interactive confirmation prompt (for CI/automation).
#   --db-url <url>    Postgres connection string. Defaults to $DATABASE_URL,
#                     falling back to .env / .env.local in the repo root.
#   --docker <name>   Run psql inside the named Docker container instead of
#                     connecting directly (handy for local dev, e.g.
#                     mail-orbyt-postgres-1).
#
# This script is safe to point at production: it always shows the affected
# row count and target database before touching anything, and requires
# typed confirmation unless --yes is passed.

set -euo pipefail

EMAIL=""
MODE=""
ASSUME_YES=false
DB_URL="${DATABASE_URL:-}"
DOCKER_CONTAINER=""

usage() {
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      MODE="email"
      EMAIL="${2:-}"
      shift 2
      ;;
    --all)
      MODE="all"
      shift
      ;;
    --yes)
      ASSUME_YES=true
      shift
      ;;
    --db-url)
      DB_URL="${2:-}"
      shift 2
      ;;
    --docker)
      DOCKER_CONTAINER="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  echo "Error: pass either --email <email> or --all." >&2
  usage
fi

if [[ "$MODE" == "email" && -z "$EMAIL" ]]; then
  echo "Error: --email requires a value." >&2
  exit 1
fi

# Fall back to .env / .env.local in the repo root if DATABASE_URL wasn't
# supplied on the command line or already in the environment.
if [[ -z "$DB_URL" && -z "$DOCKER_CONTAINER" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  for envfile in "$REPO_ROOT/.env.local" "$REPO_ROOT/.env"; do
    if [[ -f "$envfile" ]]; then
      DB_URL="$(grep -E '^DATABASE_URL=' "$envfile" | tail -n1 | cut -d= -f2-)"
      [[ -n "$DB_URL" ]] && break
    fi
  done
fi

if [[ -z "$DB_URL" && -z "$DOCKER_CONTAINER" ]]; then
  echo "Error: no database connection available. Pass --db-url, --docker <container>," >&2
  echo "set \$DATABASE_URL, or add DATABASE_URL to .env / .env.local." >&2
  exit 1
fi

# psql often isn't installed locally on dev machines that only run Postgres
# via Docker. If it's missing and the target is clearly local, fall back to
# a running Postgres container automatically; never do this for a non-local
# --db-url, since that could silently point at the wrong database.
if [[ -z "$DOCKER_CONTAINER" ]] && ! command -v psql >/dev/null 2>&1; then
  if [[ "$DB_URL" =~ @(localhost|127\.0\.0\.1)[:/] ]]; then
    MATCHES="$(docker ps --format '{{.Names}}\t{{.Image}}' 2>/dev/null | grep -i postgres || true)"
    MATCH_COUNT="$(echo "$MATCHES" | grep -c . || true)"
    if [[ "$MATCH_COUNT" == "1" ]]; then
      DOCKER_CONTAINER="$(echo "$MATCHES" | cut -f1)"
      echo "Note: psql not found locally; using Docker container '${DOCKER_CONTAINER}' instead." >&2
    else
      echo "Error: psql is not installed and no single running Postgres container could be" >&2
      echo "auto-detected (found: ${MATCH_COUNT:-0}). Install psql (e.g. 'brew install libpq'" >&2
      echo "and add it to PATH) or pass --docker <container-name> explicitly." >&2
      exit 1
    fi
  else
    echo "Error: psql is not installed. Install it (e.g. 'brew install libpq' and add it to" >&2
    echo "PATH) to run this script against a non-local database." >&2
    exit 1
  fi
fi

run_sql() {
  local sql="$1"
  if [[ -n "$DOCKER_CONTAINER" ]]; then
    docker exec "$DOCKER_CONTAINER" psql -v ON_ERROR_STOP=1 -t -A -U "${DB_USER:-mail_orbyt}" -d "${DB_NAME:-mail_orbyt}" -c "$sql"
  else
    psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A -c "$sql"
  fi
}

if [[ "$MODE" == "email" ]]; then
  # Escape single quotes for safe interpolation into the SQL literal.
  ESCAPED_EMAIL="${EMAIL//\'/\'\'}"
  WHERE_CLAUSE="lower(email) = lower('${ESCAPED_EMAIL}')"
  TARGET_DESC="user with email '${EMAIL}'"
else
  WHERE_CLAUSE="true"
  TARGET_DESC="ALL users"
fi

COUNT="$(run_sql "SELECT count(*) FROM \"User\" WHERE ${WHERE_CLAUSE};" | tr -d '[:space:]')"

if [[ -z "$COUNT" || "$COUNT" == "0" ]]; then
  echo "No matching user(s) found for: ${TARGET_DESC}. Nothing to do."
  exit 0
fi

TARGET_LABEL="${DOCKER_CONTAINER:-${DB_URL}}"
echo "About to delete ${COUNT} row(s) from \"User\" (${TARGET_DESC})"
echo "Target database: ${TARGET_LABEL}"
echo "Cascades to: Account, Session, OrganisationMembership, EmailVerificationToken,"
echo "             PasswordResetToken, Invitation (AuditEvent.userId is set to NULL)."

if [[ "$ASSUME_YES" != "true" ]]; then
  read -r -p "Type DELETE to confirm: " CONFIRMATION
  if [[ "$CONFIRMATION" != "DELETE" ]]; then
    echo "Aborted — confirmation did not match."
    exit 1
  fi
fi

run_sql "DELETE FROM \"User\" WHERE ${WHERE_CLAUSE};"
echo "Done. Deleted ${COUNT} user(s)."
