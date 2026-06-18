# Briefing Studio

Веб-сервис для создания брифов с AI. Пошаговый wizard собирает структурированный
контекст брифа (`context_json`), LLM анализирует его готовность и генерирует финальный
markdown-документ — с историей версий, отслеживанием устаревания и экспортом.

Monorepo: React-frontend, FastAPI-backend, PostgreSQL.

## Возможности

- **Wizard из 8 шагов** с автосохранением в backend на каждом переходе.
- **Live brief** — боковая панель: прогресс заполнения, состояния секций
  (empty / filling / filled) и confidence; всё считается на фронте из `context_json`.
- **Документный предпросмотр** — `context_json` рендерится как бриф из 17 разделов, не JSON.
- **AI-анализ готовности**: оценка %, что уже хорошо / что уточнить / чего не хватает,
  уточняющие вопросы, допущения, риски (в БД не сохраняется).
- **AI-генерация** финального markdown-брифа + **история версий** (`BriefVersion`).
- **Отслеживание устаревания**: стабильный hash контекста → `is_generated_outdated`.
- **Экспорт** `.md` и `.json`.
- Тёплая glass-тема (Raleway / Inter), адаптивный layout.

## Стек

- **Backend**: FastAPI · SQLAlchemy 2.0 · Alembic · PostgreSQL (psycopg3) · pydantic-settings ·
  OpenAI-compatible LLM.
- **Frontend**: React 18 · Vite · TypeScript · React Router 6.
- **Инфра**: Docker Compose (db / backend / frontend).

## Структура

```
briefing-studio/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, обработчики ошибок LLM (503/502/504)
│   │   ├── config.py          # настройки из env / .env
│   │   ├── db.py              # engine, сессии, Base
│   │   ├── models.py          # Brief, BriefVersion, default_context()
│   │   ├── schemas.py         # Pydantic-схемы (Create/Update/Read, BriefAnalysis, ...)
│   │   ├── routers/briefs.py  # все /api/briefs эндпоинты + deep-merge контекста
│   │   ├── services/          # llm_service, prompt_service, brief_ai_service
│   │   ├── prompts/           # analyze_brief.md, generate_brief.md, regenerate_section.md
│   │   └── utils.py           # context_hash (стабильный SHA-256)
│   ├── alembic/versions/      # миграции 0001 → 0002 → 0003 → 0004 → 0005
│   ├── tests/                 # no-DB pytest smoke (app, hash, default_context, deep-merge)
│   ├── requirements.txt       # рантайм-зависимости
│   └── requirements-dev.txt   # + ruff, pytest
├── frontend/src/
│   ├── api/                   # client.ts (единый HTTP-клиент), types.ts
│   ├── wizard/                # steps.ts, context.ts, sections.ts (расчёты live-brief)
│   ├── components/            # BriefWizard, LiveBriefPanel, BriefDocument, MarkdownView,
│   │                          #   AiActions, BriefVersions, Field, ListInput, Layout
│   ├── pages/                 # Home, BriefsList, NewBrief, BriefEdit
│   └── styles/global.css      # дизайн-токены + все стили
├── docs/                      # документация (см. ниже)
├── docker-compose.yml
├── .env.example
└── README.md
```

## Как это работает (lifecycle)

Статусы брифа: `draft → in_progress → generated` (+ `archived`).

1. **Создание** — `POST /api/briefs` создаёт черновик с пустым `context_json` (22 поля).
2. **Заполнение** — на каждом шаге wizard данные сохраняются: `context_json` через
   `PATCH /api/briefs/{id}/context` (частичный **deep-merge**: вложенные словари сливаются,
   скаляры и списки заменяются), а `current_step` / `status` через `PATCH /api/briefs/{id}`.
3. **Предпросмотр** — собранный контекст показывается как документ из 17 разделов.
4. **Анализ** — `POST .../analyze` возвращает оценку готовности (в БД не сохраняется).
5. **Генерация** — `POST .../generate`: сохраняет markdown в `generated_markdown`, создаёт
   `BriefVersion` (снимок контекста + метаданные), пишет hash контекста, ставит `status=generated`.
6. **Экспорт / правки** — `export/markdown` (409 до генерации) и `export/json`;
   `regenerate-section` возвращает новый текст раздела, но сохранённый документ не патчит.
7. **Устаревание** — если контекст меняют после генерации, текущий hash ≠ сохранённого →
   `is_generated_outdated=true` → UI предлагает перегенерировать (новая версия v2, v3, …).

## Пользовательский сценарий

1. Главная `/` → «Создать бриф».
2. `/brief/new` создаёт черновик и редиректит на `/brief/:id`.
3. Пользователь проходит шаги (тип задачи → основные вводные → цель → сообщения → стиль →
   must have/don't → результат → предпросмотр); справа Live brief заполняется в реальном времени.
4. На шаге предпросмотра — «Проанализировать бриф» и «Сгенерировать бриф» (gen-steps).
5. Готовый markdown-документ с бейджем «AI-generated», Copy / Download Markdown / Download JSON.
6. История генераций раскрывается в том же документном стиле.
7. `/briefs` — список со статусными бейджами («Сгенерирован», «Требует перегенерации»).

## Ключевые элементы

**Backend**
- `routers/briefs.py` — CRUD + AI + экспорт + версии; `_deep_merge` для частичного контекста.
- `services/llm_service.py` — клиент OpenAI-compatible (`chat_json` / `chat_markdown`),
  таймауты, разбор ответа; `brief_ai_service.py` — доменные операции; `prompt_service.py` — промпты.
- `models.py` — `Brief`, `BriefVersion` (1:N, каскадное удаление), `default_context()`.
- `utils.context_hash` — `json.dumps(sort_keys=True)` + SHA-256 (порядок ключей не влияет).

**Frontend**
- `BriefWizard` — оркестратор шагов, автосохранение, индикатор «Сохранено».
- `LiveBriefPanel` — секции/прогресс/confidence (`wizard/sections.ts`).
- `BriefDocument` / `MarkdownView` — документный рендер чернового и сгенерированного брифа.
- `AiActions` — анализ, генерация (gen-steps), экспорт, плашка устаревания.
- `BriefVersions` — компактная история генераций с раскрытием.
- `api/client.ts` — единый клиент, base URL = `VITE_API_URL`.

## Быстрый старт (Docker)

```bash
cp .env.example .env          # заполните LLM_API_KEY и LLM_MODEL для AI
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000 (Swagger: http://localhost:8000/docs)
- Health check: http://localhost:8000/health
- PostgreSQL: localhost:5432

Миграции Alembic применяются автоматически при старте backend-контейнера. В Docker backend
подключается к Postgres по имени сервиса `db` (compose переопределяет `DATABASE_URL`).

## Запуск без Docker

### Backend

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt    # рантайм + ruff + pytest (или requirements.txt без dev-инструментов)
cp ../.env.example ../.env              # поправьте DATABASE_URL (localhost), задайте LLM_*
alembic upgrade head
uvicorn app.main:app --reload
```

> PostgreSQL должен быть в кодировке **UTF-8** (`initdb -E UTF8`); иначе psycopg3/SQLAlchemy
> падают на SQL_ASCII-кластере.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Демо-данные (dev-only)

Идемпотентный seed-скрипт наполняет БД демо-данными для ручной проверки обоих flow
**без LLM**: бренд (+ источник), wizard-бриф (заполненный) и freeform-бриф (на ревью),
плюс по одному **pre-generated** брифу каждого типа (готовый markdown + версия) — чтобы
офлайн увидеть документ, версии, export и `is_generated_outdated`.

```bash
cd backend
# DATABASE_URL должен указывать на dev-БД с применёнными миграциями (alembic upgrade head)
python scripts/seed_demo.py            # создать / обновить демо-данные (идемпотентно)
python scripts/seed_demo.py --reset    # удалить демо-строки и пересоздать
python scripts/seed_demo.py --dry-run  # только валидация блобов, без записи в БД
```

Демо-freeform-брифы **template-aware**: один со стандартной структурой (`source=default`),
один с структурой из референса (`source=reference` + `reference_template_text`); pre-generated
freeform-бриф имеет корректный hash и snapshot версии по `structured + template`.

В Docker: `docker compose exec backend python scripts/seed_demo.py`. Скрипт **dev-only**
(откажется работать, если `APP_ENV` не dev — обойти можно `--force`), пишет через ORM,
повторный запуск не плодит дубли (строки помечены маркером `[DEMO]`). Полный сценарий
ручного QA — в [docs/manual-qa-brand-aware-flow.md](docs/manual-qa-brand-aware-flow.md).

## Тесты и качество

```bash
cd backend
pytest -m "not db" -q   # no-DB smoke (app import, OpenAPI, context_hash, default_context, deep-merge)
ruff check .            # линт

# DB-интеграция (brands CRUD, freeform flow, template layer, 409-гейт, cascade, outdated, seed): нужен Postgres
createdb -E UTF8 briefing_test
export TEST_DATABASE_URL=postgresql+psycopg://briefing@localhost:5432/briefing_test
pytest -q               # все тесты; без TEST_DATABASE_URL db-тесты автоматически skipped
```

В `.claude/settings.json` настроен PostToolUse-хук: после `Edit`/`Write` он запускает
`ruff check` для изменённых `.py` (безопасно пропускает, если `ruff` не установлен).

## Миграции

```bash
cd backend
alembic revision --autogenerate -m "описание"
alembic upgrade head
```

## API

Базовый префикс — `/api`. Полная схема в Swagger: http://localhost:8000/docs

| Метод  | Путь                          | Описание                                                        |
| ------ | ----------------------------- | --------------------------------------------------------------- |
| GET    | `/health`                     | Статус сервиса и подключения к БД                               |
| POST   | `/api/briefs`                 | Создать новый бриф (черновик)                                   |
| GET    | `/api/briefs`                 | Список брифов (свежие — сверху)                                 |
| GET    | `/api/briefs/{brief_id}`      | Получить один бриф                                              |
| PATCH  | `/api/briefs/{brief_id}`      | Обновить `title`, `status`, `brief_type`, `current_step`        |
| PATCH  | `/api/briefs/{brief_id}/context` | Частично обновить `context_json` (поля мержатся, не затираются) |
| DELETE | `/api/briefs/{brief_id}`      | Удалить бриф                                                    |
| POST   | `/api/briefs/{brief_id}/analyze` | AI-анализ брифа (результат не сохраняется в БД)              |
| POST   | `/api/briefs/{brief_id}/generate` | Сгенерировать markdown-бриф, сохранить, создать BriefVersion, `status=generated` |
| POST   | `/api/briefs/{brief_id}/regenerate-section` | Переписать один раздел markdown-брифа (без патча документа) |
| GET    | `/api/briefs/{brief_id}/export/markdown` | Скачать `.md` файл (409, если бриф не сгенерирован)    |
| GET    | `/api/briefs/{brief_id}/export/json` | Скачать `.json` с полным состоянием брифа                  |
| GET    | `/api/briefs/{brief_id}/versions` | Список версий генераций (новые — сверху)                     |
| GET    | `/api/briefs/{brief_id}/versions/{version_id}` | Одна версия генерации                           |

Модель брифа: `id`, `title`, `status` (`draft` / `in_progress` / `generated` / `archived`),
`brief_type` (`creative` / `client` / `production` / `ai_production` / `landing` / `video` /
`presentation` / `campaign` / `custom`), `current_step`, `context_json` (JSONB),
`generated_markdown` (nullable), `generated_from_context_hash` (nullable, SHA-256 от
`context_json` на момент генерации), `created_at`, `updated_at`. В ответах API есть
вычисляемое поле `is_generated_outdated` — `true`, если контекст изменился после
последней генерации.

Модель `BriefVersion` (снимок каждой полной генерации): `id`, `brief_id`,
`version_number`, `generated_markdown`, `context_snapshot_json`, `generation_meta_json`
(модель, тип и источник генерации), `created_at`. Версии удаляются каскадно вместе с брифом.

## LLM

AI-функции работают через OpenAI-compatible Chat Completions API. Конфигурация в `.env`:

```
LLM_API_KEY=...                          # ключ API
LLM_BASE_URL=https://api.openai.com/v1   # базовый URL (включая /v1)
LLM_MODEL=...                            # имя модели (чувствительно к регистру!)
LLM_TIMEOUT_SECONDS=60                   # таймаут запроса
```

`LLM_API_KEY` и `LLM_MODEL` обязательны для AI-эндпоинтов; если не заданы — analyze/generate
возвращают `503`, остальное приложение работает. Маппинг ошибок: не настроено → 503,
таймаут → 504, прочие ошибки вызова/разбора → 502. Имя модели чувствительно к регистру
(`gpt-5.4`, не `GPT-5.4`) — сверяйте по `GET {LLM_BASE_URL}/models`. Промпты — в
`backend/app/prompts/`.

## Два режима создания брифа

1. **Wizard-flow** — ручное пошаговое заполнение `context_json` (8 шагов), затем AI-анализ
   и генерация. Маршруты `/brief/new`, `/brief/:id`.
2. **Brand-aware freeform-flow** — бренд → **выбор структуры итогового брифа** (стандартная
   или из референса) → свободный клиентский текст → AI-summary → подтверждение →
   структурирование с evidence (`source_type` / `confidence` / `status` / `comment`) под
   выбранную структуру → уточнения (critical / recommended / optional) → финальный markdown
   (переиспользует `BriefVersion` / hash / export). Маршруты `/brands*`, `/brief/new/freeform`,
   `/brief/:id/review`.

Brand-aware добавляет модели `Brand` и `BrandSource`, аддитивные nullable-поля в `Brief`
(`brand_id`, `raw_input_text`, `input_summary_json`, `is_input_summary_verified`,
`structured_brief_json`, `clarifications_json`, `selected_template_json`,
`reference_template_text`) и эндпоинты `/api/brands` + freeform-операции под
`/api/briefs/{id}/…`. **Template layer** (структура итогового брифа на уровне брифа) —
эндпоинты `GET /api/briefs/template/default`, `POST /api/briefs/template/decompose`,
`POST /api/briefs/{id}/select-template`; хранится в `selected_template_json` (JSONB), при
отсутствии — fallback на дефолтную структуру (старые freeform-брифы работают как раньше).
`internet`, `transcript`, `BrandSource` — архитектурные заделы; web search / audio / загрузки
файлов в MVP нет. Старый wizard-flow сохранён без изменений. Подробности и ручная проверка
обоих flow — в [docs/brand-aware-flow.md](docs/brand-aware-flow.md).

## Маршруты frontend

- `/` — стартовая страница (два способа создать бриф)
- `/briefs` — список брифов (wizard и freeform; freeform помечены бейджем)
- `/brief/new` — wizard-бриф (редирект на `/brief/:id`)
- `/brief/:id` — wizard-редактор (freeform-брифы редиректятся на `/brief/:id/review`)
- `/brands`, `/brands/new`, `/brands/:id` — управление брендами
- `/brief/new/freeform` — создание brand-aware freeform-брифа
- `/brief/:id/review` — review-экран freeform-флоу

## Документация

- [docs/brand-aware-flow.md](docs/brand-aware-flow.md) — brand-aware freeform-flow (ADR, API, UI)
- [docs/handoff-brand-aware-mvp.md](docs/handoff-brand-aware-mvp.md) — handoff-summary текущего состояния (git, flow, файлы, проверки)
- [docs/manual-qa-brand-aware-flow.md](docs/manual-qa-brand-aware-flow.md) — ручной QA/UX-аудит обоих flow + demo seed
- [docs/architecture.md](docs/architecture.md) — архитектура и компоненты
- [docs/ui-audit.md](docs/ui-audit.md) — UI/UX-аудит demo-ui и план визуала
- [docs/acceptance-checklist.md](docs/acceptance-checklist.md) — приёмочные проверки
- [docs/deploy-plan.md](docs/deploy-plan.md) — dev-профиль и план production
- [docs/ai-workflow.md](docs/ai-workflow.md) — как агенту работать в репозитории
- [docs/hooks-ruff-check.md](docs/hooks-ruff-check.md) — ruff PostToolUse-хук

## Статус

**MVP реализован, прошёл QA и Docker/DB-smoke, готов к stage-деплою.**

- Backend: модель брифа + версии + lifecycle, CRUD, LLM-слой, экспорт, hash/outdated —
  покрыты no-DB pytest-смоком; `ruff check` чистый.
- Frontend: wizard + Live brief + документный рендер + AI-блок; `tsc -b` + `vite build` зелёные.
- Docker: полный стек собирается и проверен (health, Swagger, миграции `0005 (head)`, CRUD-smoke,
  реальная генерация через OpenAI). Compose — dev-профиль; production-профиль см. deploy-plan.
- Git: репозиторий инициализирован, `.gitignore` усилен (секреты и кэши исключены).

**Сознательно вне MVP:** авторизация (сервис встраивается в контур Велес/Нестор),
экспорт PDF/DOCX, RAG, загрузка файлов, guided-chat ввод, восстановление версий.
