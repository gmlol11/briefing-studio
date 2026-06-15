# Briefing Studio — Acceptance Checklist (Этап 6)

Чек-лист приёмки и готовности к деплою. Отмеченные пункты проверены автоматически
(backend — через FastAPI `TestClient` против реального PostgreSQL + mock OpenAI-сервера)
и/или визуально (frontend — через preview dev-server).

Окружение проверки: Docker CLI установлен (29.x), **демон Docker не запущен**, поэтому
`docker compose up --build` не выполнялся. Backend проверен эквивалентным путём —
Homebrew PostgreSQL 16-совместимый кластер (UTF-8) + `alembic upgrade head` + `uvicorn`
(те же команды, что в `docker-compose.yml`). `docker compose config` валиден.

## Happy path (основной user flow)

- [x] Создание брифа `POST /api/briefs` → `status=draft`, `context_json` из 22 ключей.
- [x] `/brief/new` создаёт черновик и редиректит на `/brief/:id`.
- [x] Прохождение шагов: автосохранение `context_json` (`PATCH .../context`, deep-merge)
      и `current_step`/`status` (`PATCH /api/briefs/:id`).
- [x] LiveBriefPanel обновляется; progress, состояния секций (empty / filling / filled)
      и confidence (high / med / low) считаются на frontend из `context_json` + `current_step`.
- [x] Шаг preview рендерит бриф как документ (17 разделов), не JSON.
- [x] `analyze` → assistant-summary: готовность %, summary, «что хорошо» (strong_fields),
      «что уточнить» (weak_fields), «не хватает» (missing_fields), вопросы (с options-chips),
      допущения, риски. Результат **не** сохраняется в БД.
- [x] `generate` → gen-steps (Проверяем контекст → Собираем структуру → Генерируем →
      Сохраняем версию), markdown-документ с бейджем «AI-generated», `status=generated`.
- [x] Создаётся версия `v1` (snapshot контекста + `generation_meta_json`).
- [x] Download Markdown (`/export/markdown`) и Download JSON (`/export/json`).
- [x] Изменение контекста после генерации → `is_generated_outdated=true` → hint-плашка.
- [x] Перегенерация → версия `v2` (новые сверху), флаг устаревания сброшен.
- [x] `/briefs`: бейджи «Сгенерирован» и «Требует перегенерации».
- [x] Reload на `/brief/:id` не ломает состояние (данные подтягиваются из backend).

## Негативные сценарии

- [x] LLM не настроена (`LLM_API_KEY`/`LLM_MODEL` пусты): `analyze` и `generate` → **503**,
      detail человекочитаемый; frontend показывает
      «LLM пока не настроена. Добавьте LLM_API_KEY, LLM_BASE_URL и LLM_MODEL в .env.»
- [x] Export markdown до генерации → backend **409**; frontend показывает читаемую ошибку.
- [x] Несуществующий `brief_id` → backend **404** (`get`/`analyze`/`generate`/`export`/
      `versions`); frontend `/brief/:id` показывает «Бриф не найден» и не падает.
- [x] `regenerate-section` без `generated_markdown` → backend **409**.
- [x] Ошибка LLM (upstream 500) → **502**, читаемый detail.
- [x] Таймаут LLM (медленный ответ + `LLM_TIMEOUT_SECONDS`) → **504**, читаемый detail.
- [x] Медленный LLM: кнопки `disabled` во время запроса (нет двойных запросов),
      виден loading/gen-steps state; создание брифа защищено от двойного POST (ref-guard).
- [x] Невалидный enum (`status`/`brief_type`) → **422**; лишний ключ в `context` → **422**.

## Backend

- [x] `GET /health` → `{status: ok, database: ok}`.
- [x] Swagger `/docs` и `/openapi.json` → 200; все 14 endpoints присутствуют в схеме.
- [x] Alembic: `0001 → 0002 → 0003` применяются с нуля без ошибок.
- [x] CRUD: create / list / get / patch / patch-context / delete.
- [x] `context_json` deep-merge: новые поля добавляются, существующие (включая списки и
      вложенный `message_hierarchy`) сохраняются.
- [x] analyze / generate (через mock OpenAI-совместимый сервер).
- [x] export markdown (`text/markdown; charset=utf-8`, `Content-Disposition` с безопасным
      именем `brief-{id}.md`) и export json (9 полей, `application/json; charset=utf-8`).
- [x] versions: список (новые сверху) + detail; 404 на чужую/несуществующую версию.
- [x] cascade delete: удаление брифа удаляет связанные `brief_versions` (FK `ON DELETE CASCADE`).
- [x] context hash стабилен к порядку ключей (`json.dumps(sort_keys=True)` + SHA-256),
      чувствителен к значениям.
- [x] `generated_from_context_hash` сохраняется при генерации.
- [x] `is_generated_outdated` вычисляется корректно (true только при изменении контекста
      после генерации).

Сводно: **54 backend-проверки + 3 негативных LLM-сценария (503/502/504)** — все зелёные.

## Frontend (статические проверки)

- [x] `tsc -b --force` → 0 ошибок (strict, `noUnusedLocals`/`noUnusedParameters`).
- [x] `vite build` → успешно (50 модулей).
- [x] Нет `console.log`/`debugger`, нет `TODO`/`FIXME`, нет ссылок на удалённые компоненты.
- [x] Все сетевые вызовы идут через единый `src/api/client.ts`; base URL — `VITE_API_URL`
      (дефолт `http://localhost:8000` только как dev-fallback).
- [x] Удалены неиспользуемые экспорты `countFilled` / `formatValue` из `wizard/context.ts`.
- [x] Loading / error / empty states: `/briefs` (empty + ошибка), `/brief/:id`
      (loading / «Бриф не найден»), `/brief/new` (создание / ошибка).
- [x] Адаптив: на узком экране (375px) layout одноколоночный, header/stepper/chips
      переносятся, live-панель уходит под основной шаг.
- [x] Browser console: ошибок нет; присутствуют только информационные warning'и
      React Router v6→v7 (future flags) — не влияют на работу.

## Deploy readiness

- [x] `.env.example` содержит все переменные: `DATABASE_URL`, `CORS_ORIGINS`,
      `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TIMEOUT_SECONDS`, `VITE_API_URL`,
      `POSTGRES_*`, `BACKEND_PORT`, `FRONTEND_PORT`.
- [x] `docker compose config` валиден; backend применяет миграции перед стартом
      (`alembic upgrade head && uvicorn …`), `depends_on: db (service_healthy)`.
- [x] Frontend получает backend через `VITE_API_URL`; CORS на backend настраивается
      через `CORS_ORIGINS`.
- [x] README актуален (API, LLM, маршруты, статус).
- [ ] `docker compose up --build` — **не выполнено** (демон Docker не запущен в этой среде);
      проверено эквивалентным путём (PG + alembic + uvicorn). Выполнить при наличии демона.

Примечание: `docker-compose.yml` — dev-ориентированный (bind-mounts, `--reload`,
`npm run dev`). Для production-деплоя позже потребуется prod-профиль (сборка frontend в
статику + раздача, `uvicorn` без `--reload`, отдельный prod-образ). Вне рамок текущего MVP.

## Вне MVP (сознательно не входит)

- Авторизация / роли / workspaces (сервис встраивается в контур Велес/Нестор).
- Экспорт PDF / DOCX.
- RAG, загрузка файлов.
- GuidedBriefChat (chat-like ввод).
- Restore версий.
- Применение `regenerate-section` к сохранённому документу (сейчас возвращает только
  текст раздела, документ в БД не патчится — by design).
