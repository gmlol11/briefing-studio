#!/usr/bin/env bash
# Roll the running stack back to a PREVIOUS image tag.
#
# Rollback = re-point the services at an earlier, known-good IMAGE_TAG and
# restart. Images for that tag must still exist in the registry.
#
# IMPORTANT — database:
#   This script does NOT downgrade the database. Migrations 0001..NNNN are
#   additive; an ordinary code rollback keeps the schema as-is and works.
#   If the previous release genuinely needs a schema downgrade, do it manually
#   and deliberately (alembic downgrade <rev>) AFTER restoring a backup — never
#   as a silent part of rollback.
#
# Usage:
#   ./deploy/rollback.sh <PREVIOUS_IMAGE_TAG>
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.prod"
COMPOSE_FILE="docker-compose.yandex.yml"

PREV_TAG="${1:-}"
if [ -z "$PREV_TAG" ]; then
  echo "Usage: ./deploy/rollback.sh <PREVIOUS_IMAGE_TAG>" >&2
  exit 2
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found." >&2
  exit 1
fi

# Read ONLY YC_REGISTRY from the env file, WITHOUT sourcing it. .env.prod is a
# Docker Compose env-file, NOT a shell script: DATABASE_URL and other values may
# contain shell-special characters (& # $ !). Container env still comes from
# `docker compose --env-file $ENV_FILE`; IMAGE_TAG here comes from the CLI arg.
read_env() {
  # read_env KEY FILE -> literal value (last match wins), surrounding quotes stripped.
  local key="$1" file="$2" line val=""
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"   # strip leading whitespace
    case "$line" in
      "#"*|"") continue ;;
      "$key="*) val="${line#*=}" ;;
    esac
  done < "$file"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

YC_REGISTRY="$(read_env YC_REGISTRY "$ENV_FILE")"
export IMAGE_TAG="$PREV_TAG"
: "${YC_REGISTRY:?YC_REGISTRY must be set in .env.prod}"

COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

echo "==> Rolling back briefing-studio to tag=$PREV_TAG"
echo "    (DB is NOT downgraded — see notes in this script.)"

echo "==> Pulling images for tag=$PREV_TAG..."
$COMPOSE pull

echo "==> Restarting services on tag=$PREV_TAG..."
$COMPOSE up -d

echo "==> Current state:"
$COMPOSE ps

echo "==> Smoke test..."
"$(dirname "$0")/smoke.sh"

echo "==> Rollback complete: tag=$PREV_TAG"
