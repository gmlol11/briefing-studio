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

# Read ONLY the two variables the shell itself needs (YC_REGISTRY, IMAGE_TAG)
# from the env file, WITHOUT sourcing it. .env.prod is a Docker Compose env-file,
# NOT a shell script: DATABASE_URL and other values may contain characters that
# are special to the shell (& # $ !), so it must never be `source`d here.
# Every container's env still comes from `docker compose --env-file $ENV_FILE`.
read_env() {
  # read_env KEY FILE -> literal value (last match wins), surrounding quotes stripped.
  # No shell evaluation: the value is taken verbatim after the first '='.
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

# YC_REGISTRY is only needed for the message/validation below; NOT exported, so
# Compose reads it from --env-file for ${YC_REGISTRY} interpolation.
YC_REGISTRY="$(read_env YC_REGISTRY "$ENV_FILE")"

# CLI arg overrides IMAGE_TAG from the env file. Exported so Compose uses it for
# ${IMAGE_TAG} interpolation (an exported shell var wins over --env-file).
IMAGE_TAG="${1:-$(read_env IMAGE_TAG "$ENV_FILE")}"
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
