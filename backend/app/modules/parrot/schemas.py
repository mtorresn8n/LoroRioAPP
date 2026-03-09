import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class ParrotBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    species: str | None = Field(default=None, max_length=100)
    birth_date: date | None = None
    adoption_date: date | None = None
    weight_grams: float | None = Field(default=None, gt=0)
    sex: str | None = Field(default=None, pattern="^(male|female|unknown)$")
    notes: str | None = None
    avatar_path: str | None = None


class ParrotCreate(ParrotBase):
    pass


class ParrotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    species: str | None = Field(default=None, max_length=100)
    birth_date: date | None = None
    adoption_date: date | None = None
    weight_grams: float | None = Field(default=None, gt=0)
    sex: str | None = Field(default=None, pattern="^(male|female|unknown)$")
    notes: str | None = None


class ParrotResponse(ParrotBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class AvatarUploadResponse(BaseModel):
    avatar_path: str
    avatar_url: str


class AgeResponse(BaseModel):
    years: int
    months: int
    days: int
    total_days: int
    birth_date: date
