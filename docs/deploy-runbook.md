# Briefing Studio — Deploy Runbook (v1)

Authoritative, single-source runbook for a production-like / production deploy of
Briefing Studio v1. Consolidates env, deploy steps, health/smoke, backup, rollback,
and host-level decisions that live outside the app (TLS / access / auth).

## 1. Purpose & release candidate

Runbook for deploying Briefing Studio **v1**.

Current release candidate:
- `main @ 5d5fff0`
- tag `document-layer-complete` (Document Layer closed)
- tag `intellectual-layer-complete` (Intellectual Layer closed)
- Alembic head: `0006`
- planned release tag: **`v1.0.0`** (set only after final release smoke — see §11)

This document is descriptive: the actual host deploy (machine, DNS, TLS, secrets)
remains a manual step performed by the operator.

---

## 2. Architecture

```
Internet → frontend nginx :80      (the only public entrypoint)
              ├─ /         → SPA   (try_files → index.html, client-side routing)
              ├─ /api/     → backend:8000   (prefix preserved)
              └─ /health   → backend:8000/health
backend:8000  (internal, not published)
              entrypoint: alembic upgrade head → uvicorn (2 workers)
db:5432       (internal, not published)
              volume: pgdata_prod
```

Fixed facts:
- **External 5432 is not needed** — Postgres is reachable only on the compose network.
- **Persistent volume is needed only for Postgres** (`pgdata_prod`).
- **No upload/object storage.** Brand logos come via `logo_url` or `data:` URI and are
  fetched into memory at export time — nothing is written to disk.
- **PDF export uses Playwright/Chromium baked into the backend image** (large image;
  slow first build).
- Migrations are applied automatically on backend startup (`backend/entrypoint.sh`),
  single-node.

---

## 3. Required env vars

Source file: `.env.prod` (gitignored; template `.env.prod.example` is committed).
**Never commit real secrets.** Examples below contain no secrets.

| Var | Purpose | Secret | Example (no secrets) | Production notes |
|---|---|---|---|---|
| `POSTGRES_USER` | DB role | no | `briefing` | |
| `POSTGRES_DB` | DB name | no | `briefing` | |
| `POSTGRES_PASSWORD` | DB password | **yes** | `<strong-password>` | strong, unique |
| `DATABASE_URL` | backend → db DSN | **yes** (embeds pw) | `postgresql+psycopg://briefing:<pw>@db:5432/briefing` | host is `db` (service name), not localhost |
| `APP_ENV` | environment flag | no | `production` | |
| `DEBUG` | debug toggle | no | `false` | must be `false` in prod |
| `CORS_ORIGINS` | allowed CORS origins | no | *(empty)* | empty is fine for same-origin (nginx); set real domain only if frontend/API are on different origins |
| `LLM_API_KEY` | LLM auth | **yes** | `<provider-key>` | without it AI endpoints return 503; rest of app works |
| `LLM_BASE_URL` | LLM endpoint | no | `https://api.openai.com/v1` | OpenAI-compatible |
| `LLM_MODEL` | model id | no | `<valid-prod-model-id>` | **must be a valid production model id — do not blindly copy the dev value**; case-sensitive (verify via `GET {LLM_BASE_URL}/models`) |
| `LLM_TIMEOUT_SECONDS` | request timeout | no | `60` | |
| `VITE_API_URL` | frontend API base (build-time) | no | *(empty)* | empty → client uses relative `/api` (same-origin), nginx proxies it |

Notes:
- `.env.prod` is **gitignored**; `.env.prod.example` documents the shape.
- For same-origin via nginx, both `VITE_API_URL` and `CORS_ORIGINS` can be empty.
- `VITE_API_URL` is consumed at **build time** (frontend image) — rebuild frontend if it changes.

---

## 4. Pre-deploy checklist

- [ ] CI green on `main`
- [ ] `git status` clean, on `main`, at the intended release commit
- [ ] `.env.prod` filled with real secrets (`POSTGRES_PASSWORD`, `LLM_API_KEY`, valid `LLM_MODEL`)
- [ ] DB backup / snapshot taken (see §5)
- [ ] TLS / access / auth decision made (see §10)
- [ ] Disk space OK (backend image with Chromium is large)
- [ ] Alembic head known = `0006`
- [ ] Previous stable tags known for rollback:
  - `intellectual-layer-complete` (current)
  - `intellectual-layer-b1`
  - `document-layer-complete`

---

## 5. Backup

Take a backup **before** every deploy that could touch data or run migrations.

### Recommended — `pg_dump` from the db container

`.env.prod` is not auto-sourced into the host shell, so export its vars first
(do not commit anything; this only loads them into the current shell):

```bash
set -a; . ./.env.prod; set +a            # load POSTGRES_USER/POSTGRES_DB into shell
mkdir -p backups
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "backups/briefing_$(date +%Y%m%d_%H%M%S).sql"
```

Verify the dump exists and is non-empty:

```bash
ls -lh backups/ | tail -1
test -s backups/briefing_*.sql && echo "dump OK (non-empty)" || echo "DUMP EMPTY — STOP"
```

`backups/` is outside version control — do not commit dumps.

### Alternative — volume / host snapshot

Snapshot the Docker volume `pgdata_prod` (or take a host-level disk/VM snapshot)
while the stack is briefly stopped or using your platform's volume backup tooling.

---

## 6. Deploy / rebuild steps

```bash
git checkout main
git pull --ff-only origin main
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

- **Do not** run `down -v` — it destroys the `pgdata_prod` volume (data loss).
- First backend build can be slow/large due to Chromium install.
- Migrations run automatically on backend startup (`alembic upgrade head`).
- After a prompt change, the backend image must be rebuilt — prompt `.md` files are
  baked into the image.

---

## 7. Health checks

```bash
curl -fsS http://localhost/health
curl -fsS http://localhost/api/brands
curl -I http://localhost/
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend alembic current
```

Expected:
- `/health` → `{"status":"ok",...,"database":"ok"}`
- `/api/brands` → `200`
- SPA `/` → `200 OK`
- Alembic → `0006 (head)`

---

## 8. Release smoke checks

Quick functional pass on the running stack:

- **Brand-aware generation** — run final generation on a brand-aware brief without
  `critical_missing`/`conflict`; confirm `generated_markdown` updates, epistemic labels
  (`Факт:` / `Интерпретация:` / `Гипотеза:` / `Направление:`) present, no invented facts.
- **Wizard generation** — run generate on a wizard brief; confirm 17 sections in order,
  labels present, AI section says "не применимо" when there is no AI data, no invented
  KPI/budget/channels.
- **Regenerate-section** — rewrite one section; confirm it returns only that section, keeps
  the enriched style, and that a "make it shorter, no labels" instruction takes priority.
- **Exports** — `md`, `json`, `docx`, `pdf` each return `200`; PDF begins with `%PDF`;
  DOCX opens (valid zip).

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs backend --tail=300
```

Expected: no tracebacks, no unexpected 5xx. (A `409` is fine only if you intentionally
exercised the critical/conflict gate.)

---

## 9. Rollback

For an ordinary code rollback:

```bash
git checkout <previous-tag-or-commit>
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Rollback targets:
- `intellectual-layer-b1`
- `document-layer-complete`
- a specific commit hash

Migrations:
- Migrations `0001`–`0006` are **additive**, and the v1 deploy **adds no new migrations**
  (Intellectual Layer was prompt/docs/tests-only).
- **Migration rollback (downgrade) is normally NOT required** to roll back this release —
  the schema stays at `0006`.
- **Restore the DB only if data corruption occurred**, not for an ordinary code rollback.
  Restore from the §5 backup.

---

## 10. Known limitations / release decisions

- **No auth in the app** — restrict access at the host/network level (VPN, basic-auth on a
  host proxy, firewall) for any production/demo exposure.
- **TLS is not handled by the app compose** — terminate TLS at a host proxy / LB / Caddy /
  nginx in front of `:80`.
- **v1 is strategic-default only** — no generation-modes UI (see `intellectual-layer-audit.md`).
- **No stored `enrichment_json`** — enrichment happens inside the single generation call.
- **No async/background jobs** — generation is synchronous (2 uvicorn workers).
- **No second LLM review call** — prompt quality is guarded by manual QA + prompt-contract tests.
- **Data persistence is the DB volume only** (`pgdata_prod`) — back it up.
- **No logo upload storage** — only `logo_url` / `data:` URI (SSRF-guarded fetch at export time).
- **LLM unavailability** returns errors for AI actions; basic app and `/health` stay alive.

---

## 11. Final release tag plan

Recommended release tag: **`v1.0.0`** (SemVer — tooling-friendly, GitHub Releases compatible,
separate from the internal `*-complete` layer tags).

Set the tag **only after** a final release smoke (§7–§8) passes on a clean build:

```bash
git tag -a v1.0.0 -m "Briefing Studio v1.0.0"
git push origin v1.0.0
```
