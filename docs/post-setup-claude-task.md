# Post-Setup Claude Code Task

Use this prompt after adding:

- `docs/ai-workflow.md`
- `.claude/skills/preflight/SKILL.md`
- `.claude/skills/debug-loop/SKILL.md`
- `.claude/settings.json`

The purpose is to make Claude Code inspect the project without changing application code.

---

## Prompt

```text
Read CLAUDE.md and docs/ai-workflow.md.

Then run the preflight skill.

Check the project structure, available commands, git state, environment requirements, and likely quality gates.

Do not modify application code.

Do not edit backend, frontend, migrations, package files, tests, or configuration unless explicitly required for preflight reporting.

After preflight, inspect the project and suggest improvements to the agent workflow only.

Do not implement the improvements yet.

Return:

1. Preflight result
2. Detected stack
3. Current git state summary
4. Available commands
5. Missing or risky environment/config items
6. Suggested workflow improvements
7. Whether the ruff hook is safe to keep enabled
8. Any blockers

Keep the response concise.
Do not dump long logs.
```

---

## Expected Output Format

Claude Code should answer like this:

```text
Preflight result: PASS / BLOCKED

Detected stack:
- ...

Git state:
- ...

Available commands:
- install:
- lint:
- tests:
- typecheck:
- build:
- dev:
- docker:

Environment/config risks:
- ...

Workflow improvement suggestions:
- ...

Ruff hook:
- safe / unsafe / needs adjustment

Blockers:
- ...
```

---

## Important Constraints

Claude Code must not:

- refactor code
- fix bugs
- update dependencies
- rewrite project docs unrelated to agent workflow
- modify migrations
- modify application config
- create new architecture files unless asked

This is an inspection-only task.
