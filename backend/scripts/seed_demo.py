#!/usr/bin/env python3
"""Dev-only demo seed for Briefing Studio.

Creates a reproducible set of demo entities so both flows can be reviewed
locally **without an LLM**:

* one demo brand (+ a brand_bible source as an illustration);
* a wizard brief (filled, in progress) and a pre-generated wizard brief;
* a freeform brief (verified summary + structured + clarifications, on review)
  and a pre-generated freeform brief.

Idempotent: re-running updates the demo rows in place (matched by a ``[DEMO]``
marker) instead of creating duplicates. Writes via ORM, but every freeform /
wizard blob is validated against the Pydantic schemas before persisting, so it
stays consistent if the schemas change.

NOT wired into app startup. Refuses to run outside a dev environment unless
``--force`` is given. Never run against production.

Usage:
    python scripts/seed_demo.py              # seed / update demo data
    python scripts/seed_demo.py --reset      # delete demo data, then recreate
    python scripts/seed_demo.py --dry-run    # validate blobs, no DB writes
    python scripts/seed_demo.py --database-url postgresql+psycopg://...

Docker:
    docker compose exec backend python scripts/seed_demo.py
"""

from __future__ import annotations

import argparse
import pathlib
import sys

# Make the backend root importable as the `app` package when run as a file.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, func, select  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.models import (  # noqa: E402
    Brand,
    BrandSource,
    Brief,
    BriefVersion,
    default_template,
)
from app.schemas import BriefContext  # noqa: E402
from app.schemas_brand import (  # noqa: E402
    BriefTemplate,
    Clarifications,
    InputSummary,
    StructuredBrief,
)
from app.utils import context_hash  # noqa: E402

# --- markers used for idempotency -----------------------------------------

DEMO_MARKER = "[DEMO]"
DEMO_BRAND_NAME = f"{DEMO_MARKER} Север"
WIZARD_DRAFT_TITLE = f"{DEMO_MARKER} Wizard — промо-ролик"
WIZARD_GENERATED_TITLE = f"{DEMO_MARKER} Wizard — готовый бриф"
FREEFORM_REVIEW_TITLE = f"{DEMO_MARKER} Freeform — на ревью"
FREEFORM_GENERATED_TITLE = f"{DEMO_MARKER} Freeform — готовый бриф"

_ALLOWED_ENVS = {"local", "dev", "development", "test"}

# --- demo blobs (validated below before any write) ------------------------

BRAND_CONTEXT = {
    "tone": "тёплый, уверенный, без пафоса",
    "audience": "горожане 25–40, ценят локальное и натуральное",
    "values": ["честность", "локальность", "забота"],
    "do": ["говорить просто", "показывать людей", "польза выше хайпа"],
    "dont": ["агрессивные распродажи", "клише про «№1 на рынке»"],
    "voice": "первое лицо мн. числа, короткие фразы",
}

BRAND_SOURCE = {
    "source_type": "brand_bible",
    "title": "Brand bible (фрагмент)",
    "content_text": "«Север» — про тёплый минимализм и локальное производство.",
}

WIZARD_CONTEXT = {
    "author_role": "бренд-менеджер",
    "task_type": "промо-ролик",
    "result_format": "вертикальное видео 15с",
    "usage_context": "Reels / Shorts / VK Клипы",
    "main_goal": "повысить узнаваемость линейки и собрать охваты",
    "promotion_object": "новая линейка напитков «Север»",
    "key_messages": ["натуральный состав", "локальное производство"],
    "message_hierarchy": {
        "primary": "натуральность",
        "secondary": ["локальность"],
        "background": ["забота о людях"],
    },
    "tone": "тёплый, уверенный",
    "anti_tone": "агрессивные распродажи",
    "must_have": ["логотип в финале", "продукт в руках человека"],
    "restrictions": ["без алкогольных ассоциаций"],
    "final_frame_or_cta": "Север. Ближе, чем кажется.",
    "deliverables": ["1 мастер 15с", "3 кропа под площадки"],
    "kpi": ["охват", "досмотры"],
    "detail_level": "средний",
}

FREEFORM_RAW_INPUT = (
    "Привет! Запускаем линейку «Север», хотим серию коротких вертикальных "
    "видео для соцсетей. Аудитория — 25–40, важно показать натуральность и "
    "что продукт локальный. Тон тёплый, без агрессивных распродаж. Бюджет "
    "обсуждаем, сроки — ближе к осени."
)

INPUT_SUMMARY = {
    "summary": (
        "Клиент запускает линейку «Север»: серия коротких вертикальных видео, "
        "акцент на натуральности и локальности, тёплый тон."
    ),
    "key_facts": ["линейка «Север»", "короткие вертикальные видео", "ЦА 25–40"],
    "explicit_requirements": ["показать продукт", "тёплый тон"],
    "constraints": ["без алкогольных ассоциаций"],
    "uncertain_fragments": ["бюджет не назван явно", "площадки не финализированы"],
}


def _field(key, value, *, status, source_type, confidence, comment=""):
    return {
        "key": key,
        "value": value,
        "source_type": source_type,
        "source_ref": "",
        "confidence": confidence,
        "status": status,
        "comment": comment,
    }


# Mixed statuses, intentionally NO critical_missing → generate-final is allowed.
STRUCTURED_BRIEF = {
    "fields": [
        _field("goal", "узнаваемость линейки + охваты", status="confirmed",
               source_type="client_brief", confidence=0.9),
        _field("audience", "горожане 25–40", status="confirmed_by_brand",
               source_type="brand_bible", confidence=0.95),
        _field("format", "вертикальное видео 15с", status="confirmed",
               source_type="client_brief", confidence=0.85),
        _field("tone", "тёплый, уверенный", status="confirmed_by_brand",
               source_type="brand_bible", confidence=0.9),
        _field("budget", "", status="optional_missing", source_type="inference",
               confidence=0.3, comment="бюджет не назван явно"),
        _field("timeline", "ближе к осени", status="needs_confirmation",
               source_type="client_brief", confidence=0.5,
               comment="сроки указаны примерно"),
    ]
}

CLARIFICATIONS = {
    "questions": [
        {"id": "q1", "field": "budget",
         "question": "Какой ориентировочный бюджет на продакшн?",
         "importance": "recommended", "options": []},
        {"id": "q2", "field": "timeline",
         "question": "К какой дате нужен финальный мастер?",
         "importance": "recommended", "options": []},
    ]
}

# Структура итогового брифа: review-бриф — стандартная, generated-бриф — из референса.
DEFAULT_TEMPLATE = default_template()  # source="default"

REFERENCE_TEMPLATE = {
    "name": "Структура из референса клиента",
    "source": "reference",
    "sections": [
        {"key": "goal", "title": "Цель кампании", "description": "", "selected": True,
         "fields": [{"key": "main_goal", "label": "Главная цель", "selected": True,
                     "required": True, "hint": ""}]},
        {"key": "audience", "title": "Аудитория", "description": "", "selected": True,
         "fields": [{"key": "target_audience", "label": "ЦА", "selected": True,
                     "required": True, "hint": ""}]},
        {"key": "format", "title": "Форматы и каналы", "description": "", "selected": True,
         "fields": [
             {"key": "format", "label": "Формат", "selected": True, "required": False, "hint": ""},
             {"key": "channels", "label": "Каналы", "selected": True, "required": False, "hint": ""},
         ]},
        {"key": "constraints", "title": "Ограничения", "description": "", "selected": False,
         "fields": [{"key": "restrictions", "label": "Ограничения", "selected": False,
                     "required": False, "hint": ""}]},
    ],
}

REFERENCE_TEMPLATE_TEXT = (
    "Структура нашего брифа:\n"
    "1. Цель кампании\n2. Аудитория\n3. Форматы и каналы\n4. Ограничения\n"
)

WIZARD_GENERATED_MD = (
    "# Бриф: промо-ролик «Север»\n\n"
    "## Цель\nПовысить узнаваемость линейки и собрать охваты.\n\n"
    "## Формат\nВертикальное видео 15с под Reels / Shorts / VK Клипы.\n\n"
    "## Ключевые сообщения\n- Натуральный состав\n- Локальное производство\n\n"
    "## Финал\nСевер. Ближе, чем кажется.\n"
)

FREEFORM_GENERATED_MD = (
    "# Бриф (brand-aware): «Север»\n\n"
    "## Контекст\nЗапуск линейки «Север», тёплый бренд-тон.\n\n"
    "## Что делаем\nСерия коротких вертикальных видео для соцсетей.\n\n"
    "## Аудитория\nГорожане 25–40, ценят локальное и натуральное.\n\n"
    "## Открытые вопросы\n- Бюджет уточняется\n- Сроки — ближе к осени\n"
)


def validate_blobs() -> None:
    """Fail fast if any demo blob no longer matches its schema."""
    BriefContext.model_validate(WIZARD_CONTEXT)
    InputSummary.model_validate(INPUT_SUMMARY)
    StructuredBrief.model_validate(STRUCTURED_BRIEF)
    Clarifications.model_validate(CLARIFICATIONS)
    BriefTemplate.model_validate(DEFAULT_TEMPLATE)
    BriefTemplate.model_validate(REFERENCE_TEMPLATE)


# --- seeding ---------------------------------------------------------------


def _get_or_create_brand(session: Session) -> Brand:
    brand = session.scalar(select(Brand).where(Brand.name == DEMO_BRAND_NAME))
    if brand is None:
        brand = Brand(name=DEMO_BRAND_NAME)
        session.add(brand)
    brand.description = "Демо-бренд для проверки brand-aware flow (dev-only)."
    brand.brand_context_json = BRAND_CONTEXT
    session.flush()

    has_source = session.scalar(
        select(func.count(BrandSource.id)).where(BrandSource.brand_id == brand.id)
    )
    if not has_source:
        session.add(BrandSource(brand_id=brand.id, **BRAND_SOURCE))
    return brand


def _get_or_create_brief(session: Session, title: str) -> Brief:
    brief = session.scalar(select(Brief).where(Brief.title == title))
    if brief is None:
        brief = Brief(title=title)
        session.add(brief)
        session.flush()
    return brief


def _ensure_single_version(
    session: Session,
    brief: Brief,
    markdown: str,
    snapshot: dict,
    gen_type: str,
    meta_extra: dict | None = None,
) -> None:
    """Keep exactly one BriefVersion (v1) so re-runs don't stack versions."""
    meta = {"model": "demo (no LLM)", "generation_type": gen_type, "source": "seed_demo"}
    if meta_extra:
        meta.update(meta_extra)
    if brief.versions:
        version = brief.versions[0]
        version.generated_markdown = markdown
        version.context_snapshot_json = snapshot
        version.generation_meta_json = meta
    else:
        session.add(
            BriefVersion(
                brief_id=brief.id,
                version_number=1,
                generated_markdown=markdown,
                context_snapshot_json=snapshot,
                generation_meta_json=meta,
            )
        )


def _seed_wizard(session: Session) -> None:
    draft = _get_or_create_brief(session, WIZARD_DRAFT_TITLE)
    draft.brief_type = "video"
    draft.status = "in_progress"
    draft.current_step = "preview"
    draft.context_json = WIZARD_CONTEXT

    gen = _get_or_create_brief(session, WIZARD_GENERATED_TITLE)
    gen.brief_type = "video"
    gen.status = "generated"
    gen.current_step = "preview"
    gen.context_json = WIZARD_CONTEXT
    gen.generated_markdown = WIZARD_GENERATED_MD
    gen.generated_from_context_hash = context_hash(WIZARD_CONTEXT)
    session.flush()
    _ensure_single_version(session, gen, WIZARD_GENERATED_MD, WIZARD_CONTEXT, "wizard")


def _seed_freeform(session: Session, brand: Brand) -> None:
    # На ревью: стандартная структура (source="default").
    review = _get_or_create_brief(session, FREEFORM_REVIEW_TITLE)
    review.brand_id = brand.id
    review.status = "in_progress"
    review.current_step = "review"
    review.raw_input_text = FREEFORM_RAW_INPUT
    review.input_summary_json = INPUT_SUMMARY
    review.is_input_summary_verified = True
    review.structured_brief_json = STRUCTURED_BRIEF
    review.clarifications_json = CLARIFICATIONS
    review.selected_template_json = DEFAULT_TEMPLATE

    # Готовый: структура из референса (source="reference") + текст референса.
    gen = _get_or_create_brief(session, FREEFORM_GENERATED_TITLE)
    gen.brand_id = brand.id
    gen.status = "generated"
    gen.current_step = "review"
    gen.raw_input_text = FREEFORM_RAW_INPUT
    gen.input_summary_json = INPUT_SUMMARY
    gen.is_input_summary_verified = True
    gen.structured_brief_json = STRUCTURED_BRIEF
    gen.clarifications_json = CLARIFICATIONS
    gen.selected_template_json = REFERENCE_TEMPLATE
    gen.reference_template_text = REFERENCE_TEMPLATE_TEXT
    gen.generated_markdown = FREEFORM_GENERATED_MD
    # hash от того же источника, что и is_generated_outdated (structured + template)
    gen.generated_from_context_hash = context_hash(gen.generated_hash_source())
    session.flush()
    _ensure_single_version(
        session,
        gen,
        FREEFORM_GENERATED_MD,
        {"structured": STRUCTURED_BRIEF, "template": REFERENCE_TEMPLATE},
        "brand_freeform",
        {"template_source": REFERENCE_TEMPLATE["source"]},
    )


def _demo_counts(session: Session) -> dict[str, int]:
    like = f"{DEMO_MARKER}%"
    return {
        "brands": session.scalar(
            select(func.count(Brand.id)).where(Brand.name == DEMO_BRAND_NAME)
        ),
        "briefs": session.scalar(
            select(func.count(Brief.id)).where(Brief.title.like(like))
        ),
        "versions": session.scalar(
            select(func.count(BriefVersion.id))
            .join(Brief, BriefVersion.brief_id == Brief.id)
            .where(Brief.title.like(like))
        ),
        "sources": session.scalar(
            select(func.count(BrandSource.id))
            .join(Brand, BrandSource.brand_id == Brand.id)
            .where(Brand.name == DEMO_BRAND_NAME)
        ),
    }


def reset_demo(session: Session) -> None:
    """Remove all demo-marked rows (children cascade via FKs / ORM)."""
    briefs = session.scalars(
        select(Brief).where(Brief.title.like(f"{DEMO_MARKER}%"))
    ).all()
    for brief in briefs:
        session.delete(brief)
    brands = session.scalars(
        select(Brand).where(Brand.name == DEMO_BRAND_NAME)
    ).all()
    for brand in brands:
        session.delete(brand)
    session.flush()


def seed(session: Session, *, reset: bool = False) -> dict[str, int]:
    """Create/update demo data on the given session. Returns demo entity counts."""
    validate_blobs()
    if reset:
        reset_demo(session)
    brand = _get_or_create_brand(session)
    _seed_wizard(session)
    _seed_freeform(session, brand)
    session.commit()
    return _demo_counts(session)


# --- CLI -------------------------------------------------------------------


def _check_dev_env(force: bool) -> None:
    env = (get_settings().app_env or "").lower()
    if force or env in _ALLOWED_ENVS:
        return
    print(
        f"Refusing to seed: APP_ENV={env!r} is not a dev environment "
        f"(allowed: {sorted(_ALLOWED_ENVS)}). Re-run with --force to override.",
        file=sys.stderr,
    )
    raise SystemExit(2)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed dev/demo data (dev-only).")
    parser.add_argument("--reset", action="store_true",
                        help="delete demo rows before recreating them")
    parser.add_argument("--dry-run", action="store_true",
                        help="validate demo blobs and exit without touching the DB")
    parser.add_argument("--force", action="store_true",
                        help="seed even if APP_ENV is not a dev environment")
    parser.add_argument("--database-url", default=None,
                        help="override DATABASE_URL for this run")
    args = parser.parse_args(argv)

    validate_blobs()
    if args.dry_run:
        print("[dry-run] demo blobs valid (incl. template). Would create/update:")
        print(f"  brand:  {DEMO_BRAND_NAME} (+1 brand_bible source)")
        print(f"  briefs: {WIZARD_DRAFT_TITLE}")
        print(f"          {WIZARD_GENERATED_TITLE} (pre-generated, +1 version)")
        print(f"          {FREEFORM_REVIEW_TITLE} (template: default)")
        print(f"          {FREEFORM_GENERATED_TITLE} (pre-generated, template: reference, +1 version)")
        return 0

    _check_dev_env(args.force)
    url = args.database_url or get_settings().database_url
    engine = create_engine(url, pool_pre_ping=True)
    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    try:
        with factory() as session:
            counts = seed(session, reset=args.reset)
    finally:
        engine.dispose()

    action = "reset+seeded" if args.reset else "seeded"
    print(f"Demo data {action}: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
