# Deploy to Yandex Cloud

Production deployment of Briefing Studio to a **Yandex Compute Cloud VM** running
**Docker Compose**, backed by **Yandex Managed PostgreSQL**, with images stored in
**Yandex Container Registry (YCR)**.

This stack is intentionally separate from the local ones:

| File | Purpose | PostgreSQL |
|---|---|---|
| `docker-compose.yml` | local dev (hot reload) | local container |
| `docker-compose.prod.yml` | local single-node prod-like smoke | local container |
| **`docker-compose.yandex.yml`** | **Yandex production** | **Managed PostgreSQL (external)** |

Key production properties:
- images are **pulled from YCR** by `${IMAGE_TAG}` (not built on the VM);
- **no local PostgreSQL** — `DATABASE_URL` points at Managed PostgreSQL;
- migrations run **explicitly** before the app update (not on container startup);
- a dedicated **nginx reverse proxy** is the single public entrypoint (`/` → frontend, `/api` → backend).

---

## 0. Prerequisites

- Yandex Cloud account, a cloud + folder, and the `yc` CLI configured locally.
- A **Container Registry** created: note its id → `YC_REGISTRY=cr.yandex/<registry-id>`.
- A **Managed PostgreSQL** cluster + database + user (SSL enabled by default).
- A **Compute Cloud VM** (Ubuntu LTS is fine) with Docker + Docker Compose plugin.
- Docker authenticated to YCR on both your build host and the VM:
  ```bash
  yc container registry configure-docker
  ```

---

## 1. Build images

Tag images with something stable and unique per build — a git short SHA works well:

```bash
export YC_REGISTRY=cr.yandex/<registry-id>
export IMAGE_TAG=$(git rev-parse --short HEAD)   # e.g. b071fe9

# Backend (FastAPI + Chromium for PDF export)
docker build -t "$YC_REGISTRY/briefing-backend:$IMAGE_TAG" backend/

# Frontend (static production build served by nginx)
docker build -f frontend/Dockerfile.prod -t "$YC_REGISTRY/briefing-frontend:$IMAGE_TAG" frontend/
```

> The frontend image bakes `VITE_API_URL=""` at build time, so the SPA calls the
> API via relative `/api` — resolved by the reverse proxy. No runtime API URL needed.

---

## 2. Push to Yandex Container Registry

```bash
docker push "$YC_REGISTRY/briefing-backend:$IMAGE_TAG"
docker push "$YC_REGISTRY/briefing-frontend:$IMAGE_TAG"
```

Verify:

```bash
yc container image list --repository-name briefing-backend
yc container image list --repository-name briefing-frontend
```

---

## 3. Prepare the VM

On the VM (one-time):

```bash
# Docker + compose plugin (Ubuntu example)
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker "$USER"   # re-login afterwards

# Authenticate Docker to YCR (needs yc configured for this user)
yc container registry configure-docker

# Get the code (only compose + deploy/ + docs are needed on the VM)
git clone <repo-url> briefing-studio && cd briefing-studio
git checkout <release-tag>          # e.g. v1.0.0
```

Networking:
- Open inbound `80` (and `443` if terminating TLS on the VM) in the VM security group.
- Ensure the VM can reach the Managed PostgreSQL host (same network / security group rule on port `6432`).

---

## 4. Create `.env.prod`

`.env.prod` lives at the repo root on the VM and is **gitignored** — never commit it.

```bash
cp deploy/.env.prod.example .env.prod
# edit .env.prod: YC_REGISTRY, DATABASE_URL (Managed PG), LLM_API_KEY, LLM_MODEL
```

Required values:

| Var | Notes |
|---|---|
| `YC_REGISTRY` | `cr.yandex/<registry-id>` |
| `IMAGE_TAG` | default tag if not passed to `deploy.sh` |
| `DATABASE_URL` | `postgresql+psycopg://<user>:<pw>@<managed-host>:6432/<db>?sslmode=require` |
| `APP_ENV` | `production` |
| `DEBUG` | `false` |
| `CORS_ORIGINS` | empty for same-origin via proxy; else the real frontend domain |
| `LLM_API_KEY` | secret |
| `LLM_BASE_URL` | e.g. `https://api.openai.com/v1` |
| `LLM_MODEL` | exact production model id |
| `LLM_TIMEOUT_SECONDS` | e.g. `60` |

**Managed PostgreSQL SSL:** `sslmode=require` encrypts the connection without CA
verification (simplest). For stricter security use `sslmode=verify-full` and mount
the Yandex CA into the backend container:

```bash
# download the CA once on the VM
mkdir -p ~/.postgresql
curl -sf https://storage.yandexcloud.net/cloud-certs/CA.pem -o ~/.postgresql/root.crt
```
then add `&sslrootcert=/root/.postgresql/root.crt` to `DATABASE_URL` and mount the
file into the backend service (a small compose override).

**`.env.prod` is a Docker Compose env-file, not a shell script.** It is passed to
Compose with `--env-file .env.prod`, which reads it as `KEY=VALUE` lines (no shell
evaluation) for both container env and `${VAR}` interpolation. The deploy/rollback
scripts do **not** `source` it — they only read `YC_REGISTRY` / `IMAGE_TAG` literally.
This is deliberate: `DATABASE_URL` may contain characters that are special to the
shell (`&`, `#`, `$`, `!` — e.g. the `&sslrootcert=...` above), and those must be
left untouched. Do **not** wrap values in extra quotes hoping the shell will strip
them; write them plain, exactly as Compose expects.

---

## 5. Run migrations (explicit)

Migrations are applied **explicitly** — never hidden in container startup. This runs
a one-off backend container against Managed PostgreSQL:

```bash
IMAGE_TAG=$IMAGE_TAG docker compose -f docker-compose.yandex.yml --env-file .env.prod \
  run --rm backend alembic upgrade head
```

`deploy/deploy.sh` does this step for you (step 2/4). Run migrations **before**
starting the new app version so the schema is ready when traffic arrives.

Check the current revision:

```bash
docker compose -f docker-compose.yandex.yml --env-file .env.prod \
  run --rm backend alembic current
```

---

## 6. First deploy

Take a DB backup first if the cluster already holds data (Managed PostgreSQL has
automated backups; you can also trigger a manual one via `yc managed-postgresql cluster backup`).

Then:

```bash
./deploy/deploy.sh $IMAGE_TAG
```

`deploy.sh` does, in order:
1. pull `briefing-backend` / `briefing-frontend` at `$IMAGE_TAG` from YCR,
2. run `alembic upgrade head` (explicit),
3. `docker compose ... up -d`,
4. run `deploy/smoke.sh`.

Do **not** run `docker compose down -v` here — there is no local volume to keep, but
`down` would stop the public entrypoint unnecessarily; `up -d` performs a rolling update.

---

## 7. Health checks

Through the reverse proxy (public entrypoint):

```bash
curl -fsS http://localhost/health           # backend health -> {"status":"ok",...}
curl -I   http://localhost/                  # frontend root  -> 200
curl -fsS http://localhost/api/brands        # API via proxy  -> 200 JSON
```

Migration state:

```bash
docker compose -f docker-compose.yandex.yml --env-file .env.prod \
  run --rm backend alembic current           # -> <head rev> (head)
```

---

## 8. Smoke tests

```bash
./deploy/smoke.sh                                   # against http://localhost
SMOKE_BASE_URL=https://briefs.example.com ./deploy/smoke.sh
```

Checks: backend `/health`, frontend root, and API `/api/brands` through the proxy.
Exits non-zero on any failure (so it can gate deploy/rollback).

---

## 9. Rollback

Roll back to a previous, known-good tag (its images must still be in YCR):

```bash
./deploy/rollback.sh <PREVIOUS_IMAGE_TAG>
```

This pulls the previous tag and restarts the services. It **does not** downgrade the
database — migrations are additive and an ordinary code rollback keeps the schema.
If a real schema downgrade is required, do it manually after restoring a backup:

```bash
docker compose -f docker-compose.yandex.yml --env-file .env.prod \
  run --rm backend alembic downgrade <rev>
```

Tip: keep the previous tag handy before each deploy so rollback is one command.

---

## 10. Logs

```bash
# all services
docker compose -f docker-compose.yandex.yml --env-file .env.prod logs --tail=200

# one service, follow
docker compose -f docker-compose.yandex.yml --env-file .env.prod logs -f backend
docker compose -f docker-compose.yandex.yml --env-file .env.prod logs -f reverseproxy

# running containers
docker compose -f docker-compose.yandex.yml --env-file .env.prod ps
```

Look for: no tracebacks, no unexpected 5xx. A `409` is expected only when a brief
hits the critical/conflict gate intentionally.

---

## 11. Frequent updates (after user feedback)

The normal update loop is cheap:

```bash
# on the build host
export IMAGE_TAG=$(git rev-parse --short HEAD)
docker build -t "$YC_REGISTRY/briefing-backend:$IMAGE_TAG" backend/
docker build -f frontend/Dockerfile.prod -t "$YC_REGISTRY/briefing-frontend:$IMAGE_TAG" frontend/
docker push "$YC_REGISTRY/briefing-backend:$IMAGE_TAG"
docker push "$YC_REGISTRY/briefing-frontend:$IMAGE_TAG"

# on the VM
git pull   # to get compose/deploy changes, if any
./deploy/deploy.sh $IMAGE_TAG
```

If a deploy misbehaves, `./deploy/rollback.sh <previous-tag>` restores the last good build.

---

## 12. TLS / access notes

- This compose exposes plain HTTP on `:80`. For production, terminate TLS either:
  - on the VM (extend `deploy/nginx.conf` with a `443` server block + certs, e.g. via Certbot), or
  - upstream with a **Yandex Application Load Balancer** / managed certificate.
- There is **no application-level auth**. Restrict access at the network level
  (security groups / VPN / an auth-enabled proxy) for any non-public deployment.
