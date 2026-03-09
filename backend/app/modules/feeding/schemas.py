import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------- FoodItem ----------

class FoodItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: str = Field(
        ...,
        max_length=100,
        pattern="^(fruit|vegetable|seed|pellet|nut|protein|grain|treat|toxic)$",
    )
    is_safe: bool = True
    is_toxic: bool = False
    nutritional_info: dict[str, Any] | None = None
    frequency_recommendation: str | None = Field(
        default=None,
        max_length=100,
        pattern="^(daily|3x_week|occasional|never)$",
    )
    notes: str | None = None
    age_restriction: str | None = Field(
        default=None,
        max_length=50,
        pattern="^(adult_only|chick_friendly|all_ages)$",
    )


class FoodItemCreate(FoodItemBase):
    pass


class FoodItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = Field(
        default=None,
        max_length=100,
        pattern="^(fruit|vegetable|seed|pellet|nut|protein|grain|treat|toxic)$",
    )
    is_safe: bool | None = None
    is_toxic: bool | None = None
    nutritional_info: dict[str, Any] | None = None
    frequency_recommendation: str | None = Field(
        default=None,
        max_length=100,
        pattern="^(daily|3x_week|occasional|never)$",
    )
    notes: str | None = None
    age_restriction: str | None = Field(
        default=None,
        max_length=50,
        pattern="^(adult_only|chick_friendly|all_ages)$",
    )


class FoodItemResponse(FoodItemBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID


# ---------- FeedingLog ----------

class FeedingLogCreate(BaseModel):
    parrot_id: uuid.UUID
    food_item_id: uuid.UUID | None = None
    food_name: str = Field(..., min_length=1, max_length=255)
    quantity: str | None = Field(default=None, max_length=100)
    fed_at: datetime | None = None
    notes: str | None = None


class FeedingLogResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    parrot_id: uuid.UUID
    food_item_id: uuid.UUID | None
    food_name: str
    quantity: str | None
    fed_at: datetime
    notes: str | None


# ---------- FeedingPlan ----------

class SuggestPlanRequest(BaseModel):
    parrot_id: uuid.UUID


class FeedingPlanResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    parrot_id: uuid.UUID
    plan_data: dict[str, Any]
    generated_at: datetime
    active: bool
    feedback: str | None


# ---------- Summary ----------

class FeedingSummaryResponse(BaseModel):
    parrot_id: uuid.UUID
    days: int
    total_feedings: int
    unique_foods: int
    most_fed_foods: list[dict[str, Any]]
    toxic_foods_fed: list[str]
    category_breakdown: dict[str, int]
