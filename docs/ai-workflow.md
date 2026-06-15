# AI Development Workflow

This document defines how AI assistants should be used in this repository.

The goal is not to let an agent freely rewrite the project. The goal is to make AI-assisted development predictable, inspectable, and safe.

---

## 1. Assistant Roles

### ChatGPT

Use ChatGPT for product and architecture work:

- product thinking
- feature decomposition
- roadmap planning
- architecture discussions
- ADR drafts
- tradeoff analysis
- implementation prompts for coding agents
- reviewing agent output before it is applied

ChatGPT should not be treated as the primary tool for direct repository edits.

---

### Claude Code

Use Claude Code for larger repository-aware work:

- codebase exploration
- multi-file changes
- refactoring
- architecture-level changes
- complex debugging
- implementation of medium or large tasks
- checking consistency across the project
- preparing changes that require understanding the whole repo

Claude Code must behave like a careful autonomous developer, not like a blind code generator.

Before changing code, Claude Code must:

1. Read `CLAUDE.md`.
2. Read this file.
3. Inspect the current implementation.
4. Identify relevant files.
5. Propose or internally follow a narrow plan.
6. Make the smallest safe change.
7. Run relevant checks when available.
8. Report what changed and how it was verified.

---

### Codex

Use Codex for narrow implementation work:

- small bug fixes
- tests
- isolated features
- documentation updates
- routine code edits
- PR-sized tasks

Codex tasks should be specific, bounded, and testable.

Good Codex task:

```text
Add validation for X in file Y and update the related tests.
```

Bad Codex task:

```text
Improve the whole architecture.
```

---

## 2. Default Work Process

For any non-trivial task, use this flow:

```text
Understand → Inspect → Plan → Change → Verify → Summarize
```

### Understand

Clarify the goal internally before editing.

The agent should know:

- what user-visible behavior should change
- what should stay unchanged
- what files are likely involved
- what risks exist

### Inspect

Read relevant files before editing.

Do not invent project structure.
Do not assume commands.
Do not guess environment variables.

### Plan

For larger tasks, produce a short plan or follow one internally.

The plan should be practical, not ceremonial.

### Change

Make the smallest safe change.

Avoid broad rewrites unless explicitly requested.

### Verify

Run the narrowest relevant check first.

Examples:

- lint
- unit tests
- typecheck
- API smoke test
- frontend build
- Docker smoke test

If checks are unavailable, say so.

### Summarize

End every task with:

```text
Summary:
- ...

Changed files:
- ...

Verification:
- ...

Risks / follow-up:
- ...
```

---

## 3. Safety Rules

### Do not overwrite user work

Before editing, check git state when practical:

```bash
git status --short
```

If there are unrelated changes, avoid touching them.

---

### Do not silently change architecture

Do not introduce new frameworks, databases, services, dependencies, or architectural patterns unless explicitly requested.

If a dependency is needed, explain why.

---

### Do not edit migrations casually

Existing migrations should not be edited unless explicitly requested.

For schema changes, create a new migration.

---

### Do not expose secrets

Never print secrets from `.env`, shell history, local config, or API responses.

It is acceptable to mention missing variable names, but not their values.

---

### Do not dump long logs

Summarize logs.

Include only the relevant error lines.

---

## 4. Failure Policy

If the same command fails 2 times with the same error:

1. Stop retrying.
2. Capture the exact command.
3. Capture the exact error.
4. Explain the likely cause.
5. Suggest a fix.
6. Mark the task as blocked if it cannot continue safely.

Do not enter restart loops.

---

## 5. Matching and Classification Rule

Never use naive substring matching for business-critical classification.

Bad:

```python
if "war" in text:
    category = "politics"
```

Good:

- token-based matching
- word-boundary regex
- explicit dictionaries
- normalized terms
- tests for false positives
- tests for partial word matches

Any classifier should include adversarial examples.

---

## 6. Agent Handoff Format

At the end of work, report:

```text
Summary:
- One to three bullets.

Changed files:
- path/to/file — what changed

Verification:
- command — result
- command — result

Risks / follow-up:
- anything still uncertain
```

If no files were changed, say:

```text
Changed files:
- None
```

---

## 7. When to Stop and Ask

The agent should stop and ask, or mark blocked, when:

- required secrets are missing
- the environment cannot run
- commands repeatedly fail with the same error
- the requested change conflicts with project instructions
- the task requires product decisions not present in the prompt
- the agent would need to rewrite unrelated parts of the system

Do not guess through major uncertainty.
