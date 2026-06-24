# Briefing Studio — Deploy Plan

Документ фиксирует текущий (dev) способ запуска и **конкретный план** production-профиля.
Сама prod-инфраструктура добавляется отдельными аддитивными коммитами (compose/nginx/entrypoint)
и **не ломает dev-flow**; реальный деплой (хост, DNS, TLS, секреты) остаётся ручным шагом.

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

## Целевая production-схема

Один публичный вход — **nginx** фронтенда: отдаёт статику SPA и проксирует `/api` на backend
(same-origin). Внутренняя сеть compose: `nginx (frontend) → backend:8000 → db:5432`.

```
            ┌───────────────────────────── docker-compose.prod.yml ─────────────────────────────┐
 интернет → │  frontend (nginx :80)  ──/api──►  backend (uvicorn :8000, workers) ──►  db (PG vol) │
            │     отдаёт dist/ SPA              entrypoint: alembic upgrade head                  │
            └─────────────────────────────────────────────────────────────────────────────────────┘
```

- **Postgres**: managed PG (предпочтительно) либо контейнер + **persistent volume** + регламент бэкапа.
- **backend**: FastAPI/`uvicorn` **без `--reload`**, `--workers N`; код из `COPY` (без bind-mount);
  миграции до старта воркеров; healthcheck `/health`; логи в stdout.
- **frontend**: `npm run build → dist/`, раздача через nginx (не Vite dev-server).
- **reverse proxy**: тот же nginx — SPA-fallback `try_files … /index.html` + `proxy_pass /api → backend`.
- **CORS**: при same-origin **не нужен**; если фронт и API на разных доменах — `CORS_ORIGINS`=реальный домен.
- **env/secrets**: `.env.prod` вне репозитория / secret-manager.
- **volumes/backups**: PG-volume + `pg_dump`/снапшоты.

## Выбранная стратегия

- **Отдельный `docker-compose.prod.yml`** (НЕ docker profiles): dev `docker-compose.yml` остаётся
  нетронутым; разные команды/таргеты/отсутствие bind-mount чище держать в отдельном файле.
- Dev-`Dockerfile`-ы не трогаем; для prod добавляется **`frontend/Dockerfile.prod`** (multi-stage
  `node build → nginx:alpine`). Backend переиспользует свой `Dockerfile` (prod-команда переопределяется).
- Новые файлы (добавляются последующими коммитами):
  - `docker-compose.prod.yml` — db (volume) + backend (prod-команда, entrypoint-миграции, healthcheck) + frontend (nginx);
  - `frontend/Dockerfile.prod` — multi-stage сборка статики + nginx;
  - `frontend/nginx.conf` — SPA-fallback + `/api`-proxy;
  - `backend/entrypoint.sh` — `alembic upgrade head` → `exec uvicorn … --workers`;
  - `.env.prod.example` — шаблон prod-переменных (без секретов).

## Решение по `VITE_API_URL` (same-origin)

Vite инлайнит `VITE_API_URL` на этапе **сборки**. Чтобы не зашивать домен и не плодить CORS:
- prod-сборка фронта идёт с **`VITE_API_URL=""`** (пустая строка);
- клиент (`API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'`; пустая строка не
  триггерит `??`) шлёт **относительные** запросы `/api/...` → same-origin;
- nginx отдаёт SPA и `proxy_pass` `/api` на `backend:8000`;
- CORS при этом не требуется (один origin). **Product-код менять не нужно** — только env сборки.

## Backend production

- Команда: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2` (без reload; gunicorn — опц. позже).
- **Миграции**: `entrypoint.sh` → `alembic upgrade head`, затем `exec uvicorn …` (single-node — ок).
- `APP_ENV=production`, `DEBUG=false`. Healthcheck → `/health`. Логи stdout. Таймаут LLM из env.
- **Ограничение single-node**: при нескольких репликах backend миграции в entrypoint дадут гонку —
  выносить в одноразовый `migrate`-job (см. риски).

## Database

- Persistent volume (или managed PG). Бэкап: `pg_dump`/снапшоты; restore: `pg_restore`/`psql`.
- Миграции: `alembic upgrade head` (entrypoint/one-shot).
- **`seed_demo.py` в prod НЕ запускается**: dev-guard скрипта откажет при `APP_ENV=production`
  (без `--force`), и в prod-compose seed-шага нет — двойная защита.

## Security / secrets

- `.env.prod` — **не коммитим** (в `.gitignore`); значения через env/secret-manager.
- Секреты: `LLM_API_KEY`, пароль PG. `CORS_ORIGINS` — реальный домен (или не нужен при same-origin).
- HTTPS — termination на reverse-proxy/балансировщике (nginx-сертификаты или внешний LB).
- Auth — **вне scope** (за reverse-proxy basic-auth / контур Велес-Нестор). Allowed-hosts
  (`TrustedHostMiddleware`) — возможное будущее усиление.

## CI/CD

- Текущий CI (`.github/workflows/ci.yml`) **только тестирует** (backend + build + E2E) — деплой не делает.
- **Деплой пока ручной.** Позже: на тег — build & push образов в registry (GHCR) + отдельный deploy-job/окружение.

## Риски и митигации

| Риск | Митигация |
| --- | --- |
| build-time `VITE_API_URL` зашивает домен | same-origin: сборка с `VITE_API_URL=""`, nginx-proxy `/api` |
| CORS между фронтом и API | same-origin (CORS не нужен); иначе строгий `CORS_ORIGINS` |
| Миграции на старте при нескольких репликах | single-node entrypoint ок; multi-replica → отдельный `migrate`-job |
| Docker networking | backend как `backend:8000` во внутренней сети; БД наружу не публиковать |
| Потеря данных Postgres | persistent volume + регламент бэкапов/снапшотов |
| Отсутствие `LLM_API_KEY` | AI-эндпоинты → 503, остальное работает; ключ — в prod-секреты |
| demo seed в prod | guard `APP_ENV=production` + отсутствие seed-шага в prod-compose |

## Эксплуатация

- Централизованные логи (stdout → сборщик).
- Healthcheck `/health` для оркестратора/балансировщика.
- Мониторинг ошибок LLM (502/504) и латентности.

## Локальная проверка prod-профиля (приёмочный шаг)

> На текущей dev-машине Docker недоступен → end-to-end prod-smoke выполняет пользователь.
> Что проверять после `docker compose -f docker-compose.prod.yml up --build`:
> - `curl http://localhost:8000/health` (или внутр.) → `ok`;
> - фронт (nginx) отдаёт SPA; запросы идут на относительный `/api`;
> - `/api/briefs` через nginx → backend отвечает;
> - `seed_demo.py` при `APP_ENV=production` **отказывается** запускаться.
> Локально без Docker валидируем лишь: `VITE_API_URL="" npm run build` и синтаксис `nginx -t`.

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
