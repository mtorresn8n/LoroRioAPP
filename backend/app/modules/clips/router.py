import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Form, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.modules.clips import service
from app.modules.clips.schemas import ClipCreate, ClipResponse, ClipUpdate

router = APIRouter(prefix="/clips", tags=["clips"])


@router.get("/", response_model=list[ClipResponse])
async def list_clips(
    type: str | None = Query(default=None),
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
) -> list[ClipResponse]:
    clips = await service.list_clips(
        db, type_filter=type, category=category, search=search, skip=skip, limit=limit
    )
    return [ClipResponse.model_validate(c) for c in clips]


@router.get("/{clip_id}", response_model=ClipResponse)
async def get_clip(
    clip_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> ClipResponse:
    clip = await service.get_clip(db, clip_id)
    return ClipResponse.model_validate(clip)


@router.get("/{clip_id}/file")
async def get_clip_file(
    clip_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> FileResponse:
    """Serve the audio file for a clip."""
    clip = await service.get_clip(db, clip_id)
    file_path = Path(clip.file_path)
    if not file_path.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Clip file not found on disk")
    media_type = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".aac": "audio/aac",
        ".m4a": "audio/mp4",
        ".webm": "audio/webm",
    }.get(file_path.suffix.lower(), "application/octet-stream")
    return FileResponse(file_path, media_type=media_type)


@router.post("/", response_model=ClipResponse, status_code=status.HTTP_201_CREATED)
async def create_clip(
    file: UploadFile,
    name: str = Form(...),
    type: str = Form(default="sound"),
    category: str | None = Form(default=None),
    tags: str | None = Form(default=None),  # comma-separated
    difficulty: int = Form(default=1),
    default_volume: float = Form(default=1.0),
    source: str = Form(default="upload"),
    youtube_url: str | None = Form(default=None),
    db: AsyncSession = Depends(get_session),
) -> ClipResponse:
    tag_list: list[str] | None = (
        [t.strip() for t in tags.split(",") if t.strip()] if tags else None
    )
    metadata = ClipCreate(
        name=name,
        type=type,
        category=category,
        tags=tag_list,
        difficulty=difficulty,
        default_volume=default_volume,
        source=source,
        youtube_url=youtube_url,
    )
    clip = await service.create_clip(db, file, metadata)
    return ClipResponse.model_validate(clip)


@router.put("/{clip_id}", response_model=ClipResponse)
async def update_clip(
    clip_id: uuid.UUID,
    data: ClipUpdate,
    db: AsyncSession = Depends(get_session),
) -> ClipResponse:
    clip = await service.update_clip(db, clip_id, data)
    return ClipResponse.model_validate(clip)


@router.delete("/{clip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_clip(
    clip_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> None:
    await service.delete_clip(db, clip_id)


@router.post("/{clip_id}/duplicate", response_model=ClipResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_clip(
    clip_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> ClipResponse:
    clip = await service.duplicate_clip(db, clip_id)
    return ClipResponse.model_validate(clip)
