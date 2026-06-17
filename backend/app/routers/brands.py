from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Brand
from app.schemas_brand import BrandCreate, BrandListItem, BrandRead, BrandUpdate

router = APIRouter(prefix="/api/brands", tags=["brands"])


def _get_brand_or_404(brand_id: int, db: Session) -> Brand:
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Бренд не найден"
        )
    return brand


@router.post("", response_model=BrandRead, status_code=status.HTTP_201_CREATED)
def create_brand(payload: BrandCreate, db: Session = Depends(get_db)) -> Brand:
    """Создать новый бренд."""
    brand = Brand(
        name=payload.name,
        description=payload.description,
        brand_context_json=payload.brand_context_json,
    )
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return brand


@router.get("", response_model=list[BrandListItem])
def list_brands(db: Session = Depends(get_db)) -> list[Brand]:
    """Список брендов (свежие — сверху)."""
    stmt = select(Brand).order_by(Brand.updated_at.desc())
    return list(db.scalars(stmt).all())


@router.get("/{brand_id}", response_model=BrandRead)
def get_brand(brand_id: int, db: Session = Depends(get_db)) -> Brand:
    """Получить один бренд."""
    return _get_brand_or_404(brand_id, db)


@router.patch("/{brand_id}", response_model=BrandRead)
def update_brand(
    brand_id: int, payload: BrandUpdate, db: Session = Depends(get_db)
) -> Brand:
    """Обновить бренд (name, description, brand_context_json)."""
    brand = _get_brand_or_404(brand_id, db)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(brand, field, value)
    db.commit()
    db.refresh(brand)
    return brand


@router.delete("/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brand(brand_id: int, db: Session = Depends(get_db)) -> None:
    """Удалить бренд. У связанных брифов brand_id обнуляется (ON DELETE SET NULL)."""
    brand = _get_brand_or_404(brand_id, db)
    db.delete(brand)
    db.commit()
