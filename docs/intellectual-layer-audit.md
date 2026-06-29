# Intellectual Layer — Audit & Architecture

**Branch:** `feature/intellectual-layer-audit`
**Base commit:** `5ea96fe` (tag: `document-layer-complete`)
**Status:** docs-only, no code changed

---

## 1. Current flow map

### Wizard-flow

```
wizard input
  → context_json (fields collected step-by-step)
  → analyze_brief.md   → score / strong / weak / missing / clarifying_questions / assumptions / risks
  → generate_brief.md  → generated_markdown
```

Key files:
- `backend/app/services/brief_ai_service.py`
- `backend/app/routers/briefs.py`
- `backend/app/prompts/analyze_brief.md`
- `backend/app/prompts/generate_brief.md`
- `backend/app/prompts/regenerate_section.md`

Analysis result (`analyze`) is returned to the caller but **not persisted** — it is consumed in-flight and discarded before `generate` runs. The `generate_brief.md` prompt receives only `context_json`, with no analysis output threaded through.

### Brand-aware freeform-flow

```
raw_input
  → summarize_input.md         → summary_json
  → verify (schema check)
  → structure_brand_brief.md   → structured_brief_json (fields + statuses)
  → generate_clarifications.md → clarifying_questions[]
  → apply_clarifications.md    → updated structured_brief_json
  → generate_final_brand_brief.md → generated_markdown
```

Key files:
- `backend/app/services/brand_brief_service.py`
- `backend/app/routers/brand_briefs.py`
- `backend/app/prompts/summarize_input.md`
- `backend/app/prompts/structure_brand_brief.md`
- `backend/app/prompts/generate_clarifications.md`
- `backend/app/prompts/apply_clarifications.md`
- `backend/app/prompts/generate_final_brand_brief.md`

`generate_final_brand_brief.md` has a 409-gate: if any field has status `critical_missing` or `conflict`, the endpoint refuses to generate until resolved.

---

## 2. Diagnosis

### What the prompts do well

- Strong anti-hallucination guard in every stage ("не выдумывай факты", "используй только данные").
- Clear field-status vocabulary: `confirmed`, `inference`, `needs_confirmation`, `critical_missing`, `optional_missing`, `confirmed_by_brand`.
- Structured JSON output from early stages, enabling reliable downstream use.
- `generate_brief.md` already has sections for коммуникационная задача, иерархия сообщений, production-принцип — the skeleton is right.

### What is missing

The anti-hallucination guard, designed for extraction stages, propagates unchanged into the final generation stage. This silences the strategic thinking that should happen at that stage.

The final generation prompts (`generate_brief.md`, `generate_final_brand_brief.md`) operate as **render prompts**: they take structured fields and produce formatted Markdown. They are not **thinking prompts**: they do not interpret, enrich, or make the document actionable.

Specifically absent from final generation:

| Missing capability | Effect on output |
|---|---|
| Формулировка коммуникационной задачи как вывода (не пересказ полей) | Раздел «Коммуникационная задача» — пересказ цели, не инсайт |
| Audience tension (внутренний конфликт/барьер аудитории) | Аудитория описана, но не «разрезана» стратегически |
| Single sharpened insight | Нет формулировки «почему именно сейчас, именно для них» |
| 2–3 creative hypotheses | Нет направлений для команды, нет с чего начать |
| Messaging angles | Есть иерархия, нет угла атаки |
| Production implications | Production-принцип декларативный, не операциональный |
| Explicit risk/assumption transparency | Допущения есть, но не ранжированы по влиянию |
| Open questions as action items | Вопросы перечислены, не сформулированы как tasks |
| Epistemic labels in body text | Факт / Интерпретация / Гипотеза / Направление не маркированы |

### Root cause

The pipeline is:

```
extract → normalize → structure → render
```

It should be (at the final stage):

```
extract → normalize → structure → interpret → enrich → render
```

The `interpret → enrich` step does not exist. It needs to live somewhere in the pipeline.

---

## 3. Architecture options

### Option A — Separate enrichment endpoint + enrichment_json stored

```
structured_brief_json
  → POST /enrich          → enrichment_json (saved to DB column)
  → generate-final        → reads structured + enrichment_json → markdown
```

- Pro: enrichment is reusable; can display in UI; explicit intermediate artifact.
- Con: new migration, new endpoint, new schema field, more latency, UI work required. High coupling risk.

### Option B — Explicit enrich step inside the service, no new endpoint

```
generate_final():
  1. call LLM with enrich_prompt(structured_brief_json) → enrichment dict (not saved)
  2. call LLM with render_prompt(structured_brief_json + enrichment dict) → markdown
```

- Pro: no migration, no new endpoint. Separation of concerns.
- Con: two LLM calls per generation. ~2× latency and cost.

### Option C — Internal enrichment inside single final generation call ✅ SELECTED

```
generate_final():
  single LLM call with updated prompt:
    1. internal: interpret the data (audience tension, insight, hypotheses)
    2. internal: enrich sections with strategic layer
    3. render: output markdown with epistemic labels
```

- Pro: no migration, no new endpoint, no UI change, no schema change, backward-compatible, single LLM call (no latency increase), fastest to validate quality on real briefs.
- Con: less explicit audit trail of enrichment; harder to inspect enrichment separately.

### Option D — Generation modes (conservative / strategic / creative)

```
POST /briefs/{id}/generate?mode=strategic
```

- Pro: user control, A/B testable.
- Con: UI selector, routing logic, multiple prompt variants. High UI/API surface.

**Decision:** Start with C. Grow into B if enrichment needs to be inspectable. Add D after quality is validated.

---

## 4. Target flow (post B1)

```
raw_input / wizard input
  → [extraction stages — unchanged]
  → structured_brief_json / context_json
  → generate-final (updated prompt):
      STEP 1 — interpret (internal, not rendered):
        - formulate communication task as a derived conclusion
        - identify audience tension (barrier / conflict)
        - crystallize insight ("почему сейчас, почему они")
        - generate 2–3 creative hypotheses
        - generate 2–3 messaging angles
        - identify production implications
        - rank assumptions by impact
        - convert open questions to action items
      STEP 2 — render:
        - write each section using STEP 1 output + source data
        - label every non-fact with: [Факт] [Интерпретация] [Гипотеза] [Направление]
        - keep anti-hallucination guard on factual claims
  → generated_markdown (strategically enriched)
```

---

## 5. Data model impact

**Option C: zero.** No new columns, no migration, no schema changes.

Future (Option B): would add `enrichment_json JSONB` column to `brand_briefs` and `briefs` tables, requiring Alembic migration `0007`.

---

## 6. Prompt impact

Files to change in B1 (prompt-only):

1. `backend/app/prompts/generate_final_brand_brief.md` — primary target (brand-aware flow)
2. `backend/app/prompts/generate_brief.md` — wizard flow

Changes:
- Add internal enrichment instruction block before render instructions.
- Add epistemic label system: `[Факт]` `[Интерпретация]` `[Гипотеза]` `[Направление]`.
- Keep all existing anti-hallucination guards — they apply to factual claims, not interpretations.
- Add mandatory output elements: коммуникационная задача (as derived conclusion), audience tension, insight, 2–3 creative hypotheses, messaging angles, production implications.
- Reframe open questions as action items (не «неизвестно X», а «Уточнить X у клиента до старта»).

Files not changing in B1:
- `summarize_input.md` — factual extraction, correct as-is
- `structure_brand_brief.md` — field structuring, correct as-is
- `generate_clarifications.md` — clarification generation, correct as-is
- `apply_clarifications.md` — applying clarifications, correct as-is
- `analyze_brief.md` — analysis for wizard, correct as-is
- `regenerate_section.md` — section regeneration (address separately if needed)

---

## 7. Test strategy

B1 is prompt-only with no schema/endpoint changes, so:

- **No migration tests needed.**
- **Existing pytest suite must pass unchanged** (no new fixtures, no new routes).
- **Qualitative check:** run one real brief through the updated prompt manually and compare output.
- **Regression check:** verify existing fields still appear with correct values (no hallucination introduced).
- **Label check:** verify `[Факт]` / `[Интерпретация]` / `[Гипотеза]` / `[Направление]` labels appear in output.

Suggested manual test cases:
1. Brand brief with full data → expect: insight formulated, 2–3 hypotheses, labeled sections.
2. Brand brief with some `inference` fields → expect: inference fields labeled `[Интерпретация]`, not stated as facts.
3. Wizard brief → expect: same enrichment behavior in `generate_brief.md` output.

---

## 8. Rollout plan

```
B0  docs-only commit (this document)         ← current
B1  prompt-only: generate_final_brand_brief  ← next
B2  prompt-only: generate_brief (wizard)     ← after B1 validated
B3  (optional) regenerate_section enrichment ← after B2
B4  (optional) explicit enrichment_json step ← if inspectability needed
B5  (optional) generation modes selector     ← if A/B testing needed
```

Each step is independently shippable and independently testable.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Prompt increases output length significantly | Add explicit length guidance: «Каждый раздел — не длиннее, чем нужно для передачи идеи» |
| Model invents facts under guise of "hypothesis" | Keep `[Гипотеза]` label mandatory; guard: «гипотезы основаны только на данных брифа, не на общих предположениях о рынке» |
| Epistemic labels feel mechanical | Integrate labels naturally: «По данным брифа [Факт]…» vs forced `[Факт]: …` prefix |
| Existing template-mode rendering breaks | Template mode (`selected_template_json`) is a rendering concern — enrichment runs before rendering, so it is additive |
| B1 degrades wizard flow (unintended) | B1 targets brand flow first; wizard prompt updated separately in B2 |

---

## 10. First implementation step (B1)

Rewrite `generate_final_brand_brief.md` to add a two-phase structure:

**Phase 1 — Strategic interpretation (internal, drives the writing):**
- Derive communication task as a conclusion, not a field copy.
- Identify the audience's core tension or barrier.
- Crystallize one insight: the single most actionable observation.
- Generate 2–3 creative hypotheses rooted in the brief data.
- Generate 2–3 messaging angles.
- Identify production implications (what this means for format, medium, craft choices).
- Rank top 3 assumptions by impact on strategy.
- Reframe open questions as action items.

**Phase 2 — Render:**
- Use Phase 1 output to write each section.
- Label non-facts: `[Интерпретация]` `[Гипотеза]` `[Направление]`.
- Keep `[Факт]` implicit (unlabeled) or explicit by choice.
- Maintain anti-hallucination guard on all factual claims.
- Maintain 409-gate logic (critical_missing fields still block generation).

No code changes. No migrations. No endpoint changes. No UI changes.

---

## V1 decision: strategic-default, no generation modes

For v1 we ship a single strategic-by-default generation behavior and do **not**
implement generation modes. This records the decision so it is not re-litigated.

**Not added in v1:**
- UI selector for generation modes;
- backend `generation_mode` parameter;
- persisting a chosen mode in the database;
- separate conservative / creative prompt variants.

**Why:**
- B1 already established the desired strategic default behavior, validated by QA;
- for the demo and v1, a stable high-quality baseline matters more than optionality;
- modes without a UI consumer would be dead code;
- modes would require new product surface, additional tests, and changes to
  hash/version semantics (`generated_hash_source`);
- this is better left to post-v1 when there is a real product reason.

**Current behavior (v1):**
- final generation works as strategic-by-default;
- facts stay factual;
- interpretations / hypotheses / directions are explicitly labeled
  (`Факт:` / `Интерпретация:` / `Гипотеза:` / `Направление:`);
- conservative / creative modes are not exposed.

**Possible post-v1 evolution:**
- `generation_mode = conservative | strategic | creative`;
- UI selector for the mode;
- include the mode in `generated_hash_source` (so changing mode marks outdated);
- mode-specific QA;
- possibly a stored `enrichment_json` (variant B from the options above).
