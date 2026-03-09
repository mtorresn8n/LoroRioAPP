import logging
import os
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.parrot.models import Parrot
from app.modules.parrot.schemas import AgeResponse, ParrotCreate, ParrotUpdate

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _validate_image_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported image format: {suffix}. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}",
        )
    return suffix


def calculate_age(birth_date: date) -> AgeResponse:
    """Calculate the parrot's age in years, months, and days from birth_date."""
    today = datetime.now(timezone.utc).date()
    total_days = (today - birth_date).days

    years = today.year - birth_date.year
    months = today.month - birth_date.month
    days = today.day - birth_date.day

    if days < 0:
        months -= 1
        # Get the last day of the previous month
        prev_month_year = today.year if today.month > 1 else today.year - 1
        prev_month = today.month - 1 if today.month > 1 else 12
        last_day_prev = date(prev_month_year, prev_month, 1).replace(
            day=_days_in_month(prev_month_year, prev_month)
        )
        days += (last_day_prev - date(last_day_prev.year, last_day_prev.month, 1)).days + 1

    if months < 0:
        years -= 1
        months += 12

    return AgeResponse(
        years=years,
        months=months,
        days=days,
        total_days=total_days,
        birth_date=birth_date,
    )


def _days_in_month(year: int, month: int) -> int:
    """Return the number of days in a given month."""
    import calendar
    return calendar.monthrange(year, month)[1]


async def get_parrot(db: AsyncSession) -> Parrot | None:
    """Get the single parrot profile (returns None if not created yet)."""
    result = await db.execute(select(Parrot).limit(1))
    return result.scalar_one_or_none()


async def get_parrot_by_id(db: AsyncSession, parrot_id: uuid.UUID) -> Parrot:
    result = await db.execute(select(Parrot).where(Parrot.id == parrot_id))
    parrot = result.scalar_one_or_none()
    if parrot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parrot {parrot_id} not found",
        )
    return parrot


async def create_parrot(db: AsyncSession, data: ParrotCreate) -> Parrot:
    """Create the parrot profile. Only one profile is expected."""
    existing = await get_parrot(db)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A parrot profile already exists. Use PUT to update it.",
        )

    parrot = Parrot(
        name=data.name,
        species=data.species,
        birth_date=data.birth_date,
        adoption_date=data.adoption_date,
        weight_grams=data.weight_grams,
        sex=data.sex,
        notes=data.notes,
        avatar_path=data.avatar_path,
    )
    db.add(parrot)
    await db.flush()
    await db.refresh(parrot)
    return parrot


async def update_parrot(
    db: AsyncSession, parrot_id: uuid.UUID, data: ParrotUpdate
) -> Parrot:
    parrot = await get_parrot_by_id(db, parrot_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(parrot, field, value)
    parrot.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(parrot)
    return parrot


async def upload_avatar(
    db: AsyncSession, parrot_id: uuid.UUID, file: UploadFile
) -> tuple[str, str]:
    """Save the avatar image and update the parrot record.

    Returns a tuple of (absolute_path, media_url).
    """
    parrot = await get_parrot_by_id(db, parrot_id)

    original_name = file.filename or "avatar"
    suffix = _validate_image_extension(original_name)
    filename = f"{uuid.uuid4()}{suffix}"

    parrot_dir = os.path.join(settings.MEDIA_PATH, "parrot")
    Path(parrot_dir).mkdir(parents=True, exist_ok=True)
    dest = os.path.join(parrot_dir, filename)

    async with aiofiles.open(dest, "wb") as f:
        content = await file.read()
        await f.write(content)

    # Delete old avatar if one exists
    if parrot.avatar_path and os.path.exists(parrot.avatar_path):
        try:
            os.remove(parrot.avatar_path)
        except OSError:
            logger.warning("Could not delete old avatar: %s", parrot.avatar_path)

    parrot.avatar_path = dest
    parrot.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(parrot)

    media_path = settings.MEDIA_PATH.rstrip("/")
    relative = dest.replace(media_path, "").lstrip("/")
    avatar_url = f"/media/{relative}"

    return dest, avatar_url
