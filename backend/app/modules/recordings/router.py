import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.modules.recordings import service
from app.modules.recordings.schemas import (
    DailyStats,
    RecordingCreate,
    RecordingResponse,
    RecordingStats,
    RecordingUpdate,
)

router = APIRouter(prefix="/recordings", tags=["recordings"])


@router.get("/stats", response_model=DailyStats)
async def get_stats(db: AsyncSession = Depends(get_session)) -> DailyStats:
    return await service.get_daily_stats(db)


@router.get("/stats/all", response_model=RecordingStats)
async def get_all_stats(db: AsyncSession = Depends(get_session)) -> RecordingStats:
    return await service.get_recording_stats(db)


@router.get("/", response_model=list[RecordingResponse])
async def list_recordings(
    classification: str | None = Query(default=None),
    starred: bool | None = Query(default=None),
    trigger_clip_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
) -> list[RecordingResponse]:
    recordings = await service.list_recordings(
        db,
        classification=classification,
        starred=starred,
        trigger_clip_id=trigger_clip_id,
        skip=skip,
        limit=limit,
    )
    return [RecordingResponse.model_validate(r) for r in recordings]


@router.get("/{recording_id}", response_model=RecordingResponse)
async def get_recording(
    recording_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> RecordingResponse:
    recording = await service.get_recording(db, recording_id)
    return RecordingResponse.model_validate(recording)


@router.get("/{recording_id}/file")
async def get_recording_file(
    recording_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> FileResponse:
    """Serve the audio file for a recording."""
    recording = await service.get_recording(db, recording_id)
    file_path = Path(recording.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Recording file not found on disk")
    media_type = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".webm": "audio/webm",
        ".m4a": "audio/mp4",
    }.get(file_path.suffix.lower(), "application/octet-stream")
    return FileResponse(file_path, media_type=media_type)


@router.post("/", response_model=RecordingResponse, status_code=status.HTTP_201_CREATED)
async def upload_recording(
    file: UploadFile,
    classification: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    starred: bool = Form(default=False),
    trigger_clip_id: uuid.UUID | None = Form(default=None),
    db: AsyncSession = Depends(get_session),
) -> RecordingResponse:
    metadata = RecordingCreate(
        classification=classification,
        notes=notes,
        starred=starred,
        trigger_clip_id=trigger_clip_id,
    )
    recording = await service.upload_recording(db, file, metadata)
    return RecordingResponse.model_validate(recording)


@router.put("/{recording_id}", response_model=RecordingResponse)
async def update_recording(
    recording_id: uuid.UUID,
    data: RecordingUpdate,
    db: AsyncSession = Depends(get_session),
) -> RecordingResponse:
    recording = await service.update_recording(db, recording_id, data)
    return RecordingResponse.model_validate(recording)


@router.post("/{recording_id}/promote-to-clip", response_model=dict, status_code=status.HTTP_201_CREATED)
async def promote_to_clip(
    recording_id: uuid.UUID,
    name: str = Form(...),
    type: str = Form(default="sound"),
    category: str | None = Form(default=None),
    tags: str | None = Form(default=None),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Convert a recording into a reusable clip in the library."""
    tag_list: list[str] | None = (
        [t.strip() for t in tags.split(",") if t.strip()] if tags else None
    )
    clip = await service.promote_recording_to_clip(
        db, recording_id, name=name, type=type, category=category, tags=tag_list
    )
    return {"clip_id": str(clip.id), "message": f"Recording promoted to clip '{clip.name}'"}


@router.delete("/{recording_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recording(
    recording_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> None:
    await service.delete_recording(db, recording_id)
