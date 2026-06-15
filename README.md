# Briefing Studio

Веб-сервис для создания брифов. Monorepo: React-frontend, FastAPI-backend, PostgreSQL.

## Структура

```
briefing-studio/
├── frontend/          # React + Vite + TypeScript
├── backend/           # Python + FastAPI + SQLAlchemy + Alembic
├── docs/              # Документация
├── docker-compose.yml # Локальная разработка
├── .env.example       # Шаблон переменных окружения
└── README.md
```

## Быстрый старт (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000 (Swagger: http://localhost:8000/docs)
- Health check: http://localhost:8000/health
- PostgreSQL: localhost:5432

Миграции Alembic применяются автоматически при старте backend-контейнера.

## Запуск без Docker

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env   # при необходимости поправьте DATABASE_URL
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

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
LLM_MODEL=...                            # имя модели
LLM_TIMEOUT_SECONDS=60                   # таймаут запроса
```

Если `LLM_API_KEY` или `LLM_MODEL` не заданы, AI-endpoints возвращают `503` с понятным
сообщением — остальное приложение продолжает работать. Промпты лежат в
`backend/app/prompts/` (`analyze_brief.md`, `generate_brief.md`, `regenerate_section.md`).

## Маршруты frontend

- `/` — стартовая страница
- `/briefs` — список созданных брифов
- `/brief/new` — создание нового брифа и старт wizard (редирект на `/brief/:id`)
- `/brief/:id` — пошаговый wizard редактирования брифа

## Статус

**MVP готов к деплою (этап 6 — QA / acceptance).** Реализовано:

- **Backend**: модель `Brief` + `context_json`, CRUD, частичный deep-merge контекста,
  LLM-слой (analyze / generate / regenerate-section), экспорт `.md` / `.json`, версии
  генераций (`BriefVersion`), стабильный hash контекста и `is_generated_outdated`.
- **Frontend**: пошаговый wizard (8 шагов) с автосохранением, Live brief панель
  (progress / confidence / состояния секций считаются на фронте), документный
  предпросмотр и markdown-рендер, AI-проверка и генерация с gen-steps, история версий,
  тёплая glass-тема (Raleway / Inter).

Приёмочные проверки (happy path, негативные сценарии, backend, deploy-readiness)
зафиксированы в [docs/acceptance-checklist.md](docs/acceptance-checklist.md).

**Сознательно вне MVP:** авторизация (сервис встраивается в контур Велес/Нестор),
экспорт PDF/DOCX, RAG, загрузка файлов, guided-chat ввод, восстановление версий.
