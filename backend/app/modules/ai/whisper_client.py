import logging
from difflib import SequenceMatcher
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions"


async def _get_openai_key() -> str:
    from app.database import async_session_factory
    from app.modules.settings.service import get_setting_value

    async with async_session_factory() as db:
        key = await get_setting_value(db, "openai_api_key")
    if not key:
        raise ValueError("OpenAI API Key not configured. Go to Settings to add it.")
    return key


async def transcribe_audio(file_path: str) -> tuple[str, float]:
    """Transcribe audio using OpenAI Whisper API.

    Returns (transcription_text, confidence).
    """
    api_key = await _get_openai_key()

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    async with httpx.AsyncClient(timeout=60.0) as client:
        with open(path, "rb") as audio_file:
            response = await client.post(
                WHISPER_API_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (path.name, audio_file, "audio/mpeg")},
                data={
                    "model": "whisper-1",
                    "response_format": "verbose_json",
                    "language": "es",
                },
            )

    if response.status_code != 200:
        logger.error("Whisper API error %d: %s", response.status_code, response.text)
        raise RuntimeError(f"Whisper API error: {response.status_code}")

    data = response.json()
    text = data.get("text", "").strip()

    # Extract average confidence from segments
    segments = data.get("segments", [])
    if segments:
        avg_confidence = sum(
            s.get("avg_logprob", -1.0) for s in segments
        ) / len(segments)
        # Convert log probability to 0-1 scale (rough approximation)
        confidence = max(0.0, min(1.0, 1.0 + avg_confidence))
    else:
        confidence = 0.5

    return text, confidence


def compute_text_similarity(text_a: str, text_b: str) -> float:
    """Compute similarity between two texts (0.0 to 1.0).

    Uses SequenceMatcher for fuzzy matching, good for parrot
    approximations like "ola" vs "hola".
    """
    a_clean = text_a.lower().strip()
    b_clean = text_b.lower().strip()

    if not a_clean or not b_clean:
        return 0.0

    return SequenceMatcher(None, a_clean, b_clean).ratio()


async def transcribe_and_compare(
    recording_path: str, target_text: str
) -> tuple[str, float, float]:
    """Transcribe a recording and compare to target text.

    Returns (transcription, confidence, similarity_score).
    """
    transcription, confidence = await transcribe_audio(recording_path)
    similarity = compute_text_similarity(transcription, target_text)
    return transcription, confidence, similarity
