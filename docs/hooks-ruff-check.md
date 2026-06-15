# Ruff Hook Policy

This document describes the safe Claude Code hook used for Python linting.

The goal is to catch simple Python issues after AI edits without breaking the agent workflow when `ruff` is not installed.

---

## Active Hook

File:

```text
.claude/settings.json
```

Recommended content:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import json, shutil, subprocess, sys; payload=json.load(sys.stdin); tool_input=payload.get('tool_input') or {}; path=tool_input.get('file_path') or tool_input.get('path') or ''; sys.exit(0) if not path.endswith('.py') or shutil.which('ruff') is None else sys.exit(subprocess.call(['ruff', 'check', path]))\""
          }
        ]
      }
    ]
  }
}
```

---

## Why This Hook Is Safe

This hook:

- runs only after Claude Code `Edit` or `Write`
- checks only changed Python files
- skips non-Python files
- skips silently if `ruff` is not installed
- uses `python3`, not `python`
- reads Claude Code payload from stdin
- does not use heredoc
- does not run the entire test suite after every edit
- does not block frontend or markdown edits
- does not modify files
- does not perform network calls

---

## Why Not Use a Heredoc

Do not use this pattern:

```bash
python3 - <<'PY'
...
PY
```

Claude Code sends hook payload through stdin.

A heredoc also uses stdin, so the Python script cannot read the JSON payload. This causes `json.load(sys.stdin)` to fail.

Use `python3 -c` instead.

---

## When Ruff Is Missing

If `ruff` is not installed, the hook exits with code `0`.

This is intentional.

The hook should not block development just because local lint tools are not installed yet.

---

## When to Use a Stronger Hook

After the project environment is stable, consider stronger checks.

Example:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "ruff check ."
          }
        ]
      }
    ]
  }
}
```

Eventually, when tests exist and are fast:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "ruff check . && pytest -q"
          }
        ]
      }
    ]
  }
}
```

Use stronger hooks only when:

- commands are fast
- environment is stable
- tests exist
- false failures are rare
- the agent is not trapped in noisy loops

---

## When to Disable Hooks

Disable or weaken hooks if:

- they fail because the environment is incomplete
- they slow down every edit too much
- they produce unrelated noise
- they cause repeated identical failures
- they make the agent focus on tooling instead of the task

---

## Circuit Breaker Rule

If a hook fails twice with the same error, the agent must stop retrying and report:

```text
Hook failure:
- command:
- error:
- likely cause:
- suggested fix:
```

Do not keep editing blindly.
