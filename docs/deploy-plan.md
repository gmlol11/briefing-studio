# Briefing Studio — Deploy Plan

Документ фиксирует текущий (dev) способ запуска и что потребуется для production-профиля.
Production-профиль в этом этапе **не реализуется** — только план.

## Текущий dev-профиль (docker-compose.yml)

Запуск:

```bash
cp .env.example .env   # заполнить LLM_API_KEY и LLM_MODEL
docker compose up --build
```

Сервисы:
- **db** — `postgres:16-alpine`, данные в именованном volume `pgdata`, healthcheck `pg_isready`.
- **backend** — FastAPI; команда `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`;
  стартует после `db (service_healthy)`; bind-mount `./backend:/app` (live-reload кода).
  `DATABASE_URL` задаётся в compose как `…@db:5432/…` (имя сервиса `db`, **не** localhost) и
  переопределяет значение из `.env`. Остальные переменные (`LLM_*`, `CORS_ORIGINS`, `APP_ENV`,
  `DEBUG`) приходят из `.env` через `env_file`.
- **frontend** — Vite dev-server; команда `npm install && npm run dev -- --host 0.0.0.0`;
  bind-mount `./frontend:/app` + анонимный volume на `node_modules`; `VITE_API_URL=http://localhost:8000`
  (браузерный адрес backend).

Доступ:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000 · Swagger: http://localhost:8000/docs · Health: http://localhost:8000/health
- PostgreSQL: localhost:5432

Назначение: локальная разработка и stage-demo. Подходит для демонстрации и ручного QA.
**Не** предназначен для production (dev-серверы, `--reload`, bind-mounts, нет HTTPS/секрет-менеджмента).

## Что потребуется для production-профиля (позже)

Отдельный `docker-compose.prod.yml` (или оркестратор) со следующими изменениями:

**Frontend**
- Собирать статику: `npm run build` → `dist/`.
- Раздавать через nginx/caddy (или CDN / static hosting); не использовать Vite dev-server.
- `VITE_API_URL` указывает на публичный адрес backend (фиксируется на этапе сборки).

**Backend**
- `uvicorn` без `--reload`; рассмотреть `gunicorn -k uvicorn.workers.UvicornWorker` с несколькими воркерами.
- Образ без bind-mount исходников (код из `COPY`, а не из тома).
- Миграции применять отдельным шагом/job (`alembic upgrade head`) до старта воркеров.

**Postgres**
- Persistent volume с бэкапами (managed Postgres или том + регламент бэкапа).
- Реальные креды через secret-manager, не в `.env` в репозитории.

**Конфигурация и безопасность**
- Env/secrets через secret-manager (LLM-ключ, пароль БД).
- `CORS_ORIGINS` = реальный домен фронтенда (не `localhost`).
- HTTPS (termination на reverse-proxy: nginx/caddy/traefik).
- Доступ закрыть basic-auth / reverse-proxy auth (до интеграции в контур Велес/Нестор).
- Домен.

**Эксплуатация**
- Централизованные логи (stdout → сборщик логов).
- Healthcheck `/health` для оркестратора/балансировщика.
- Мониторинг ошибок LLM (502/504) и латентности.

## Переменные окружения (см. .env.example)

| Переменная | Назначение |
| --- | --- |
| `POSTGRES_USER/PASSWORD/DB/PORT` | Параметры контейнера Postgres |
| `BACKEND_PORT` | Публичный порт backend |
| `APP_ENV`, `DEBUG` | Режим приложения |
| `DATABASE_URL` | Подключение к БД (вне Docker — localhost; в Docker переопределяется на `db`) |
| `CORS_ORIGINS` | Разрешённые источники для CORS |
| `LLM_API_KEY`, `LLM_MODEL` | **Обязательны** для AI-эндпоинтов; иначе analyze/generate → 503 |
| `LLM_BASE_URL` | OpenAI-compatible базовый URL (вызов `POST {base}/chat/completions`) |
| `LLM_TIMEOUT_SECONDS` | Таймаут запроса к LLM (превышение → 504) |
| `FRONTEND_PORT`, `VITE_API_URL` | Порт фронтенда и браузерный адрес backend |

## Известные эксплуатационные замечания

- **Имя модели LLM чувствительно к регистру.** OpenAI отвергает неизвестные/недоступные id
  с ошибкой, которую backend отдаёт как **502** (`"The model ... does not exist or you do not
  have access to it."`). Указывать точный id из `GET {LLM_BASE_URL}/models` (например `gpt-5.4`,
  а не `GPT-5.4`).
- После изменения `.env` контейнер backend нужно пересоздать (`docker compose up -d --force-recreate
  backend`) — переменные читаются при создании контейнера, `restart` их не перечитывает.
