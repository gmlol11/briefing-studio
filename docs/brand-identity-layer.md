# ADR: Brand Identity Layer

Status: proposed — план принят, реализация по этапам (этот документ = Коммит 1)
Branch: `feature/brand-identity-layer`
Stable point before: `main @ c3bc8e0`, tag `brand-aware-ux-cleanup`

Добавляем к бренду **визуальный слой** (цвета, логотип, шрифт, стиль документа),
который позже будет использоваться в preview / DOCX / PDF. У бренда уже есть
семантический контекст `brand_context_json` (идёт в LLM-промпты) — айдентика
к нему **не относится** и хранится отдельно.

## Контекст

`Brand` сейчас имеет `name`, `description`, `brand_context_json` (JSONB, NOT NULL
default `{}`) и заготовку `BrandSource`. `brand_context_json` целиком уходит в
AI-промпты (summarize / structure / decompose / generate-final), поэтому
презентационные параметры (`#FF6400`, `logo_url`, шрифт) класть в него нельзя —
они засорят промпт и могут быть восприняты моделью как факты.

Нужен отдельный, типизированный, но дешёвый в эволюции слой айдентики, не ломающий
существующие бренды и текущий freeform/wizard-флоу.

## Решения

1. **Отдельная колонка `brand_identity_json` (JSONB) на `Brand`** + Pydantic-схема
   `BrandIdentity` для валидации формы. Консистентно с `brand_context_json` /
   `context_json` / `selected_template_json` (все — JSONB с типизированной формой).
   JSONB + Pydantic даёт валидацию без новой миграции на каждое поле (поля айдентики
   ещё исследуем, проект работает маленькими коммитами).

   Отвергнуто:
   - **отдельные типизированные колонки** — миграция на каждое поле, дорого на ранней стадии;
   - **таблица `BrandAsset`** — преждевременная нормализация; нужна только когда появятся
     загружаемые файлы, а MVP — URL-only;
   - **внутри `brand_context_json`** — смешивает презентацию с LLM-семантикой.

2. **Аддитивная миграция `0006_brand_identity.py`** (`down_revision="0005"`):
   одна колонка `brand_identity_json JSONB NOT NULL server_default '{}'::jsonb`,
   как сделано для `brand_context_json` в 0004. Существующие бренды получают `{}`
   автоматически. Downgrade — drop колонки. `brand_context_json` и таблицы не трогаем.

3. **Схема `BrandIdentity`** (`schemas_brand.py`), все поля опциональны/nullable:

   | Поле | Тип | Валидация |
   |---|---|---|
   | `primary_color` | `str \| None` | hex `#RGB` / `#RRGGBB` |
   | `secondary_color` | `str \| None` | hex |
   | `accent_color` | `str \| None` | hex |
   | `logo_url` | `str \| None` | http(s) URL, пустое допустимо |
   | `font_family` | `str \| None` | свободная строка |
   | `document_style` | `str \| None` | из набора `clean_premium / minimal / bold / classic`, default `clean_premium` |
   | `brand_notes` | `str \| None` | свободный текст |

   Логотип — **только URL** в MVP. Локальный upload / file storage — позже (вне этой фазы).

4. **API/схемы — аддитивно.** `brand_identity_json` добавляется в `BrandRead`
   (обязательное, default `{}`) и опционально в `BrandCreate` / `BrandUpdate`.
   `update_brand` уже generic (`model_dump(exclude_unset)` + `setattr`) — PATCH
   подхватит поле сам; в `create_brand` поле прописывается явно. `BrandListItem`
   остаётся лёгким (без айдентики) — превью отдаётся в detail. `extra="forbid"`
   на Create/Update сохраняется (поле объявлено в схеме).

5. **Frontend — аддитивно.** `types.ts`: интерфейс `BrandIdentity` + поле на
   `Brand` / `BrandCreatePayload` / `BrandUpdatePayload`. На BrandNew/BrandEdit —
   блок «Бренд-айдентика» (color inputs + hex, logo URL, font family,
   `document_style` select, notes) и **preview-карточка**. Сырой
   `brand_context_json` textarea остаётся как есть.

## Backward compatibility

- Колонка `NOT NULL default {}` → старые бренды валидны без миграции данных.
- Поля схемы опциональны → существующие клиенты не ломаются.
- `brand_context_json` и AI-флоу не трогаем; wizard/freeform работают как раньше.
- Экспорты md/json/docx в этой фазе без изменений; E2E (8 тестов) остаётся зелёным.

## Этапы и коммиты

1. **ADR/doc** — этот документ.
2. **Backend storage** (один маленький коммит): `models.py` колонка + миграция `0006`
   + `BrandIdentity` schema + проводка в `BrandRead`/`Create`/`Update` + `create_brand`
   + тесты в `test_brands.py` (round-trip, PATCH, отклонение битого hex, пустой default).
3. **Frontend identity UI** (маленький коммит): types + формы create/edit + preview-карточка
   + проводка payload'ов в `client.ts`.
4. **Использование айдентики (позже, отдельная итерация):** preview → стилизация DOCX
   (`build_docx` принимает опциональную айдентику: цвет заголовков / шрифт) → затем PDF →
   затем branded-шаблон. Всё аддитивно; регрессия md/json/docx обязана остаться зелёной.

## Вне scope этой фазы

PDF-экспорт, branded DOCX/PDF, локальная загрузка/хранилище файлов логотипа, auth,
реальный внешний деплой, переписывание текущего флоу.
