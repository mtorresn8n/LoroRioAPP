import os
import shutil
import uuid
from datetime import datetime

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.recordings.models import Recording
from app.modules.recordings.schemas import (
    RecordingCreate,
    RecordingStats,
    RecordingUpdate,
)
from app.shared import audio_utils, storage


async def list_recordings(
    db: AsyncSession,
    classification: str | None = None,
    starred: bool | None = None,
    trigger_clip_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[Recording]:
    stmt = select(Recording)
    if classification:
        stmt = stmt.where(Recording.classification == classification)
    if starred is not None:
        stmt = stmt.where(Recording.starred == starred)
    if trigger_clip_id:
        stmt = stmt.where(Recording.trigger_clip_id == trigger_clip_id)
    stmt = stmt.order_by(Recording.recorded_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_recording(db: AsyncSession, recording_id: uuid.UUID) -> Recording:
    result = await db.execute(
        select(Recording).where(Recording.id == recording_id)
    )
    recording = result.scalar_one_or_none()
    if recording is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recording {recording_id} not found",
        )
    return recording


async def upload_recording(
    db: AsyncSession, file: UploadFile, metadata: RecordingCreate
) -> Recording:
    original_name = file.filename or "recording"
    suffix = ".wav" if original_name.endswith(".wav") else ".mp3"
    unique_filename = f"{uuid.uuid4()}{suffix}"

    file_path = await storage.save_recording(file, unique_filename)
    duration = await audio_utils.get_audio_duration_async(file_path)
    peak_volume = await audio_utils.get_peak_volume_async(file_path)

    recording = Recording(
        file_path=file_path,
        duration=duration,
        peak_volume=peak_volume,
        classification=metadata.classification,
        trigger_clip_id=metadata.trigger_clip_id,
        notes=metadata.notes,
        starred=metadata.starred,
    )
    db.add(recording)
    await db.flush()
    await db.refresh(recording)
    return recording


async def update_recording(
    db: AsyncSession, recording_id: uuid.UUID, data: RecordingUpdate
) -> Recording:
    recording = await get_recording(db, recording_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(recording, field, value)
    await db.flush()
    await db.refresh(recording)
    return recording


async def delete_recording(db: AsyncSession, recording_id: uuid.UUID) -> None:
    recording = await get_recording(db, recording_id)
    storage.delete_file(recording.file_path)
    await db.delete(recording)
    await db.flush()


async def promote_recording_to_clip(
    db: AsyncSession,
    recording_id: uuid.UUID,
    name: str,
    type: str = "sound",
    category: str | None = None,
    tags: list[str] | None = None,
) -> "Clip":
    """Copy a recording file into the clips library and create a Clip entry."""
    from app.modules.clips.models import Clip

    recording = await get_recording(db, recording_id)

    # Copy file from recordings/ to clips/
    src_path = recording.file_path
    suffix = os.path.splitext(src_path)[1] or ".wav"
    clip_filename = f"{uuid.uuid4()}{suffix}"
    clip_path = storage.get_clips_dir() / clip_filename
    shutil.copy2(src_path, str(clip_path))

    clip = Clip(
        name=name,
        file_path=str(clip_path),
        duration=recording.duration,
        type=type,
        category=category,
        tags=tags,
        difficulty=1,
        default_volume=1.0,
        source="recording",
    )
    db.add(clip)
    await db.flush()
    await db.refresh(clip)
    return clip


async def get_recording_stats(db: AsyncSession) -> RecordingStats:
    total_result = await db.execute(select(func.count()).select_from(Recording))
    total = total_result.scalar_one()

    starred_result = await db.execute(
        select(func.count()).select_from(Recording).where(Recording.starred == True)  # noqa: E712
    )
    starred_count = starred_result.scalar_one()

    avg_result = await db.execute(select(func.avg(Recording.duration)).select_from(Recording))
    avg_duration: float | None = avg_result.scalar_one()

    sum_result = await db.execute(select(func.sum(Recording.duration)).select_from(Recording))
    total_duration: float | None = sum_result.scalar_one()

    class_result = await db.execute(
        select(Recording.classification, func.count().label("cnt"))
        .select_from(Recording)
        .group_by(Recording.classification)
    )
    by_classification: dict[str, int] = {
        (row.classification or "unclassified"): row.cnt
        for row in class_result.all()
    }

    import math

    def safe_float(val: float | None) -> float | None:
        if val is None:
            return None
        f = float(val)
        return f if math.isfinite(f) else None

    return RecordingStats(
        total=total,
        by_classification=by_classification,
        starred_count=starred_count,
        avg_duration=safe_float(avg_duration),
        total_duration=safe_float(total_duration),
    )
