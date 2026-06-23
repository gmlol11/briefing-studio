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
