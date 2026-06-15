# Архитектура Briefing Studio

## Обзор

```
[Browser] → [Frontend: React/Vite :5173] → [Backend: FastAPI :8000] → [PostgreSQL :5432]
                                                    └→ [LLM: OpenAI-compatible API]
```

## Компоненты

### Frontend (`frontend/`)
React + Vite + TypeScript, React Router. Страницы: `/` (стартовая), `/briefs` (список брифов), `/brief/new` (создание брифа и редирект на редактирование) и `/brief/:id` (пошаговый wizard). Общий layout в светлом стиле: шапка с логотипом и навигацией, контентная область.

Wizard состоит из 8 шагов (`brief_type`, `basics`, `goal`, `messages`, `style`, `constraints`, `output`, `preview`). Описание шагов и полей — в `src/wizard/steps.ts`, доступ к backend — через `src/api/client.ts`. На каждом переходе данные сохраняются: `context_json` через `PATCH /api/briefs/{id}/context` (частичный merge), а `current_step`/`status` через `PATCH /api/briefs/{id}`. Рядом — панель «Собранный контекст» с кратким summary.

На шаге `preview` отображается блок AI Actions (`src/components/AiActions.tsx`): анализ брифа (оценка готовности, слабые места, уточняющие вопросы), генерация/перегенерация финального markdown-документа, Copy Markdown, Download Markdown / Download JSON (скачивание через blob) и блок «Версии» (`src/components/BriefVersions.tsx`) с раскрываемым превью каждой генерации. При `is_generated_outdated=true` показывается предупреждение о необходимости перегенерации. Ошибка 503 от backend (LLM не настроена) показывается понятным сообщением; клиентский `ApiError` несёт HTTP-статус.

### Backend (`backend/`)
FastAPI-приложение. Конфигурация через переменные окружения (pydantic-settings). SQLAlchemy 2.0 для работы с PostgreSQL, Alembic для миграций. Доменная логика брифов вынесена в роутер `app/routers/briefs.py`, Pydantic-схемы — в `app/schemas.py`.

Эндпоинты:
- `GET /health` — статус сервиса и подключения к БД;
- `POST /api/briefs`, `GET /api/briefs`, `GET /api/briefs/{id}`, `PATCH /api/briefs/{id}`, `PATCH /api/briefs/{id}/context`, `DELETE /api/briefs/{id}` — CRUD по брифам;
- `POST /api/briefs/{id}/analyze`, `POST /api/briefs/{id}/generate`, `POST /api/briefs/{id}/regenerate-section` — AI-операции;
- `GET /api/briefs/{id}/export/markdown` (409 без генерации), `GET /api/briefs/{id}/export/json` — экспорт файлов с `Content-Disposition: attachment`;
- `GET /api/briefs/{id}/versions`, `GET /api/briefs/{id}/versions/{version_id}` — версии генераций (restore пока нет).

`PATCH .../context` делает аккуратный deep-merge присланных полей с текущим `context_json`: вложенные словари сливаются, скаляры и списки заменяются целиком. Валидация `status`/`brief_type` — через enum в Pydantic (невалидное значение → 422), отсутствующий бриф → 404.

### LLM-слой (`backend/app/services/`)
- `llm_service.py` — `LLMService`, клиент OpenAI-compatible Chat Completions API (`chat_json`, `chat_markdown`): таймауты, срезание код-фенсов, устойчивый разбор JSON. Конфигурация: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TIMEOUT_SECONDS`.
- `prompt_service.py` — чтение prompt-файлов из `app/prompts/` (`get_prompt(name)`).
- `brief_ai_service.py` — доменные операции: `analyze_brief` (валидируется схемой `BriefAnalysis`, в БД не сохраняется), `generate_brief` (markdown сохраняется в `generated_markdown`, статус → `generated`), `regenerate_section` (возвращает новый текст раздела, документ не патчится).

Ошибки LLM маппятся на HTTP через exception handlers в `main.py`: не настроена → 503, таймаут → 504, прочие ошибки вызова/разбора → 502. `context_json` при генерации не изменяется.

### База данных
PostgreSQL 16. Модель `Brief`: `id`, `title`, `status`, `brief_type`, `current_step`, `context_json` (JSONB), `generated_markdown` (nullable), `generated_from_context_hash` (nullable), `created_at`, `updated_at`. Структура `context_json` фиксирована (см. `default_context()` в `app/models.py`).

Модель `BriefVersion` (1:N к `Brief`, каскадное удаление): `version_number` (уникален в рамках брифа), `generated_markdown`, `context_snapshot_json`, `generation_meta_json`, `created_at`. Каждая полная генерация создаёт новую версию.

### Lifecycle генерации
При `POST .../generate` сохраняется SHA-256 hash контекста (`app/utils.py: context_hash`, `json.dumps(..., sort_keys=True)` — порядок ключей не влияет). ORM-свойство `Brief.is_generated_outdated` сравнивает текущий hash с сохранённым: `true` означает, что контекст редактировали после генерации. Поле отдаётся в `BriefRead` и `BriefListItem`; frontend показывает предупреждение в AI Actions и бейдж «Требует перегенерации» в списке. `regenerate-section` версию не создаёт и сохранённый markdown не меняет.

## Дальнейшие шаги

Восстановление версий (restore), экспорт в PDF/DOCX, авторизация, применение перегенерированных разделов к документу, RAG и загрузка файлов — сознательно отложены на следующие этапы.
