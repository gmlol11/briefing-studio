# UI/UX Audit: Летопись.AI Studio → Briefing Studio

Источник: `references/demo-ui/index.html`. Весь UI и логика демо лежат в inline `<style>` + `<script>`
внутри `index.html` (внешние minified `main.*.css/js` к демке не подключены), поэтому источник правды
читаемый. Файлы демо используются **только как UI/UX reference** — напрямую не подключаются.

## 1. Design system демо

### Цвета и фон
- **Фон страницы — тёплый градиент**, не плоская заливка: `linear-gradient(130deg,#fff2e8,#ffdbc0,#ffba86)`.
- **Glassmorphism**: панели полупрозрачные поверх градиента — `background:#fff3` (≈`rgba(255,255,255,.2)`),
  `border:1px solid #fff`, у топбара `backdrop-filter:blur(8px)`. Карточки: `--card-bg:#ffffff4d`,
  `--card-bg-light:#fff9`.
- **Акцент — оранжевый**: `--accent:#ff621b`, `--accent-text:#ff7000` (текст/иконки), `--accent-hover:#ff8d0a`,
  active `#cc4d15`, disabled `#ff621b4d`. Мягкие тона: `--accent-soft:#fdebe2`, `--accent-mild:#ffdeca`,
  select-bg `#fff4eb`.
- **Текст**: `--text:#2b2b2b`, `--text-muted:#959595`, `--muted-hard:#565656`.
- **Семантика**: success `#caf1c3`/`#2c8d3e`, warn `#fff4d8`/`#9c6b00`, error `#ffe1ed`.

### Градиенты (фирменная деталь)
Бренд-градиент оранжевого `linear-gradient(135deg,#ff8d0a,#ff621b,#cc4d15)` — на лого-марке, аватаре AI,
иконках, прогресс-барах. Визуальная подпись продукта.

### Типографика
- **Две гарнитуры**: `Raleway` (заголовки/UI, веса 300–800; крупные заголовки тонкие — `weight:300`,
  с выборочным `<b>700`) + `Inter` (тело документа, цифры, KPI; `font-feature-settings:"lnum"`).
- Базовый размер 14px, line-height 1.4; hero до 48px (`weight:300`).

### Радиусы, тени
- Шкала радиусов: `52 / 32 / 24 / 16 / 12 / 8`; кнопки/чипы/бейджи — **pill `99px`**.
- Тени мягкие: `--shadow:0 8px 24px #1414140f`, `--shadow-card:0 4px 16px #1414140a`; у акцентных кнопок —
  цветная тень `rgba(255,98,27,.22)`.

### Компоненты
| Элемент | Поведение |
|---|---|
| **primary-btn** | accent, radius-24, h48 (lg h64), цветная тень; hover→`accent-hover`, active→`#cc4d15`, disabled→`accent-disabled` без тени |
| **ghost-btn** | белый + border `--muted`, hover→фон `accent-soft` + border/текст accent |
| **secondary-btn** | `bg-select` + accent-text + `accent-mild` border |
| **chip** | стеклянный pill, hover→белый+accent; `.primary` — залит accent |
| **inputs** | белый, `1.5px solid --muted`, radius-16, focus→`accent` + кольцо `0 0 0 3px rgba(255,98,27,.12)` |
| **opt-card / check-row / cta-opt** | выбираемые; `.selected/.checked`→ border accent + `bg-select` + кольцо |
| **badge** | pill; `.ok/.warn/.brand` (семантика); confidence-бейджи `high/med/low` |
| **stepper** | `stepper-wrap` (стеклянная полоса) + `step-pip` с номером-кружком; состояния **empty / done (зелёный) / active (accent + кольцо)** |

### Sidebar / Topbar
- **Sidebar 248px**, sticky, на градиенте: бренд-марка (градиентный квадрат), переключатель workspace,
  кнопка «Новая сессия» (accent pill), nav с **pill-активным состоянием** (`active`→ фон accent, белый текст)
  и бейджами, список «последних сессий», профиль-пилюля внизу.
- **Topbar**: стеклянная панель с blur, хлебные крошки, справа `status-pill` с пульсирующей точкой.

### Состояния
- **hover**: `translateY(-1/-2px)` + посветление фона + border accent.
- **active**: тёмный accent `#cc4d15`, `scale(.96)` у круглых кнопок.
- **disabled**: `accent-disabled`, без тени, `cursor:not-allowed`.
- **focus-within**: кольцо вокруг инпута/чат-поля.
- **selected/checked/done/filling/filled**: цветовое + кольцо + (у live-brief) пульсация-glow.

## 2. UX-паттерны демо

- **Стартовый экран (Studio)**: центрированный hero — градиентная марка, тонкий крупный заголовок, лид,
  ряд **quick-command чипов**, большой **chat-input shell**. Вход в сценарий — через «строку запроса».
- **Навигация**: левый sidebar со сценариями; внутри сценария — topbar с крошками и «Выйти».
- **Сценарные карточки** (`script-card`): иконка-обложка, заголовок, описание, низ — счётчик шагов +
  demo-pill; есть `.premium` и `.has-cover`.
- **Stepper** (баннер-флоу): горизонтальная стеклянная полоса пилюль done→active→empty со стрелками.
- **Chat-like flow**: сообщения `msg.ai/.user` с градиентными аватарами, бабблами, `typing`-точками;
  варианты выбора — карточками/чипами после вопроса AI.
- **Варианты выбора**: `opt-card`, `template-card`, `check-row`, `cta-opt`.
- **Формы**: `field` с UPPERCASE-лейблом, крупные инпуты, focus-кольцо; drag-n-drop `drop`-зона.
- **Процесс генерации**: `gen-steps` — строки с состояниями `in-progress` (спиннер) / `done`.
- **Preview / Result / Dashboard**: dashboard с таб-пилюлями, сетка `asset-card`, `lightbox`, `toast`.

### ⭐ Ключевой паттерн — AI-брифинг (прямой аналог Briefing Studio)
Split-screen guided interview:
- **Слева** — AI-интервью: вопрос → чипы-подсказки (один `suggested` со звездой) → клик чипа или свободный
  текст. `AIB_SCRIPT` — массив ходов: `{ai, chips, fill:[{section, confidence, content}]}`.
- **Справа** — **live brief**: 8 секций-карточек, состояния **empty → filling (glow) → filled** с
  **confidence-бейджем** (high/med/low). Сверху прогресс «Бриф заполнен N%» с shimmer. Внизу тёмная карточка
  «AI-рекомендация» (после ≥3 секций) и кнопка «Завершить» (разблокируется при ≥75%).
- **Completion screen**: hero с анимированной галочкой, действия (Просмотреть/PDF/DOCX), документ-бриф —
  нумерованные секции `h2` с бейджем «AI-generated», SWOT-сеткой и KPI-строками.

## 3. Что переносить в Briefing Studio

**Визуал**: тёплый градиент + glass-панели; бренд-градиент + Raleway/Inter; шкала радиусов и pill;
мягкие тени; стили кнопок/чипов/инпутов с focus-кольцом/бейджей; stepper-пилюли; live-brief панель;
документ-рендер; `gen-steps`; toast; hero с галочкой.

**UX**: guided/chat подача вопросов с чипами **как опция**; live-документ; прогресс N% + AI-рекомендация
(из нашего `analyze`); completion-экран после `generate`.

**НЕ переносить**: баннер-студию (`banner*`, `template-card`, resize-чеклисты, drop-зона, asset-library,
dashboard-табы, image-lightbox); media-analyzer (`ma-*`); workspace-switcher, «Бренды/Автоматизации»,
recent-sessions, demo-pill, фейковые данные; искусственные задержки поверх реальных API.

## 4. Демо-flow vs наш текущий wizard

**Что уже хорошо**: модель шагов привязана к backend (`current_step`, 8 шагов, data-driven `steps.ts`);
`ContextSummary` — зародыш live-brief; progress + кликабельные пилюли; `AiActions` умеет
analyze/generate/versions/export/outdated (функционально мы впереди демо); абстракция полей переиспользуема.

**Что менять**: тема целиком; `ContextSummary` → LiveBrief-панель с секциями + confidence + %;
`BriefPreview` (`<pre>`) → документ с нумерованными секциями + «AI-generated»; `AiActions` кнопки в
primary/ghost, генерация как `gen-steps`, outdated как hint; рассмотреть sidebar.

**Где заменить анкету на guided/chat (рекомендация)** — поэтапно и клиентски, без изменения backend:
- **Этап 5** — reskin + live-brief панель + документ-preview (низкий риск, форма-wizard остаётся).
- **Этап 5b/6** — режим «Guided briefing»: чат задаёт вопросы, маппленные на поля `context_json`; ответ →
  тот же `PATCH /api/briefs/{id}/context`; правая панель отражает контекст. Мост уже есть: `analyze`
  возвращает `clarifying_questions` (с `type` и `options`) — готовый источник чипов-вопросов.

**Как сохранить backend/API**: структура `context_json`, ключи полей, эндпоинты — без изменений. Chat —
ещё один способ ввода, дергающий тот же `PATCH /context`; `current_step` трекается; `generate/versions/export`
как есть; новых полей в БД нет (confidence/секции считаются на фронте).

## 5. План реализации — Этап 5 (UI-polish)

Скоуп этапа 5: визуальный reskin + live-brief панель + документ-preview. Backend/API не трогаем.

### Файлы frontend для изменения
- `frontend/index.html` — Google Fonts (Raleway 300–800 + Inter).
- `src/styles/global.css` — основной объём: токены + рестайл компонентов.
- `src/components/Layout.tsx` — glass-топбар + бренд-марка (или sidebar).
- `src/components/BriefWizard.tsx` — обёртка, stepper-пилюли, кнопки.
- `src/components/ContextSummary.tsx` → LiveBrief-панель.
- `src/components/BriefPreview.tsx` → документ-рендер.
- `src/components/AiActions.tsx` — кнопки, `gen-steps`, outdated-hint.
- `src/components/Field.tsx`, `ListInput.tsx` — инпуты/list-чипы.
- `src/components/BriefVersions.tsx` — строки версий.
- `src/pages/HomePage.tsx` — hero + feature/scenario-карточки.
- `src/pages/BriefsListPage.tsx` — строки/бейджи списка.

### Компоненты создать
Слой токенов (CSS-переменные); `LiveBriefPanel` (эволюция `ContextSummary`); `BriefDocument`
(нумерованные секции, общий для preview и `generated_markdown`); `StepperPills` (опционально);
презентационные `Badge`/`Chip`/`Button` (опционально); *(5b)* `GuidedBriefChat`.

### CSS-переменные вынести
Цвета (`--bg` градиент, `--surface-glass`, `--border-glass`, `--accent` + варианты, текст, семантика,
confidence); `--grad-brand`; радиусы `32/24/16/12/8` + `--radius-pill`; тени; шрифты
(`--font-display:Raleway`, `--font-body:Inter`).

### Проверки
`npm run build` (tsc -b + vite) и type-check зелёные; рендерятся `/`, `/briefs`, `/brief/new`,
`/brief/:id` (8 шагов + preview); существующие сценарии целы (create→wizard→save→generate→versions→export→
outdated); backend не тронут (интеграционный тест зелёный, миграций нет); адаптив (одна колонка);
a11y (focus-состояния, контраст — тело тёмное, оранжевый для акцентов).
