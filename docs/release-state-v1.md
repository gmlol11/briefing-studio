# Briefing Studio — Release State v1.0.0

Point-in-time snapshot taken to preserve context before the next session.
**Briefing Studio v1.0.0 is finalized but not externally deployed yet.**

## 1. Current release state

| | |
|---|---|
| `main` | `195bc52` |
| `v1.0.0` | `195bc52` (release tag) |
| `intellectual-layer-complete` | `5d5fff0` |
| `document-layer-complete` | `5ea96fe` |
| Alembic head | `0006` |
| prod-like Docker stack | green |
| CI / local | green |

No external deploy has happened. The external server is currently unavailable;
deploy is intentionally not started.

---

## 2. What is complete

### Document Layer
- branded DOCX title/header
- logo in DOCX
- branded preview
- Markdown / JSON / DOCX / PDF exports
- PDF export via Playwright/Chromium
- PDF UI download button
- graceful logo fallback (SSRF-guarded fetch)
- prod-like smoke green

### Intellectual Layer
- richer brand-aware final generation
- richer wizard generation
- epistemic labels: `Факт:` / `Интерпретация:` / `Гипотеза:` / `Направление:`
- regenerate-section enriched and consistent with the document
- user-instruction priority in regenerate-section
- strategic-default only for v1
- no generation modes UI
- prompt-contract tests (no LLM, no DB)
- prod-like QA green

### Release readiness
- deploy runbook exists: `docs/deploy-runbook.md`
- final release smoke green
- DB backup taken before release smoke
- `v1.0.0` tag pushed

---

## 3. Final release smoke evidence

Performed on the local prod-like stack (`docker-compose.prod.yml`), `main @ 195bc52`:

- **Backup:** `~/briefing-backups/briefing_20260629_124949.sql` — `pg_dump`, 393K, non-empty, outside the repo
- backend/frontend rebuilt (no `down -v`; `pgdata_prod` volume preserved)
- `/health` → ok (`database: ok`)
- `/api/brands` → 200
- SPA `/` → 200
- Alembic → `0006 (head)`
- brand-aware generation smoke → green (labels present, strategic sections, no hallucinations)
- wizard generation smoke → green (17 sections in order, AI section "не применимо" when irrelevant, no invented KPI/budget/channels)
- regenerate-section smoke → green (returns only the section; "shorter, no labels" instruction took priority)
- exports md / json / docx / pdf → all 200
- PDF starts with `%PDF`
- DOCX is a valid/openable zip
- UI smoke via `http://localhost/` → green (SPA loads; briefs list; review opens; Copy/Download Markdown, Download JSON, DOCX, PDF buttons present and clickable with no JS errors; export endpoints reachable from SPA origin through nginx → 200)
- backend logs clean: no tracebacks, no 5xx

---

## 4. What is NOT done yet

Explicitly, the following are **NOT** done:

- external server deploy is **NOT** done
- production `.env.prod` for the real server is **NOT** finalized in the repo
- TLS is **NOT** configured in the app compose
- host-level access/auth decision is still required
- real-server DB backup/volume decision is still required
- domain / DNS / reverse proxy is not configured here

---

## 5. Known limitations / decisions

- no app-level auth in v1
- access must be restricted at the host/network level for demo/prod
- TLS must be terminated at a host proxy / LB / Caddy / nginx
- v1 is strategic-default only
- no generation modes UI
- no stored `enrichment_json`
- no second LLM review call
- no async/background jobs
- logo upload storage is absent: only `logo_url` / `data:` URI
- Playwright/Chromium makes the backend image large
- prompt quality is protected by manual QA + prompt-contract tests, not deterministic LLM snapshots

---

## 6. Non-blocking follow-ups

- **`backups/` is NOT yet in `.gitignore`** — the runbook (§5) implies it should be, but the
  repo `.gitignore` does not list it. The release-smoke backup was therefore written outside the
  repo (`~/briefing-backups/`). A background task is flagged to add `backups/` to `.gitignore`;
  **this is still pending, not merged.**
- UI quirk: a brief created via API without going through the template stepper may stay visually
  at step 1 ("Структура документа", marked `!`) and not reach step 5 via the UI; briefs created
  through the full UI flow open and export normally.
- Optional post-v1:
  - auth
  - generation modes (conservative / strategic / creative)
  - stored `enrichment_json`
  - async/background jobs
  - upload storage for logos
  - release notes / GitHub Release body for `v1.0.0`

---

## 7. Next session handoff

- Start from `main @ 195bc52` / tag `v1.0.0`.
- Do not start new feature work before external deploy unless explicitly decided.
- Next logical steps:
  1. get access to the target server
  2. prepare production `.env.prod` (real `POSTGRES_PASSWORD`, `LLM_API_KEY`, valid `LLM_MODEL`)
  3. decide TLS / access / auth (host-level)
  4. take a server-side DB backup if updating an existing instance
  5. follow `docs/deploy-runbook.md`
  6. deploy `v1.0.0`
  7. run the release smoke on the real host
  8. record the deployment result

---

## 8. Commands useful for next session

Get to the release point:

```bash
git checkout main
git pull --ff-only origin main
git checkout v1.0.0
```

Build & run the prod-like stack (needs a filled `.env.prod`):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Health / API / migration checks:

```bash
curl -fsS http://localhost/health
curl -fsS http://localhost/api/brands
curl -I http://localhost/
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend alembic current
```
