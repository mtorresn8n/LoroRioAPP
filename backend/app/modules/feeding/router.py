import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.modules.feeding import service
from app.modules.feeding.schemas import (
    FeedingLogCreate,
    FeedingLogResponse,
    FeedingPlanResponse,
    FeedingSummaryResponse,
    FoodItemCreate,
    FoodItemResponse,
    FoodItemUpdate,
    SuggestPlanRequest,
)

router = APIRouter(prefix="/feeding", tags=["feeding"])


# ---------------------------------------------------------------------------
# Food catalog
# ---------------------------------------------------------------------------

@router.get("/foods", response_model=list[FoodItemResponse])
async def list_foods(
    category: str | None = Query(default=None),
    is_safe: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_session),
) -> list[FoodItemResponse]:
    foods = await service.list_food_items(
        db, category=category, is_safe=is_safe, search=search, skip=skip, limit=limit
    )
    return [FoodItemResponse.model_validate(f) for f in foods]


@router.post("/foods", response_model=FoodItemResponse, status_code=status.HTTP_201_CREATED)
async def create_food(
    data: FoodItemCreate,
    db: AsyncSession = Depends(get_session),
) -> FoodItemResponse:
    food = await service.create_food_item(db, data)
    return FoodItemResponse.model_validate(food)


@router.get("/foods/{food_id}", response_model=FoodItemResponse)
async def get_food(
    food_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> FoodItemResponse:
    food = await service.get_food_item(db, food_id)
    return FoodItemResponse.model_validate(food)


@router.put("/foods/{food_id}", response_model=FoodItemResponse)
async def update_food(
    food_id: uuid.UUID,
    data: FoodItemUpdate,
    db: AsyncSession = Depends(get_session),
) -> FoodItemResponse:
    food = await service.update_food_item(db, food_id, data)
    return FoodItemResponse.model_validate(food)


# ---------------------------------------------------------------------------
# Feeding logs
# ---------------------------------------------------------------------------

@router.get("/logs", response_model=list[FeedingLogResponse])
async def list_logs(
    parrot_id: uuid.UUID = Query(...),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_session),
) -> list[FeedingLogResponse]:
    logs = await service.list_feeding_logs(
        db,
        parrot_id=parrot_id,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit,
    )
    return [FeedingLogResponse.model_validate(log) for log in logs]


@router.post("/logs", response_model=FeedingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_log(
    data: FeedingLogCreate,
    db: AsyncSession = Depends(get_session),
) -> FeedingLogResponse:
    log = await service.create_feeding_log(db, data)
    return FeedingLogResponse.model_validate(log)


@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_log(
    log_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> None:
    await service.delete_feeding_log(db, log_id)


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=FeedingSummaryResponse)
async def feeding_summary(
    parrot_id: uuid.UUID = Query(...),
    days: int = Query(default=7, ge=1, le=365),
    db: AsyncSession = Depends(get_session),
) -> FeedingSummaryResponse:
    return await service.get_feeding_summary(db, parrot_id=parrot_id, days=days)


# ---------------------------------------------------------------------------
# AI plan
# ---------------------------------------------------------------------------

@router.post("/suggest-plan", response_model=FeedingPlanResponse, status_code=status.HTTP_201_CREATED)
async def suggest_plan(
    data: SuggestPlanRequest,
    db: AsyncSession = Depends(get_session),
) -> FeedingPlanResponse:
    return await service.suggest_feeding_plan(db, parrot_id=data.parrot_id)
