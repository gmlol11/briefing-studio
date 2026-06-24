#!/usr/bin/env sh
# Production entrypoint: apply migrations before serving, then exec the
# container command (uvicorn). Single-node MVP — migrations run on startup.
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting backend..."
exec "$@"
