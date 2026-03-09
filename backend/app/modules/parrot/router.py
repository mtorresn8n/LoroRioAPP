import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.modules.parrot import service
from app.modules.parrot.schemas import (
    AgeResponse,
    AvatarUploadResponse,
    ParrotCreate,
    ParrotResponse,
    ParrotUpdate,
)

router = APIRouter(prefix="/parrot", tags=["parrot"])


@router.get("/", response_model=ParrotResponse | None)
async def get_parrot(
    db: AsyncSession = Depends(get_session),
) -> ParrotResponse | None:
    parrot = await service.get_parrot(db)
    if parrot is None:
        return None
    return ParrotResponse.model_validate(parrot)


@router.post("/", response_model=ParrotResponse, status_code=status.HTTP_201_CREATED)
async def create_parrot(
    data: ParrotCreate,
    db: AsyncSession = Depends(get_session),
) -> ParrotResponse:
    parrot = await service.create_parrot(db, data)
    return ParrotResponse.model_validate(parrot)


@router.put("/{parrot_id}", response_model=ParrotResponse)
async def update_parrot(
    parrot_id: uuid.UUID,
    data: ParrotUpdate,
    db: AsyncSession = Depends(get_session),
) -> ParrotResponse:
    parrot = await service.update_parrot(db, parrot_id, data)
    return ParrotResponse.model_validate(parrot)


@router.post("/{parrot_id}/avatar", response_model=AvatarUploadResponse)
async def upload_avatar(
    parrot_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_session),
) -> AvatarUploadResponse:
    avatar_path, avatar_url = await service.upload_avatar(db, parrot_id, file)
    return AvatarUploadResponse(avatar_path=avatar_path, avatar_url=avatar_url)


@router.get("/{parrot_id}/age", response_model=AgeResponse)
async def get_parrot_age(
    parrot_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> AgeResponse:
    parrot = await service.get_parrot_by_id(db, parrot_id)
    if parrot.birth_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Parrot does not have a birth date set.",
        )
    return service.calculate_age(parrot.birth_date)
