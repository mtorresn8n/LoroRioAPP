import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# --- Whisper ---
class TranscribeRequest(BaseModel):
    recording_id: uuid.UUID
    target_clip_id: uuid.UUID | None = None


class TranscribeResponse(BaseModel):
    recording_id: uuid.UUID
    transcription: str
    confidence: float
    similarity_score: float | None = None
    target_word: str | None = None

    model_config = {"from_attributes": True}


# --- ElevenLabs ---
class GenerateSpeechRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    voice_id: str | None = None
    name: str = Field(..., min_length=1, max_length=255)
    category: str | None = None
    tags: list[str] | None = None
    stability: float = Field(default=0.5, ge=0.0, le=1.0)
    similarity_boost: float = Field(default=0.75, ge=0.0, le=1.0)


class GenerateSpeechResponse(BaseModel):
    clip_id: uuid.UUID
    name: str
    duration: float
    file_path: str


class CloneVoiceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ClonedVoiceResponse(BaseModel):
    id: uuid.UUID
    name: str
    provider: str
    provider_voice_id: str
    sample_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Gemini ---
class AnalyzeProgressRequest(BaseModel):
    days: int = Field(default=7, ge=1, le=90)


class ProgressInsight(BaseModel):
    summary: str
    best_time_of_day: str | None = None
    most_effective_clips: list[str]
    recommendations: list[str]
    progress_trend: str
    weekly_score: float | None = None


class SuggestPlanRequest(BaseModel):
    goal: str = Field(default="general", max_length=500)
    difficulty: int = Field(default=1, ge=1, le=5)
    sessions_per_day: int = Field(default=3, ge=1, le=10)


class SuggestPlanResponse(BaseModel):
    plan_id: uuid.UUID
    plan_data: dict
    generated_at: datetime


class CompareAudioRequest(BaseModel):
    recording_id: uuid.UUID
    target_clip_id: uuid.UUID


class CompareAudioResponse(BaseModel):
    similarity_score: float
    transcription_recording: str | None = None
    transcription_target: str | None = None
    analysis: str


# --- Analysis ---
class AiAnalysisResponse(BaseModel):
    id: uuid.UUID
    recording_id: uuid.UUID
    transcription: str | None
    confidence: float | None
    similarity_score: float | None
    target_clip_id: uuid.UUID | None
    gemini_notes: str | None
    analyzed_at: datetime

    model_config = {"from_attributes": True}


class AiTrainingPlanResponse(BaseModel):
    id: uuid.UUID
    generated_at: datetime
    plan_data: dict
    applied: bool
    feedback: str | None

    model_config = {"from_attributes": True}
