from datetime import datetime

from pydantic import BaseModel, Field


class SettingUpdate(BaseModel):
    value: str = Field(..., max_length=500)


class SettingResponse(BaseModel):
    key: str
    value: str
    label: str
    category: str
    is_secret: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class SettingPublicResponse(BaseModel):
    """Response that masks secret values."""

    key: str
    value: str  # masked if is_secret
    label: str
    category: str
    is_secret: bool
    is_configured: bool
    updated_at: datetime

    model_config = {"from_attributes": True}
