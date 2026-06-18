# Manual QA / UX-аудит: оба flow Briefing Studio

Ручной сценарий приёмки для wizard-flow и brand-aware freeform-flow. Рассчитан на
проверку **без реального LLM** — заполненные и pre-generated состояния создаёт seed-скрипт.
Где AI-операции требуют ключа (analyze/generate/summarize/structure/…), это отмечено как
«нужен `LLM_API_KEY`» — такие шаги опциональны.

## 0. Предусловия

- Backend и frontend запущены (Docker `docker compose up --build`, либо локально:
  `uvicorn app.main:app --reload` + `npm run dev`). См. README.
- Миграции применены (`alembic upgrade head`, head = `0004`).
- Frontend: http://localhost:5173 · Backend: http://localhost:8000 (Swagger `/docs`).

## 1. Подготовка демо-данных

```bash
cd backend
# DATABASE_URL → dev-БД с применёнными миграциями
python scripts/seed_demo.py
```

Создаётся (всё помечено маркером `[DEMO]`, повторный запуск не плодит дубли):

| Сущность | Заголовок / имя | Состояние |
| --- | --- | --- |
| Brand | `[DEMO] Север` | + 1 источник `brand_bible` |
| Wizard brief | `[DEMO] Wizard — промо-ролик` | заполнен, `in_progress` |
| Wizard brief | `[DEMO] Wizard — готовый бриф` | **pre-generated** (markdown + версия) |
| Freeform brief | `[DEMO] Freeform — на ревью` | summary подтверждён, structured + clarifications |
| Freeform brief | `[DEMO] Freeform — готовый бриф` | **pre-generated** (markdown + версия) |

Очистка / пересоздание: `python scripts/seed_demo.py --reset`.

## 2. Проверка wizard-flow

1. Открыть `/briefs` → найти `[DEMO] Wizard — промо-ролик` (без бейджа Freeform) → открыть.
2. Должен открыться wizard-редактор `/brief/:id` (НЕ `/review`).
3. Пройти по шагам: поля предзаполнены (тип задачи, цель, сообщения, тон, must-have и т.д.).
4. Справа **Live brief**: секции в состоянии filled/filling, прогресс и confidence считаются
   на фронте из `context_json`.
5. На шаге предпросмотра — документ из 17 разделов (не JSON).
6. (нужен `LLM_API_KEY`) «Проанализировать бриф» и «Сгенерировать бриф».
7. Изменить любое поле → проверить, что автосейв срабатывает (индикатор «Сохранено»).

**Успех:** wizard открывается в редакторе, поля заполнены, Live brief отражает контекст,
предпросмотр рендерится как документ, автосейв работает.

## 3. Проверка brand-aware freeform-flow

1. `/brands` → есть `[DEMO] Север` → открыть `/brands/:id`, виден `brand_context_json`.
2. Создать новый freeform-бриф: с `/brands/:id` кнопка → `/brief/new/freeform?brand=:id`
   (либо `/brief/new/freeform` и выбрать бренд).
3. Вставить клиентский текст → «Создать и сделать summary» → редирект на `/brief/:id/review`.
   - (нужен `LLM_API_KEY` для реального summary; без ключа используйте готовый
     `[DEMO] Freeform — на ревью` из seed для остального осмотра.)
4. На review-экране для `[DEMO] Freeform — на ревью`:
   - Шаг summary: показан `input_summary_json`, виден признак «подтверждено».
   - Шаг структуры: поля с бейджами **source_type / status / confidence**.
   - Шаг уточнений: вопросы `clarifications` (importance critical/recommended/optional).
5. (нужен `LLM_API_KEY`) Ответить на уточнения → «Применить» → «Сгенерировать финальный бриф».
6. 409-гейт: если в структуре есть `critical_missing`/`conflict`, generate-final возвращает
   понятную ошибку «Не подтверждены критичные поля: …». (В demo-данных критичных полей нет —
   чтобы увидеть гейт, временно выставьте полю `critical_missing` через Swagger/structure.)

**Успех:** бренд находится, freeform-бриф ведёт на `/review`, видны summary → структура →
уточнения, бейджи читаемы, generate-final гейтится при критичных полях.

## 4. Pre-generated документы, версии, export

Открыть `[DEMO] Wizard — готовый бриф` и `[DEMO] Freeform — готовый бриф`:

1. Виден готовый markdown-документ с бейджем «AI-generated».
2. **Versions**: раскрывается история (минимум v1) в документном стиле.
3. **Export**: «Download Markdown» (`/export/markdown`) и «Download JSON» (`/export/json`)
   скачивают файлы; для wizard до генерации markdown-export даёт 409 (на готовом — 200).
4. **Copy** копирует markdown в буфер.
5. `is_generated_outdated`:
   - У готовых брифов сразу — НЕ устарел (hash совпадает с источником).
   - Изменить структуру/контекст (freeform: structured-поля; wizard: любое поле) → документ
     помечается «Требует перегенерации», в списке `/briefs` бейдж «Требует перегенерации».

**Успех:** документ, версии и export работают офлайн; устаревание загорается после правки.

## 5. Что считать успешным прохождением

- Оба flow доходят до конца без 5xx и без падений UI.
- Wizard-брифы открываются в редакторе, freeform-брифы — на `/review`.
- В списке `/briefs` freeform помечены бейджем и ведут на `/review`; wizard — на `/brief/:id`.
- Pre-generated брифы показывают markdown, версии и экспортируются; `is_generated_outdated`
  корректно реагирует на изменение источника.
- Удаление бренда не ломает связанные брифы (их `brand_id` обнуляется).
- Seed идемпотентен: повторный запуск не плодит дубли.

## 6. UX-долги / что проверить глазами

Открытые вопросы для визуального аудита (фиксировать наблюдения, не блокеры приёмки):

- [ ] **Два режима**: понятно ли с главной `/`, что есть два способа создать бриф?
- [ ] **Отличие brand-aware от wizard**: ясно ли пользователю, чем freeform отличается от
      пошагового wizard, и когда что выбирать?
- [ ] **Создание бренда**: легко ли найти путь «создать бренд» до создания freeform-брифа?
- [ ] **Подтверждение summary**: очевидно ли, что summary нужно подтвердить перед структурой?
- [ ] **Бейджи source/status/confidence**: читаются ли без легенды? Понятна ли разница
      `confirmed` / `confirmed_by_brand` / `needs_confirmation` / `*_missing` / `conflict`?
- [ ] **409 на generate-final**: понятно ли из текста ошибки, ПОЧЕМУ нельзя сгенерировать и
      что именно подтвердить?
- [ ] **Clarifications**: удобно ли отвечать на вопросы (особенно много вопросов)? Видна ли
      важность (critical/recommended/optional)?
- [ ] **Редактирование structured fields**: хватает ли того, что поля нельзя править инлайн
      (правка только через clarifications)? Это осознанный долг MVP — оценить остроту.
- [ ] **Редирект `/brief/:id` → `/review`**: не сбивает ли с толку, что freeform-бриф
      перекидывает с редактора на review-экран?
- [ ] **Устаревание**: заметно ли в UI, что документ устарел после изменения структуры?
- [ ] **Copy / Download**: удобны ли действия copy / download markdown / download json,
      понятны ли их подписи?

### Известные сознательные ограничения (не баги)

Инлайн-редактирование structured-полей, фильтры структуры, восстановление версий,
audio/RAG/web-search/file upload, авторизация, PDF/DOCX — вне MVP (см.
[brand-aware-flow.md](brand-aware-flow.md)).
