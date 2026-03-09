import uuid

from fastapi import APIRouter, Depends, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.modules.ai import service
from app.modules.ai.schemas import (
    AiAnalysisResponse,
    AiTrainingPlanResponse,
    ClonedVoiceResponse,
    CompareAudioRequest,
    CompareAudioResponse,
    GenerateSpeechRequest,
    GenerateSpeechResponse,
    ProgressInsight,
    SuggestPlanRequest,
    SuggestPlanResponse,
    TranscribeRequest,
    TranscribeResponse,
)

router = APIRouter(prefix="/ai", tags=["ai"])


# --- Whisper ---

@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_recording(
    data: TranscribeRequest,
    db: AsyncSession = Depends(get_session),
) -> TranscribeResponse:
    """Transcribe a parrot recording with Whisper and optionally compare to target."""
    return await service.transcribe_recording(
        db, data.recording_id, data.target_clip_id
    )


@router.post("/compare", response_model=CompareAudioResponse)
async def compare_audio(
    data: CompareAudioRequest,
    db: AsyncSession = Depends(get_session),
) -> CompareAudioResponse:
    """Compare a recording vs a target clip using Whisper + Gemini."""
    return await service.compare_audio(
        db, data.recording_id, data.target_clip_id
    )


# --- ElevenLabs ---

@router.post(
    "/generate-speech",
    response_model=GenerateSpeechResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_speech(
    data: GenerateSpeechRequest,
    db: AsyncSession = Depends(get_session),
) -> GenerateSpeechResponse:
    """Generate speech with ElevenLabs TTS and save as a clip."""
    return await service.generate_speech(db, data)


@router.post(
    "/clone-voice",
    response_model=ClonedVoiceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def clone_voice(
    name: str,
    files: list[UploadFile],
    db: AsyncSession = Depends(get_session),
) -> ClonedVoiceResponse:
    """Clone a voice from audio samples via ElevenLabs."""
    voice = await service.clone_voice(db, name, files)
    return ClonedVoiceResponse.model_validate(voice)


@router.get("/voices", response_model=list[ClonedVoiceResponse])
async def list_voices(
    db: AsyncSession = Depends(get_session),
) -> list[ClonedVoiceResponse]:
    """List all cloned voices."""
    voices = await service.list_cloned_voices(db)
    return [ClonedVoiceResponse.model_validate(v) for v in voices]


# --- Gemini ---

@router.post("/analyze-progress", response_model=ProgressInsight)
async def analyze_progress(
    days: int = Query(default=7, ge=1, le=90),
    db: AsyncSession = Depends(get_session),
) -> ProgressInsight:
    """Analyze parrot training progress with Gemini AI."""
    return await service.analyze_progress(db, days=days)


@router.post(
    "/suggest-plan",
    response_model=SuggestPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
async def suggest_plan(
    data: SuggestPlanRequest,
    db: AsyncSession = Depends(get_session),
) -> SuggestPlanResponse:
    """Generate a personalized training plan with Gemini AI."""
    return await service.suggest_plan(
        db,
        goal=data.goal,
        difficulty=data.difficulty,
        sessions_per_day=data.sessions_per_day,
    )


# --- History ---

@router.get("/analyses", response_model=list[AiAnalysisResponse])
async def list_analyses(
    recording_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
) -> list[AiAnalysisResponse]:
    """List AI analyses, optionally filtered by recording."""
    analyses = await service.get_analyses(db, recording_id=recording_id, limit=limit)
    return [AiAnalysisResponse.model_validate(a) for a in analyses]


@router.get("/plans", response_model=list[AiTrainingPlanResponse])
async def list_plans(
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_session),
) -> list[AiTrainingPlanResponse]:
    """List AI-generated training plans."""
    plans = await service.get_training_plans(db, limit=limit)
    return [AiTrainingPlanResponse.model_validate(p) for p in plans]
