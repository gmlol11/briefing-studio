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

set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

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
