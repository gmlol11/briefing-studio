# ADR: Brand-aware freeform briefing flow

Status: accepted — backend + frontend реализованы (MVP-1)
Branch: `feature/brand-aware-freeform-flow`
Protective tag: `mvp-stable-before-brand-flow`

Сервис теперь поддерживает **два режима создания брифа**:

1. **Wizard-flow** (существующий) — ручное пошаговое заполнение `context_json` (8 шагов),
   AI-анализ и генерация. Не изменён.
2. **Brand-aware freeform-flow** (новый) — бренд → свободный клиентский текст → AI-summary →
   подтверждение → структурирование с evidence → уточнения → финальный markdown.

## Контекст

Нужен параллельный flow создания брифа: бренд → свободный текстовый ввод → AI-summary →
структурирование с evidence → цикл уточнений → финальный markdown. Существующий
wizard-flow (`context_json`) должен продолжать работать без изменений.

## Решения

1. **Новые таблицы `brands`, `brand_sources`** (аддитивно). `BrandSource` вводится сразу,
   но используется минимально — это заготовка под будущие источники (brand_bible,
   transcript, …). Реальные загрузка/транскрипция/RAG/web — НЕ в этом MVP.

2. **`Brief` расширяется только аддитивно** (одна миграция `0004`, все колонки nullable /
   с default): `brand_id` (FK→brands, `ON DELETE SET NULL`), `raw_input_text`,
   `input_summary_json`, `is_input_summary_verified` (default `false`),
   `structured_brief_json`, `clarifications_json`. **`context_json` не меняется** — старый
   wizard использует его как раньше. Freeform-бриф — это тот же `Brief` с заполненным
   `brand_id` и freeform-полями вместо `context_json`.

3. **Отдельные роутеры** — `routers/brands.py` (`/api/brands`) и `routers/brand_briefs.py`
   (freeform-эндпоинты под тем же префиксом `/api/briefs/{id}/…`). Существующий
   `routers/briefs.py` не редактируется (кроме того, что оба роутера включаются в `main.py`).

4. **Отдельные схемы и сервис** — `schemas_brand.py` (enum `SourceType`, `FieldStatus`,
   `StructuredField`, `InputSummary`, `Clarifications`, …) и `services/brand_brief_service.py`
   (5 операций поверх существующих `LLMService`/`PromptService`). `brief_ai_service.py` не трогаем.
   В `schemas.py` — только аддитивные optional-поля в `BriefRead`.

5. **Переиспользование** — `generate-final` использует существующий механизм:
   `generated_markdown` + `BriefVersion` + `context_hash`/`is_generated_outdated`. Для hash
   freeform-брифа берётся снимок `structured_brief_json` (см. ниже). Export `.md`/`.json`
   работает как есть (по `generated_markdown`).

## Модель данных source/field

`StructuredField`: `key`, `value`, `source_type`, `source_ref`, `confidence` (0..1),
`status`, `comment`.

- `source_type`: `brand_bible | client_brief | transcript | manager_note | inference |
  internet | user_edit | unknown`. `internet` — зарезервирован, реального web-search нет.
- `status`: `confirmed | confirmed_by_brand | needs_confirmation | critical_missing |
  optional_missing | conflict | rejected`.

Правила для LLM: не выдумывать (нет данных → `*_missing`); предположение → `inference`;
из `brand_context_json` → `brand_bible`; из `raw_input_text`/`input_summary_json` →
`client_brief`; всегда `confidence` ∈ [0,1] и `comment`.

## Flow (MVP-1, текстовый)

create brand → fill brand_context → create brief (brand_id) → `freeform-input` (raw_input_text)
→ `summarize-input` (input_summary_json) → `verify-input-summary` (is_input_summary_verified=true)
→ `structure` (structured_brief_json) → `clarifications` (critical/recommended/optional) →
`apply-clarifications` (мерж ответов в structured_brief_json) → `generate-final`
(markdown + BriefVersion + hash, при условии что критичные поля подтверждены).

## Hash / outdated для freeform

Свойство `Brief.is_generated_outdated` расширяется **аддитивно**: источником для hash
становится `structured_brief_json`, если он задан, иначе — `context_json` (как раньше).
Для wizard-брифов `structured_brief_json is None`, поэтому поведение идентично текущему.
`generate-final` пишет `generated_from_context_hash` от того же источника
(`structured_brief_json`), так что правка структуры после генерации → `outdated=true`.
Это не меняет смысл `context_json`; меняется только то, что у freeform-брифов hash берётся
из их собственного поля.

## API endpoints

Brands (`routers/brands.py`):
- `POST /api/brands`, `GET /api/brands`, `GET /api/brands/{id}`, `PATCH /api/brands/{id}`,
  `DELETE /api/brands/{id}` (удаление бренда → `brand_id` связанных брифов = NULL).

Freeform brief flow (`routers/brand_briefs.py`, префикс `/api/briefs`):
- `POST /api/briefs/freeform` `{brand_id, title?}` — создать бриф под бренд;
- `POST /api/briefs/{id}/freeform-input` `{raw_input_text}`;
- `POST /api/briefs/{id}/summarize-input` · `verify-input-summary` · `structure` ·
  `clarifications` · `apply-clarifications` `{answers}` · `generate-final`.
- Все возвращают `BriefRead`. Существующие `export/markdown|json` и `versions` переиспользуются.

`BriefListItem` дополнен `brand_id` (для бейджа/маршрутизации в списке). Остальной
`routers/briefs.py` не менялся.

## Данные

- **Brand**: `id, name, description, brand_context_json, created_at, updated_at`.
- **BrandSource** (задел): `id, brand_id, source_type, title, content_text, source_url,
  file_name, meta_json, created_at`.
- **Brief** (+аддитивно): `brand_id, raw_input_text, input_summary_json,
  is_input_summary_verified, structured_brief_json, clarifications_json`.

## Frontend

Маршруты (старые сохранены: `/`, `/briefs`, `/brief/new`, `/brief/:id`):
- `/brands`, `/brands/new`, `/brands/:id` — управление брендами (`brand_context_json` —
  JSON-textarea с валидацией);
- `/brief/new/freeform` — выбор бренда + свободный ввод (поддерживает `?brand=:id`);
- `/brief/:id/review` — экран review (summary → структура → уточнения → финал).

Ключевые компоненты: `pages/BrandsListPage|BrandNewPage|BrandEditPage`,
`pages/FreeformNewBriefPage`, `pages/BriefReviewPage`, `components/SourceBadge`,
`components/StatusBadge`; финальный markdown — через существующий `MarkdownView`.
`BriefEditPage` редиректит freeform-бриф (есть `brand_id`/`raw_input_text`/`structured_brief_json`)
на `/brief/:id/review`; wizard-брифы открываются как раньше. Список `/briefs` помечает
freeform-брифы бейджем «Freeform».

## Как проверить руками (оба flow)

**Wizard (регрессия):** `/brief/new` → пройти шаги → preview → analyze/generate.
Бриф открывается на `/brief/:id` в wizard.

**Brand-aware freeform:**
1. `/brands/new` → создать бренд (заполнить `brand_context_json`).
2. На `/brands/:id` → «Создать freeform-бриф» → `/brief/new/freeform?brand=:id`.
3. Вставить клиентский текст → «Создать и сделать summary» → попадаем на `/brief/:id/review`.
4. Подтвердить summary → структурировать → (при критичных полях generate-final даёт понятную
   ошибку) → сгенерировать вопросы → ответить → применить → сгенерировать финальный бриф.
5. Финальный markdown + Copy / Download Markdown / Download JSON.

В списке `/briefs` freeform-брифы помечены и ведут на `/review`, wizard-брифы — на `/brief/:id`.

## Сознательно вне MVP-1

Аудио/транскрипция, RAG, web search, загрузка файлов, авторизация, PDF/DOCX. `internet`,
`transcript`, `BrandSource` — архитектурные заделы (в текущем MVP реального web-search/audio/
файлов нет). Также вне MVP: фильтры и инлайн-редактирование structured-полей.
