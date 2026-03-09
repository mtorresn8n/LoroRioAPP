import os
import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.clips.models import Clip
from app.modules.clips.schemas import ClipCreate, ClipUpdate
from app.shared import audio_utils, storage

ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"}


def _validate_audio_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported audio format: {suffix}",
        )
    return suffix


async def list_clips(
    db: AsyncSession,
    type_filter: str | None = None,
    category: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[Clip]:
    stmt = select(Clip)
    if type_filter:
        stmt = stmt.where(Clip.type == type_filter)
    if category:
        stmt = stmt.where(Clip.category == category)
    if search:
        stmt = stmt.where(
            or_(
                Clip.name.ilike(f"%{search}%"),
                Clip.category.ilike(f"%{search}%"),
            )
        )
    stmt = stmt.order_by(Clip.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_clip(db: AsyncSession, clip_id: uuid.UUID) -> Clip:
    result = await db.execute(select(Clip).where(Clip.id == clip_id))
    clip = result.scalar_one_or_none()
    if clip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Clip {clip_id} not found",
        )
    return clip


async def create_clip(
    db: AsyncSession, file: UploadFile, metadata: ClipCreate
) -> Clip:
    original_name = file.filename or "clip"
    suffix = _validate_audio_extension(original_name)
    unique_filename = f"{uuid.uuid4()}{suffix}"

    file_path = await storage.save_clip(file, unique_filename)
    duration = await audio_utils.get_audio_duration_async(file_path)

    clip = Clip(
        name=metadata.name,
        file_path=file_path,
        duration=duration,
        type=metadata.type,
        category=metadata.category,
        tags=metadata.tags,
        difficulty=metadata.difficulty,
        default_volume=metadata.default_volume,
        source=metadata.source,
        youtube_url=metadata.youtube_url,
    )
    db.add(clip)
    await db.flush()
    await db.refresh(clip)
    return clip


async def update_clip(
    db: AsyncSession, clip_id: uuid.UUID, data: ClipUpdate
) -> Clip:
    clip = await get_clip(db, clip_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(clip, field, value)
    await db.flush()
    await db.refresh(clip)
    return clip


async def delete_clip(db: AsyncSession, clip_id: uuid.UUID) -> None:
    clip = await get_clip(db, clip_id)
    storage.delete_file(clip.file_path)
    await db.delete(clip)
    await db.flush()


async def duplicate_clip(db: AsyncSession, clip_id: uuid.UUID) -> Clip:
    original = await get_clip(db, clip_id)
    src_path = Path(original.file_path)
    suffix = src_path.suffix
    new_filename = f"{uuid.uuid4()}{suffix}"
    new_path = os.path.join(src_path.parent, new_filename)
    shutil.copy2(str(src_path), new_path)

    new_clip = Clip(
        name=f"{original.name} (copy)",
        file_path=new_path,
        duration=original.duration,
        type=original.type,
        category=original.category,
        tags=list(original.tags) if original.tags else None,
        difficulty=original.difficulty,
        default_volume=original.default_volume,
        source=original.source,
        youtube_url=original.youtube_url,
    )
    db.add(new_clip)
    await db.flush()
    await db.refresh(new_clip)
    return new_clip
