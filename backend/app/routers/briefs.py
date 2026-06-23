import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Brief, BriefVersion, default_context
from app.schemas import (
    BriefAnalysis,
    BriefContextUpdate,
    BriefCreate,
    BriefListItem,
    BriefRead,
    BriefUpdate,
    BriefVersionRead,
    SectionRegenerateRequest,
    SectionRegenerateResponse,
)
from app.services import brief_ai_service
from app.services.docx_export import build_docx
from app.utils import context_hash

router = APIRouter(prefix="/api/briefs", tags=["briefs"])


def _get_brief_or_404(brief_id: int, db: Session) -> Brief:
    brief = db.get(Brief, brief_id)
    if brief is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Бриф не найден"
        )
    return brief


def _deep_merge(base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    """Аккуратно мержит updates в base: вложенные словари сливаются,
    скаляры и списки заменяются целиком."""
    result = dict(base)
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


@router.post("", response_model=BriefRead, status_code=status.HTTP_201_CREATED)
def create_brief(payload: BriefCreate, db: Session = Depends(get_db)) -> Brief:
    """Создать новый бриф (черновик)."""
    brief = Brief(
        title=payload.title,
        brief_type=payload.brief_type.value,
        status="draft",
        current_step="brief_type",
        context_json=default_context(),
    )
    db.add(brief)
    db.commit()
    db.refresh(brief)
    return brief


@router.get("", response_model=list[BriefListItem])
def list_briefs(db: Session = Depends(get_db)) -> list[Brief]:
    """Список брифов (свежие — сверху)."""
    stmt = select(Brief).order_by(Brief.updated_at.desc())
    return list(db.scalars(stmt).all())


@router.get("/{brief_id}", response_model=BriefRead)
def get_brief(brief_id: int, db: Session = Depends(get_db)) -> Brief:
    """Получить один бриф."""
    return _get_brief_or_404(brief_id, db)


@router.patch("/{brief_id}", response_model=BriefRead)
def update_brief(
    brief_id: int, payload: BriefUpdate, db: Session = Depends(get_db)
) -> Brief:
    """Обновить мета-поля: title, status, brief_type, current_step."""
    brief = _get_brief_or_404(brief_id, db)
    # mode="json" приводит enum-поля к их строковым значениям
    data = payload.model_dump(exclude_unset=True, mode="json")
    for field, value in data.items():
        setattr(brief, field, value)
    db.commit()
    db.refresh(brief)
    return brief


@router.patch("/{brief_id}/context", response_model=BriefRead)
def update_brief_context(
    brief_id: int, payload: BriefContextUpdate, db: Session = Depends(get_db)
) -> Brief:
    """Частично обновить context_json — присланные поля мержатся с текущими."""
    brief = _get_brief_or_404(brief_id, db)
    updates = payload.model_dump(exclude_unset=True, mode="json")
    base = brief.context_json or default_context()
    brief.context_json = _deep_merge(base, updates)
    db.commit()
    db.refresh(brief)
    return brief


@router.delete("/{brief_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brief(brief_id: int, db: Session = Depends(get_db)) -> None:
    """Удалить бриф."""
    brief = _get_brief_or_404(brief_id, db)
    db.delete(brief)
    db.commit()


@router.post("/{brief_id}/analyze", response_model=BriefAnalysis)
def analyze_brief(brief_id: int, db: Session = Depends(get_db)) -> dict:
    """AI-анализ брифа. Результат не сохраняется в БД."""
    brief = _get_brief_or_404(brief_id, db)
    return brief_ai_service.analyze_brief(brief)


@router.post("/{brief_id}/generate", response_model=BriefRead)
def generate_brief(brief_id: int, db: Session = Depends(get_db)) -> Brief:
    """Сгенерировать markdown-бриф: сохранить его, создать BriefVersion, обновить hash."""
    brief = _get_brief_or_404(brief_id, db)
    markdown = brief_ai_service.generate_brief(brief)

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
            context_snapshot_json=brief.context_json,
            generation_meta_json={
                "model": get_settings().llm_model,
                "generation_type": "full",
                "source": "generate_endpoint",
            },
        )
    )
    brief.generated_markdown = markdown
    brief.status = "generated"
    brief.generated_from_context_hash = context_hash(brief.context_json or {})
    db.commit()
    db.refresh(brief)
    return brief


@router.post("/{brief_id}/regenerate-section", response_model=SectionRegenerateResponse)
def regenerate_section(
    brief_id: int, payload: SectionRegenerateRequest, db: Session = Depends(get_db)
) -> dict:
    """Переписать один раздел markdown-брифа. Документ в БД не патчится."""
    brief = _get_brief_or_404(brief_id, db)
    if not brief.generated_markdown:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сначала сгенерируйте бриф: раздел можно переписать только в готовом документе",
        )
    content = brief_ai_service.regenerate_section(
        brief, payload.section, payload.instruction
    )
    return {"section": payload.section, "content": content}


@router.get("/{brief_id}/export/markdown")
def export_markdown(brief_id: int, db: Session = Depends(get_db)) -> Response:
    """Скачать сгенерированный бриф как .md файл."""
    brief = _get_brief_or_404(brief_id, db)
    if not brief.generated_markdown:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Бриф ещё не сгенерирован — нечего экспортировать",
        )
    return Response(
        content=brief.generated_markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="brief-{brief.id}.md"'},
    )


@router.get("/{brief_id}/export/json")
def export_json(brief_id: int, db: Session = Depends(get_db)) -> Response:
    """Скачать полное состояние брифа как .json файл."""
    brief = _get_brief_or_404(brief_id, db)
    payload = {
        "id": brief.id,
        "title": brief.title,
        "status": brief.status,
        "brief_type": brief.brief_type,
        "current_step": brief.current_step,
        "context_json": brief.context_json,
        "generated_markdown": brief.generated_markdown,
        "created_at": brief.created_at.isoformat(),
        "updated_at": brief.updated_at.isoformat(),
    }
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="brief-{brief.id}.json"'},
    )


@router.get("/{brief_id}/export/docx")
def export_docx(brief_id: int, db: Session = Depends(get_db)) -> Response:
    """Скачать сгенерированный бриф как .docx файл (wizard и freeform одинаково)."""
    brief = _get_brief_or_404(brief_id, db)
    if not brief.generated_markdown:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Бриф ещё не сгенерирован — нечего экспортировать",
        )
    content = build_docx(brief.generated_markdown, title=brief.title)
    return Response(
        content=content,
        media_type=(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ),
        headers={"Content-Disposition": f'attachment; filename="brief-{brief.id}.docx"'},
    )


@router.get("/{brief_id}/versions", response_model=list[BriefVersionRead])
def list_brief_versions(
    brief_id: int, db: Session = Depends(get_db)
) -> list[BriefVersion]:
    """Список версий генераций брифа (новые — сверху)."""
    _get_brief_or_404(brief_id, db)
    stmt = (
        select(BriefVersion)
        .where(BriefVersion.brief_id == brief_id)
        .order_by(BriefVersion.version_number.desc())
    )
    return list(db.scalars(stmt).all())


@router.get("/{brief_id}/versions/{version_id}", response_model=BriefVersionRead)
def get_brief_version(
    brief_id: int, version_id: int, db: Session = Depends(get_db)
) -> BriefVersion:
    """Одна версия генерации брифа."""
    _get_brief_or_404(brief_id, db)
    version = db.scalar(
        select(BriefVersion).where(
            BriefVersion.id == version_id, BriefVersion.brief_id == brief_id
        )
    )
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена"
        )
    return version
