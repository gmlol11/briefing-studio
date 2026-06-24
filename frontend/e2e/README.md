# E2E smoke (Playwright)

Локальный smoke. Playwright поднимает только frontend (vite на :5173);
backend и demo-данные — внешний prerequisite.

## Prerequisite

1. Backend на `http://localhost:8000` с применёнными миграциями (`alembic upgrade head`).
2. Demo-данные накачаны детерминированно:

   ```bash
   cd backend
   python scripts/seed_demo.py --reset
   ```

   (или в Docker: `docker compose exec backend python scripts/seed_demo.py --reset`)

Backend CORS по умолчанию разрешает `http://localhost:5173`, так что отдельная
настройка не нужна.

## Запуск

```bash
cd frontend
npm run test:e2e          # headless
npm run test:e2e:headed   # с окном браузера
npm run test:e2e:ui       # Playwright UI mode
```

Первый раз — установить браузер: `npx playwright install chromium`.

Реальный LLM не требуется: тесты опираются на pre-generated `[DEMO]`-брифы из seed.

## Сценарии

- `smoke.spec.ts` — рендер `/`, `/briefs`, `/brands`.
- `wizard.spec.ts` — wizard-бриф открывается в редакторе (не `/review`); generated wizard-бриф
  имеет экспорт-зону и скачивает DOCX.
- `freeform-review.spec.ts` — review-степпер из 5 шагов и контент каждого шага; смена структуры
  делает документ устаревшим (без LLM).
- `exports.spec.ts` — на шаге «Финальный бриф» скачиваются Markdown / JSON / DOCX (DOCX —
  непустой zip с сигнатурой `PK`).

Брифы ищутся по фрагменту title (`[DEMO] …`), не по id — устойчиво к смене id после seed.

## Troubleshooting

- **Тесты падают на загрузке списка / 404 брифа** — не поднят backend на `:8000` или не
  применён seed. Проверьте `curl http://localhost:8000/health` и выполните
  `python scripts/seed_demo.py --reset`.
- **Нет `[DEMO]`-брифов / пустые шаги** — seed не накачан или накачан в другую БД, чем слушает
  backend (сверьте `DATABASE_URL`). Перезапустите seed против той же dev-БД.
- **Порт 5173 занят** — Playwright по умолчанию переиспользует уже запущенный vite
  (`reuseExistingServer`). Если на 5173 крутится посторонний сервер (напр. docker-frontend) —
  остановите его либо запускайте E2E против него же (тот же origin).
- **`browserType.launch: Executable doesn't exist`** — не установлен браузер:
  `npx playwright install chromium`.
- **CORS-ошибки в консоли браузера** — backend должен разрешать `http://localhost:5173`
  (дефолтный `CORS_ORIGINS` уже это делает).
