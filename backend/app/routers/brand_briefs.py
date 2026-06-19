"""Brand-aware freeform briefing flow.

Endpoints under the /api/briefs prefix; the existing routers/briefs.py is not modified.
Reuses BriefVersion / context_hash for generate-final.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Brand, Brief, BriefVersion, default_context
from app.schemas import BriefRead
from app.schemas_brand import (
    ApplyClarificationsRequest,
    BriefTemplate,
    DecomposeTemplateRequest,
    FieldStatus,
    FreeformBriefCreate,
    FreeformInputRequest,
    SelectTemplateRequest,
    StructuredBrief,
)
from app.services import brand_brief_service
from app.utils import context_hash

router = APIRouter(prefix="/api/briefs", tags=["brand-briefs"])

# статусы, при которых критичное поле считается неподтверждённым
_BLOCKING = {FieldStatus.critical_missing, FieldStatus.conflict}


def _get_brief_or_404(brief_id: int, db: Session) -> Brief:
    brief = db.get(Brief, brief_id)
    if brief is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Бриф не найден"
        )
    return brief


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


@router.post("/freeform", response_model=BriefRead, status_code=status.HTTP_201_CREATED)
def create_freeform_brief(
    payload: FreeformBriefCreate, db: Session = Depends(get_db)
) -> Brief:
    """Создать бриф, привязанный к бренду (старт freeform-флоу)."""
    if db.get(Brand, payload.brand_id) is None:
        raise HTTPException(status_code=404, detail="Бренд не найден")
    brief = Brief(
        title=payload.title,
        brand_id=payload.brand_id,
        status="draft",
        current_step="freeform",
        context_json=default_context(),
    )
    db.add(brief)
    db.commit()
    db.refresh(brief)
    return brief


# --- output template (структура итогового брифа) ---
# Статические /template/* объявлены до параметрических /{brief_id}/* маршрутов.


@router.get("/template/default", response_model=BriefTemplate)
def get_default_template() -> dict:
    """Дефолтная структура итогового брифа (без LLM)."""
    return brand_brief_service.get_default_brief_template()


@router.post("/template/decompose", response_model=BriefTemplate)
def decompose_template(
    payload: DecomposeTemplateRequest, db: Session = Depends(get_db)
) -> dict:
    """AI-декомпозиция референс-текста в структуру итогового брифа (stateless)."""
    brand_ctx = None
    if payload.brand_id is not None:
        brand = db.get(Brand, payload.brand_id)
        if brand is None:
            raise HTTPException(status_code=404, detail="Бренд не найден")
        brand_ctx = brand.brand_context_json
    return brand_brief_service.decompose_reference_template(
        payload.reference_text, brand_ctx
    )


@router.post("/{brief_id}/select-template", response_model=BriefRead)
def select_template(
    brief_id: int, payload: SelectTemplateRequest, db: Session = Depends(get_db)
) -> Brief:
    """Сохранить выбранную структуру итогового брифа в бриф."""
    brief = _get_brief_or_404(brief_id, db)
    # template уже провалидирован Pydantic при разборе тела запроса
    brief.selected_template_json = payload.template.model_dump(mode="json")
    if payload.reference_text is not None:
        brief.reference_template_text = payload.reference_text
    db.commit()
    db.refresh(brief)
    return brief


@router.post("/{brief_id}/freeform-input", response_model=BriefRead)
def set_freeform_input(
    brief_id: int, payload: FreeformInputRequest, db: Session = Depends(get_db)
) -> Brief:
    """Сохранить свободный клиентский бриф (текст)."""
    brief = _get_brief_or_404(brief_id, db)
    brief.raw_input_text = payload.raw_input_text
    # ввод изменился — прежнее summary больше не считается подтверждённым
    brief.is_input_summary_verified = False
    db.commit()
    db.refresh(brief)
    return brief


@router.post("/{brief_id}/summarize-input", response_model=BriefRead)
def summarize_input(brief_id: int, db: Session = Depends(get_db)) -> Brief:
    """AI-summary свободного ввода (требует raw_input_text)."""
    brief = _get_brief_or_404(brief_id, db)
    if not (brief.raw_input_text or "").strip():
        raise _conflict("Сначала добавьте свободный ввод (freeform-input)")
    brief.input_summary_json = brand_brief_service.summarize_input(brief)
    brief.is_input_summary_verified = False
    db.commit()
    db.refresh(brief)
    return brief


@router.post("/{brief_id}/verify-input-summary", response_model=BriefRead)
def verify_input_summary(brief_id: int, db: Session = Depends(get_db)) -> Brief:
    """Подтвердить summary пользователем."""
    brief = _get_brief_or_404(brief_id, db)
    if brief.input_summary_json is None:
        raise _conflict("Нет summary для подтверждения (сначала summarize-input)")
    brief.is_input_summary_verified = True
    db.commit()
    db.refresh(brief)
    return brief


@router.post("/{brief_id}/structure", response_model=BriefRead)
def structure_brief(brief_id: int, db: Session = Depends(get_db)) -> Brief:
    """AI-структурирование брифа с evidence (требует подтверждённое summary)."""
    brief = _get_brief_or_404(brief_id, db)
    if not brief.is_input_summary_verified:
        raise _conflict("Сначала подтвердите summary (verify-input-summary)")
    brief.structured_brief_json = brand_brief_service.structure_brief(brief)
    db.commit()
    db.refresh(brief)
    return brief


@router.post("/{brief_id}/clarifications", response_model=BriefRead)
def generate_clarifications(brief_id: int, db: Session = Depends(get_db)) -> Brief:
    """Сгенерировать уточняющие вопросы (требует structured_brief_json)."""
    brief = _get_brief_or_404(brief_id, db)
    if brief.structured_brief_json is None:
        raise _conflict("Сначала структурируйте бриф (structure)")
    brief.clarifications_json = brand_brief_service.generate_clarifications(brief)
    db.commit()
    db.refresh(brief)
    return brief


@router.post("/{brief_id}/apply-clarifications", response_model=BriefRead)
def apply_clarifications(
    brief_id: int, payload: ApplyClarificationsRequest, db: Session = Depends(get_db)
) -> Brief:
    """Применить ответы пользователя к structured_brief_json."""
    brief = _get_brief_or_404(brief_id, db)
    if brief.structured_brief_json is None:
        raise _conflict("Нет структурированного брифа (сначала structure)")
    answers = [a.model_dump() for a in payload.answers]
    brief.structured_brief_json = brand_brief_service.apply_clarification_answers(
        brief, answers
    )
    db.commit()
    db.refresh(brief)
    return brief


@router.post("/{brief_id}/generate-final", response_model=BriefRead)
def generate_final(brief_id: int, db: Session = Depends(get_db)) -> Brief:
    """Сгенерировать финальный markdown-бриф (требует подтверждённые критичные поля).

    Переиспользует механизм BriefVersion + context_hash/outdated.
    """
    brief = _get_brief_or_404(brief_id, db)
    if brief.structured_brief_json is None:
        raise _conflict("Нет структурированного брифа (сначала structure)")

    structured = StructuredBrief.model_validate(brief.structured_brief_json)
    blocking = [f.key for f in structured.fields if f.status in _BLOCKING]
    if blocking:
        raise _conflict(
            "Не подтверждены критичные поля: " + ", ".join(blocking)
        )

    markdown = brand_brief_service.generate_final_brief(brief)

    # Snapshot: с шаблоном — {structured, template}; без него — прежний формат
    # (только structured_brief_json), чтобы не сломать старые версии/ожидания.
    template = brief.selected_template_json
    snapshot = (
        {"structured": brief.structured_brief_json, "template": template}
        if template is not None
        else brief.structured_brief_json
    )
    meta: dict = {
        "model": get_settings().llm_model,
        "generation_type": "brand_freeform",
        "source": "generate_final_endpoint",
    }
    if template is not None:
        meta["template_source"] = template.get("source")

    max_version = db.scalar(
        select(func.max(BriefVersion.version_number)).where(
            BriefVersion.brief_id == brief.id
        )
    )
    db.add(
        BriefVersion(
            brief_id=brief.id,
            version_number=(max_version or 0) + 1,
            generated_markdown=markdown,
            context_snapshot_json=snapshot,
            generation_meta_json=meta,
        )
    )
    brief.generated_markdown = markdown
    brief.status = "generated"
    # hash от того же источника, что и is_generated_outdated (structured [+ template])
    brief.generated_from_context_hash = context_hash(brief.generated_hash_source())
    db.commit()
    db.refresh(brief)
    return brief
