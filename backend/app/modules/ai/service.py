import logging
import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai import elevenlabs_client, gemini_client, whisper_client
from app.modules.ai.models import AiAnalysis, AiTrainingPlan, ClonedVoice
from app.modules.ai.schemas import (
    CompareAudioResponse,
    GenerateSpeechRequest,
    GenerateSpeechResponse,
    ProgressInsight,
    SuggestPlanResponse,
    TranscribeResponse,
)
from app.modules.clips.models import Clip
from app.modules.recordings.models import Recording
from app.modules.training.models import SessionLog
from app.shared import audio_utils

logger = logging.getLogger(__name__)


# --- Whisper: Transcribe & Compare ---

async def transcribe_recording(
    db: AsyncSession,
    recording_id: uuid.UUID,
    target_clip_id: uuid.UUID | None = None,
) -> TranscribeResponse:
    """Transcribe a parrot recording and optionally compare to a target clip."""
    # Get recording
    result = await db.execute(
        select(Recording).where(Recording.id == recording_id)
    )
    recording = result.scalar_one_or_none()
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Transcribe with Whisper
    transcription, confidence = await whisper_client.transcribe_audio(
        recording.file_path
    )

    similarity_score: float | None = None
    target_word: str | None = None

    # If target clip provided, transcribe it too and compare
    if target_clip_id:
        clip_result = await db.execute(
            select(Clip).where(Clip.id == target_clip_id)
        )
        target_clip = clip_result.scalar_one_or_none()
        if target_clip:
            target_transcription, _ = await whisper_client.transcribe_audio(
                target_clip.file_path
            )
            target_word = target_transcription
            similarity_score = whisper_client.compute_text_similarity(
                transcription, target_transcription
            )

    # Save analysis to DB
    analysis = AiAnalysis(
        recording_id=recording_id,
        transcription=transcription,
        confidence=confidence,
        similarity_score=similarity_score,
        target_clip_id=target_clip_id,
    )
    db.add(analysis)
    await db.flush()

    return TranscribeResponse(
        recording_id=recording_id,
        transcription=transcription,
        confidence=confidence,
        similarity_score=similarity_score,
        target_word=target_word,
    )


# --- ElevenLabs: Generate Speech ---

async def generate_speech(
    db: AsyncSession,
    request: GenerateSpeechRequest,
) -> GenerateSpeechResponse:
    """Generate speech with ElevenLabs and save as a clip."""
    file_path = await elevenlabs_client.generate_speech(
        text=request.text,
        voice_id=request.voice_id,
        stability=request.stability,
        similarity_boost=request.similarity_boost,
    )

    duration = await audio_utils.get_audio_duration_async(file_path)

    # Create clip in library
    clip = Clip(
        name=request.name,
        file_path=file_path,
        duration=duration,
        type="phrase",
        category=request.category,
        tags=request.tags,
        difficulty=1,
        default_volume=1.0,
        source="elevenlabs",
    )
    db.add(clip)
    await db.flush()
    await db.refresh(clip)

    return GenerateSpeechResponse(
        clip_id=clip.id,
        name=clip.name,
        duration=duration,
        file_path=file_path,
    )


async def clone_voice(
    db: AsyncSession,
    name: str,
    files: list[UploadFile],
) -> ClonedVoice:
    """Clone a voice from uploaded audio samples."""
    from app.shared import storage

    # Save uploaded files temporarily
    temp_paths: list[str] = []
    for file in files:
        filename = f"voice_sample_{uuid.uuid4()}.mp3"
        path = await storage.save_clip(file, filename)
        temp_paths.append(path)

    # Clone with ElevenLabs
    voice_id = await elevenlabs_client.clone_voice(name, temp_paths)

    # Save to DB
    voice = ClonedVoice(
        name=name,
        provider="elevenlabs",
        provider_voice_id=voice_id,
        sample_count=len(files),
    )
    db.add(voice)
    await db.flush()
    await db.refresh(voice)

    # Clean up temp files
    for path in temp_paths:
        storage.delete_file(path)

    return voice


async def list_cloned_voices(db: AsyncSession) -> list[ClonedVoice]:
    result = await db.execute(
        select(ClonedVoice).order_by(ClonedVoice.created_at.desc())
    )
    return list(result.scalars().all())


# --- Gemini: Analyze Progress ---

async def analyze_progress(
    db: AsyncSession,
    days: int = 7,
) -> ProgressInsight:
    """Analyze training progress using Gemini."""
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Get session logs
    logs_result = await db.execute(
        select(SessionLog).where(SessionLog.executed_at >= cutoff)
    )
    logs = logs_result.scalars().all()

    log_dicts = []
    for log in logs:
        # Get clip name if available
        clip_name = "unknown"
        if log.clip_played_id:
            clip_result = await db.execute(
                select(Clip.name).where(Clip.id == log.clip_played_id)
            )
            name = clip_result.scalar_one_or_none()
            if name:
                clip_name = name

        log_dicts.append({
            "step_number": log.step_number,
            "clip_name": clip_name,
            "response_detected": log.response_detected,
            "result": log.result,
            "executed_at": str(log.executed_at),
        })

    # Get recording stats
    from app.modules.recordings.service import get_recording_stats
    stats = await get_recording_stats(db)
    stats_dict = {
        "total_recordings": stats.total,
        "by_classification": stats.by_classification,
        "avg_duration": stats.avg_duration,
    }

    # Get clips info
    clips_result = await db.execute(select(Clip).limit(50))
    clips = clips_result.scalars().all()
    clips_info = [
        {"name": c.name, "type": c.type, "category": c.category, "difficulty": c.difficulty}
        for c in clips
    ]

    # Analyze with Gemini
    insights = await gemini_client.analyze_progress(log_dicts, stats_dict, clips_info)

    return ProgressInsight(
        summary=insights.get("summary", "No data to analyze yet."),
        best_time_of_day=insights.get("best_time_of_day"),
        most_effective_clips=insights.get("most_effective_clips", []),
        recommendations=insights.get("recommendations", []),
        progress_trend=insights.get("progress_trend", "stable"),
        weekly_score=insights.get("weekly_score"),
    )


async def suggest_plan(
    db: AsyncSession,
    goal: str,
    difficulty: int,
    sessions_per_day: int,
) -> SuggestPlanResponse:
    """Generate a training plan with Gemini."""
    # Get clips
    clips_result = await db.execute(select(Clip).limit(50))
    clips = clips_result.scalars().all()
    clips_info = [
        {"name": c.name, "type": c.type, "category": c.category, "difficulty": c.difficulty}
        for c in clips
    ]

    # Get recent analysis for context
    analyses_result = await db.execute(
        select(AiAnalysis).order_by(AiAnalysis.analyzed_at.desc()).limit(10)
    )
    analyses = analyses_result.scalars().all()
    progress = {
        "total_analyses": len(analyses),
        "avg_similarity": (
            sum(a.similarity_score for a in analyses if a.similarity_score is not None)
            / max(1, sum(1 for a in analyses if a.similarity_score is not None))
        )
        if analyses
        else 0,
    }

    plan_data = await gemini_client.suggest_training_plan(
        clips_info=clips_info,
        current_progress=progress,
        goal=goal,
        difficulty=difficulty,
        sessions_per_day=sessions_per_day,
    )

    # Save plan to DB
    plan = AiTrainingPlan(plan_data=plan_data)
    db.add(plan)
    await db.flush()
    await db.refresh(plan)

    return SuggestPlanResponse(
        plan_id=plan.id,
        plan_data=plan_data,
        generated_at=plan.generated_at,
    )


# --- Compare Audio ---

async def compare_audio(
    db: AsyncSession,
    recording_id: uuid.UUID,
    target_clip_id: uuid.UUID,
) -> CompareAudioResponse:
    """Compare a parrot recording against a target clip using Whisper + Gemini."""
    # Get both audio files
    rec_result = await db.execute(
        select(Recording).where(Recording.id == recording_id)
    )
    recording = rec_result.scalar_one_or_none()
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")

    clip_result = await db.execute(
        select(Clip).where(Clip.id == target_clip_id)
    )
    target_clip = clip_result.scalar_one_or_none()
    if target_clip is None:
        raise HTTPException(status_code=404, detail="Target clip not found")

    # Transcribe both with Whisper
    rec_text, rec_conf = await whisper_client.transcribe_audio(recording.file_path)
    target_text, _ = await whisper_client.transcribe_audio(target_clip.file_path)

    # Text similarity
    text_similarity = whisper_client.compute_text_similarity(rec_text, target_text)

    # Gemini multimodal analysis of the recording
    gemini_analysis = await gemini_client.analyze_audio_with_gemini(
        recording.file_path,
        target_description=f"{target_clip.name} - transcribed as: '{target_text}'",
    )

    # Save analysis
    analysis = AiAnalysis(
        recording_id=recording_id,
        transcription=rec_text,
        confidence=rec_conf,
        similarity_score=text_similarity,
        target_clip_id=target_clip_id,
        gemini_notes=gemini_analysis,
    )
    db.add(analysis)
    await db.flush()

    return CompareAudioResponse(
        similarity_score=text_similarity,
        transcription_recording=rec_text,
        transcription_target=target_text,
        analysis=gemini_analysis,
    )


# --- History ---

async def get_analyses(
    db: AsyncSession,
    recording_id: uuid.UUID | None = None,
    limit: int = 50,
) -> list[AiAnalysis]:
    stmt = select(AiAnalysis)
    if recording_id:
        stmt = stmt.where(AiAnalysis.recording_id == recording_id)
    stmt = stmt.order_by(AiAnalysis.analyzed_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_training_plans(
    db: AsyncSession,
    limit: int = 10,
) -> list[AiTrainingPlan]:
    result = await db.execute(
        select(AiTrainingPlan).order_by(AiTrainingPlan.generated_at.desc()).limit(limit)
    )
    return list(result.scalars().all())
