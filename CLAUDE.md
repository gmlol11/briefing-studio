# Briefing Service — Agent Instructions

## Project overview
This is a FastAPI + React + PostgreSQL briefing generation service.

Backend:
- FastAPI
- SQLAlchemy 2.0
- Alembic
- PostgreSQL
- LLMService with OpenAI-compatible API

Frontend:
- React
- Vite
- TypeScript

## Common commands
Run backend tests:
pytest -q

Run backend lint:
ruff check .

Run docker smoke test:
docker compose up --build

Check backend health:
curl http://localhost:8000/health

Check frontend:
open http://localhost:5173

## Before changing code
1. Read the relevant files.
2. Identify existing patterns.
3. Make the smallest safe change.
4. Run lint/tests if available.
5. Report only changed files and result.

## Failure policy
If the same command fails twice with the same error, stop retrying.
Summarize:
- failing command
- exact error
- likely cause
- suggested fix

## Output policy
Keep responses short.
Do not dump long logs.
Summarize logs instead.

## Database policy
Do not edit existing migrations unless explicitly asked.
Create a new Alembic migration for schema changes.