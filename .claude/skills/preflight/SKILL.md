---
name: preflight
description: Verify repository state, environment, commands, and risks before autonomous work.
---

# Preflight Skill

Use this skill before starting autonomous, multi-step, infrastructure, deployment, API, or repository-wide work.

The purpose of preflight is to prevent wasted agent time on avoidable problems:

- wrong directory
- missing environment variables
- broken local setup
- unavailable CLI tools
- wrong API base URL
- unsupported command flags
- hidden git changes
- restart loops

---

## When to Use

Use this skill before:

- multi-file changes
- refactoring
- deployment work
- Docker work
- database or migration work
- API automation
- issue automation
- long-running autonomous tasks
- unfamiliar repo work
- any task where failure could waste time or damage state

---

## Step 1 — Read Instructions

Read the project instructions first:

1. `CLAUDE.md`
2. `docs/ai-workflow.md`, if present
3. README or setup docs, if relevant

Do not start implementation before reading instructions.

---

## Step 2 — Confirm Location

Run:

```bash
pwd
```

Then identify:

- repository root
- current branch
- whether this looks like the intended project

---

## Step 3 — Check Git State

Run:

```bash
git status --short
```

Interpret the result:

- clean tree
- existing user changes
- untracked files
- potential conflicts

If unrelated user changes exist, do not overwrite them.

---

## Step 4 — Detect Stack

Inspect project files and summarize the detected stack.

Look for:

- `pyproject.toml`
- `requirements.txt`
- `package.json`
- `pnpm-lock.yaml`
- `package-lock.json`
- `yarn.lock`
- `Dockerfile`
- `docker-compose.yml`
- `compose.yml`
- `alembic.ini`
- `README.md`

Report only what is actually present.

Do not invent stack details.

---

## Step 5 — Detect Commands

Find available commands for:

- backend tests
- frontend tests
- lint
- typecheck
- build
- dev server
- Docker startup
- database migrations

Prefer documented commands.

Do not assume commands that are not present.

---

## Step 6 — Check Tool Availability

For tools needed by the task, check availability.

Examples:

```bash
python --version
python3 --version
node --version
npm --version
pnpm --version
docker --version
ruff --version
pytest --version
```

Only run checks relevant to the project.

---

## Step 7 — Check Environment Safely

If the task needs environment variables, inspect safe sources:

- `.env.example`
- README
- compose files
- config files

Do not print secret values.

Report only variable names and whether they appear to be required.

Example:

```text
Environment:
- LLM_API_KEY: required, value not printed
- DATABASE_URL: required, value not printed
```

---

## Step 8 — Validate CLI Flags

Before using non-obvious CLI flags, run help:

```bash
<tool> --help
```

Do not use guessed flags in autonomous workflows.

If a flag is unsupported, stop using it.

---

## Step 9 — API Readiness

For API-related tasks:

1. Identify the documented base URL.
2. Check relevant env vars.
3. Verify the service is reachable if it should be running.
4. Do not guess endpoints silently.
5. Prefer documented API paths.

---

## Step 10 — Circuit Breaker

If the same command fails 2 times with the same error:

- stop retrying
- do not restart endlessly
- capture the command
- capture the error
- explain likely cause
- suggest next action

---

## Output Format

Return:

```text
Preflight result: PASS / BLOCKED

Project:
- Root:
- Branch:
- Detected stack:

Git state:
- ...

Detected commands:
- install:
- lint:
- tests:
- typecheck:
- build:
- dev:
- docker:
- migrations:

Environment:
- ...

Tool availability:
- ...

Blockers:
- ...

Next safe action:
- ...
```

If blocked, do not continue implementation unless explicitly instructed.
