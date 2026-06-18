Briefing Studio — Handoff Summary
1. Git state
Branch: main @ 74841b3 — "Merge brand-aware freeform briefing flow" (no-ff merge commit). Working tree clean.
Remote: origin → https://github.com/gmlol11/briefing-studio.git. main tracks origin/main and is pushed & in sync.
Tags (both pushed to GitHub):
brand-aware-mvp-merged → 74841b3 (stable point: main with brand-aware flow).
mvp-stable-before-brand-flow → 246269b (pre-feature rollback point).
On GitHub: only main + the two tags. The feature/brand-aware-freeform-flow branch is local-only (not pushed; not deleted).
Migrations: 0001 → 0004 (latest 0004_brand_freeform.py).
2. What's implemented — two briefing modes
Wizard-flow (original): 8-step wizard fills context_json → autosave (PATCH context deep-merge + current_step) → preview (17-section document) → AI analyze / generate (markdown + BriefVersion + context hash) → regenerate-section, export md/json, versions, is_generated_outdated. Routes /brief/new, /brief/:id.
Brand-aware freeform-flow (new): create Brand (with brand_context_json) → create freeform brief → paste raw client text → summarize-input → verify-input-summary → structure (fields with evidence: source_type / confidence / status / comment) → clarifications (critical/recommended/optional) → apply-clarifications → generate-final (gated on critical fields; reuses BriefVersion/hash/export). Routes /brands*, /brief/new/freeform, /brief/:id/review.
Backend: additive only — Brand, BrandSource models; nullable Brief fields (brand_id, raw_input_text, input_summary_json, is_input_summary_verified, structured_brief_json, clarifications_json); migration 0004; separate routers; new schemas/service/prompts. context_json and wizard untouched.
Frontend: brand pages, freeform creation, review screen with SourceBadge/StatusBadge/confidence bars; /briefs distinguishes freeform (badge + routes to /review); BriefEditPage redirects freeform briefs to /review. Warm glass theme preserved.
Docs: README (two-mode overview + routes) and docs/brand-aware-flow.md (ADR, API, data, frontend, manual checks).
3. Key files / where to look
Backend (backend/app/)

Routers: routers/briefs.py (wizard CRUD+AI+export+versions), routers/brands.py (/api/brands), routers/brand_briefs.py (freeform endpoints under /api/briefs).
Models: models.py (Brief, BriefVersion, Brand, BrandSource, default_context(), is_generated_outdated).
Schemas: schemas.py (wizard + BriefRead/BriefListItem), schemas_brand.py (enums SourceType/FieldStatus/ClarificationImportance, StructuredField, InputSummary, Clarifications, request bodies).
Services: services/llm_service.py (OpenAI-compatible client, chat_json/chat_markdown, 503/502/504), brief_ai_service.py (wizard), brand_brief_service.py (freeform), prompt_service.py.
Prompts: app/prompts/*.md (wizard: analyze/generate/regenerate; brand: summarize_input, structure_brand_brief, generate_clarifications, apply_clarifications, generate_final_brand_brief).
utils.py (context_hash), config.py (env), db.py, main.py (app + routers + LLM error handlers). Migrations: alembic/versions/. Tests: tests/ (no-DB).
Frontend (frontend/src/)

api/client.ts (single client, ApiError, all methods), api/types.ts (all types/enums).
Pages: HomePage, BriefsListPage, NewBriefPage, BriefEditPage, BrandsListPage, BrandNewPage, BrandEditPage, FreeformNewBriefPage, BriefReviewPage.
Components: BriefWizard, LiveBriefPanel, BriefDocument, MarkdownView, AiActions, BriefVersions, Field, ListInput, Layout, SourceBadge, StatusBadge.
wizard/ (steps.ts, context.ts, sections.ts), styles/global.css (tokens + all styles), main.tsx (routes).
Docs: docs/brand-aware-flow.md, architecture.md, ui-audit.md, acceptance-checklist.md, deploy-plan.md, ai-workflow.md, hooks-ruff-check.md. Agent config: .claude/ (skills preflight, debug-loop; ruff PostToolUse hook in settings.json).

4. How to run
Docker (recommended):

cp .env.example .env          # set LLM_API_KEY and LLM_MODEL for AI
docker compose up --build
# Frontend :5173 · Backend :8000 (Swagger /docs, /health) · Postgres :5432
Migrations auto-apply on backend start; in Docker the backend reaches Postgres via service name db (compose overrides DATABASE_URL). After editing .env, recreate backend: docker compose up -d --force-recreate backend.

Local (no Docker):

# backend (venv already at backend/.venv)
cd backend && python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt        # runtime + ruff + pytest
export DATABASE_URL=postgresql+psycopg://briefing@localhost:5432/briefing  # PG must be UTF-8!
alembic upgrade head && uvicorn app.main:app --reload
# frontend
cd frontend && npm install && npm run dev
Local Postgres must be UTF-8 (initdb -E UTF8) or psycopg3/SQLAlchemy break (SQL_ASCII bug).

LLM env (.env): LLM_API_KEY, LLM_MODEL (required for AI; case-sensitive, e.g. gpt-5.4 not GPT-5.4 — verify via GET {LLM_BASE_URL}/models), LLM_BASE_URL (default https://api.openai.com/v1), LLM_TIMEOUT_SECONDS. Missing key/model → AI endpoints return 503; rest works.

5. Checks already passed
ruff check . — clean. pytest -q — 7 passed (no-DB unit/smoke: app import, OpenAPI paths, context_hash, default_context, deep-merge).
npm run build (tsc -b strict + vite) — green.
Docker smoke on main: db healthy, migrations 0004 (head), /health, /docs, frontend routes / /briefs /brands /brief/new /brief/new/freeform all 200.
Real LLM smoke (gpt-5.4): full brand-aware flow on the feature branch (structure → 409 gate on critical fields → clarifications → apply → generate-final → markdown + version + export); short brand+freeform+summarize on main.
Backend freeform endpoints additionally verified via throwaway TestClient + mock LLM (not committed tests).
6. Deliberately out of MVP
Audio/transcription · RAG · web search (internet/transcript/BrandSource are reserved hooks only) · file upload · auth (service will live behind Велес/Нестор) · PDF/DOCX export · inline editing of structured fields · structured-field filters · stronger/committed tests for brand+freeform endpoints · restore-version.

7. Recommended next tasks
Demo package + seed data: script to create a sample brand + freeform brief + wizard brief for quick demos/QA.
Committed backend tests for brand/freeform endpoints (TestClient + mock LLM against a test PG): brand CRUD, full freeform flow, 409 gates, cascade, outdated — close the coverage gap.
Frontend/E2E smoke (e.g., Playwright): both flows incl. freeform redirect + list differentiation.
UX improvements (post-MVP): structured-field filters, inline edit/confirm/reject of fields, richer clarification UI.
Deploy prep: production compose profile (static frontend build + nginx, uvicorn without --reload, secret management, CORS to real domain, Postgres backups) — see docs/deploy-plan.md.
Quick start for the new session: git checkout main (already there, clean, synced with origin/main). Nothing pending to commit/push.