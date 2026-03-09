from pydantic import BaseModel, Field, HttpUrl


class YouTubeInfoRequest(BaseModel):
    url: str = Field(..., min_length=1)


class YouTubeInfoResponse(BaseModel):
    title: str
    duration: float
    thumbnail: str | None
    uploader: str | None


class YouTubeExtractRequest(BaseModel):
    url: str = Field(..., min_length=1)
    start_time: float = Field(default=0.0, ge=0.0)
    end_time: float | None = Field(default=None, ge=0.0)
    name: str = Field(..., min_length=1, max_length=255)
    category: str | None = Field(default=None, max_length=100)
    tags: list[str] | None = None
    difficulty: int = Field(default=1, ge=1, le=10)
    default_volume: float = Field(default=1.0, ge=0.0, le=2.0)
