---
name: debug-loop
description: Reproduce, isolate, fix, and verify bugs with minimal safe changes.
---

# Debug Loop Skill

Use this skill when fixing a bug, failing test, broken flow, incorrect output, or unexpected behavior.

The goal is not just to make the error disappear. The goal is to understand and fix the root cause.

---

## When to Use

Use this skill for:

- failing tests
- runtime errors
- incorrect API responses
- broken UI behavior
- database errors
- integration failures
- parsing bugs
- classification bugs
- environment-dependent failures
- regressions

---

## Core Rule

Do not patch randomly.

Follow:

```text
Reproduce → Isolate → Explain → Fix → Verify
```

---

## Step 1 — Define the Bug

Write a short bug statement:

```text
Expected:
Actual:
Scope:
```

Example:

```text
Expected: sports market is classified as sports.
Actual: "Golden State Warriors" is classified as politics.
Scope: market category classifier.
```

---

## Step 2 — Reproduce

Use the narrowest available reproduction method:

- unit test
- API request
- CLI command
- minimal script
- local function call
- frontend interaction, if necessary

If the bug cannot be reproduced, say so clearly.

Do not pretend verification happened if it did not.

---

## Step 3 — Inspect Relevant Files

Read the relevant files before editing.

Identify:

- entry point
- failing function
- related tests
- configuration involved
- expected data shape

Do not edit unrelated files.

---

## Step 4 — Form One Main Hypothesis

State the most likely cause.

Example:

```text
Hypothesis:
The classifier uses substring matching, so "war" matches inside "Warriors".
```

Avoid chasing multiple unrelated hypotheses at once.

---

## Step 5 — Add or Update a Test When Practical

For logic bugs, add a regression test.

Prioritize tests for:

- the exact failure
- boundary cases
- false positives
- false negatives
- empty input
- invalid input
- casing
- partial word matches
- duplicated records
- pagination gaps

If adding a test is not practical, explain why.

---

## Step 6 — Make the Smallest Safe Fix

Fix the root cause.

Avoid broad rewrites.

Do not introduce new dependencies unless necessary.

Do not change public behavior beyond the bug scope unless requested.

---

## Step 7 — Verify

Run the narrowest relevant check first.

Examples:

```bash
pytest path/to/test_file.py -q
ruff check .
npm test -- path/to/test
npm run build
```

Then run broader checks only if needed.

---

## Step 8 — Circuit Breaker

If the same command fails 2 times with the same error:

- stop retrying
- capture the command
- capture the error
- explain likely cause
- suggest next action
- mark blocked if needed

Do not enter infinite loops.

---

## Special Rule: Classification and Matching

Never use naive substring matching for category classification.

Bad:

```python
if "war" in text:
    return "politics"
```

Better:

- word-boundary regex
- tokenization
- normalized terms
- explicit dictionaries
- allowlists / blocklists
- adversarial regression tests

Always test partial-word false positives.

---

## Output Format

At the end, report:

```text
Bug:
- ...

Root cause:
- ...

Fix:
- ...

Changed files:
- ...

Verification:
- ...

Remaining risks:
- ...
```

If the issue could not be fixed, report:

```text
Status: BLOCKED

Reason:
- ...

Evidence:
- ...

Suggested next action:
- ...
```
