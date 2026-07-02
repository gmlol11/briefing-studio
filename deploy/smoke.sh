#!/usr/bin/env bash
# Production smoke test — checks the three critical paths through the running
# stack. Non-zero exit on any failure (so deploy/rollback can gate on it).
#
# Checks:
#   1. backend /health           (via the reverse proxy)
#   2. frontend root page        (SPA served through the proxy)
#   3. API through reverse proxy (/api/brands)
#
# Usage:
#   ./deploy/smoke.sh                          # against http://localhost
#   SMOKE_BASE_URL=https://briefs.example.com ./deploy/smoke.sh
set -euo pipefail

BASE_URL="${SMOKE_BASE_URL:-http://localhost}"
fail=0

echo "==> Smoke against $BASE_URL"

# curl failures (connection refused etc.) must not abort the script under
# set -e — every check should report OK/FAIL and the script exits at the end.

# 1. backend /health via proxy — expect JSON with "status":"ok"
echo -n "  [1/3] backend /health ......... "
body=$(curl -fsS --max-time 15 "$BASE_URL/health" 2>/dev/null || true)
if echo "$body" | grep -q '"status":"ok"'; then
  echo "OK"
else
  echo "FAIL"; fail=1
fi

# 2. frontend root — expect HTTP 200
echo -n "  [2/3] frontend root / ......... "
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE_URL/" || true)
if [ "$code" = "200" ]; then
  echo "OK ($code)"
else
  echo "FAIL ($code)"; fail=1
fi

# 3. API through reverse proxy — expect HTTP 200
echo -n "  [3/3] API /api/brands ......... "
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE_URL/api/brands" || true)
if [ "$code" = "200" ]; then
  echo "OK ($code)"
else
  echo "FAIL ($code)"; fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "==> Smoke PASSED"
else
  echo "==> Smoke FAILED" >&2
fi
exit "$fail"
