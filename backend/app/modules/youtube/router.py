import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.modules.clips.models import Clip
from app.modules.clips.schemas import ClipResponse
from app.modules.youtube import service
from app.modules.youtube.schemas import (
    YouTubeExtractRequest,
    YouTubeInfoRequest,
    YouTubeInfoResponse,
)

router = APIRouter(prefix="/youtube", tags=["youtube"])


@router.post("/info", response_model=YouTubeInfoResponse)
async def get_video_info(request: YouTubeInfoRequest) -> YouTubeInfoResponse:
    return await service.get_video_info(request.url)


@router.post(
    "/extract",
    response_model=ClipResponse,
    status_code=status.HTTP_201_CREATED,
)
async def extract_audio(
    request: YouTubeExtractRequest,
    db: AsyncSession = Depends(get_session),
) -> ClipResponse:
    clip_data = await service.extract_audio_clip(request)

    # Convert id from str to UUID before ORM construction
    clip_data["id"] = uuid.UUID(clip_data["id"])

    clip = Clip(**clip_data)
    db.add(clip)
    await db.flush()
    await db.refresh(clip)
    return ClipResponse.model_validate(clip)
