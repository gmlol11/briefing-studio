#!/usr/bin/env bash
# Deploy (or update) the Yandex production stack.
#
# Steps, in order and explicit:
#   1. load env, resolve IMAGE_TAG
#   2. pull the pinned images from Yandex Container Registry
#   3. run Alembic migrations EXPLICITLY (one-off backend container)
#   4. (re)start services with the new tag
#   5. smoke-test
#
# Usage:
#   ./deploy/deploy.sh <IMAGE_TAG>     # deploy a specific tag
#   ./deploy/deploy.sh                 # use IMAGE_TAG from .env.prod
#
# Requires: docker, docker compose, a filled .env.prod at the repo root,
# and `yc`/docker login to the registry already done on this host.
set -euo pipefail

# Always run from the repo root (parent of this script's dir).
cd "$(dirname "$0")/.."

ENV_FILE=".env.prod"
COMPOSE_FILE="docker-compose.yandex.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy deploy/.env.prod.example -> .env.prod and fill it." >&2
  exit 1
fi

# Load YC_REGISTRY / IMAGE_TAG / etc. into the shell so compose can interpolate
# ${YC_REGISTRY} and ${IMAGE_TAG} in docker-compose.yandex.yml.
set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

# CLI arg overrides IMAGE_TAG from the env file.
IMAGE_TAG="${1:-${IMAGE_TAG:-}}"
export IMAGE_TAG

: "${YC_REGISTRY:?YC_REGISTRY must be set in .env.prod}"
: "${IMAGE_TAG:?IMAGE_TAG must be set (pass as arg or set in .env.prod)}"

COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

echo "==> Deploying briefing-studio  registry=$YC_REGISTRY  tag=$IMAGE_TAG"

echo "==> [1/4] Pulling images..."
$COMPOSE pull

echo "==> [2/4] Running database migrations (explicit, before app update)..."
# One-off backend container; overrides the uvicorn command with alembic.
$COMPOSE run --rm backend alembic upgrade head

echo "==> [3/4] Starting/updating services..."
$COMPOSE up -d

echo "==> Current state:"
$COMPOSE ps

echo "==> [4/4] Smoke test..."
"$(dirname "$0")/smoke.sh"

echo "==> Deploy complete: tag=$IMAGE_TAG"
