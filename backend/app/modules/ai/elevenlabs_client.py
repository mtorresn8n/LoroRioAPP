import logging
import uuid
from pathlib import Path

import httpx

from app.shared import storage

logger = logging.getLogger(__name__)

ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"


async def _get_elevenlabs_key() -> str:
    from app.database import async_session_factory
    from app.modules.settings.service import get_setting_value

    async with async_session_factory() as db:
        key = await get_setting_value(db, "elevenlabs_api_key")
    if not key:
        raise ValueError("ElevenLabs API Key not configured. Go to Settings to add it.")
    return key


async def _get_voice_id() -> str:
    from app.database import async_session_factory
    from app.modules.settings.service import get_setting_value

    async with async_session_factory() as db:
        return await get_setting_value(db, "elevenlabs_voice_id")


async def _headers() -> dict[str, str]:
    api_key = await _get_elevenlabs_key()
    return {
        "xi-api-key": api_key,
        "Accept": "application/json",
    }


async def generate_speech(
    text: str,
    voice_id: str | None = None,
    stability: float = 0.5,
    similarity_boost: float = 0.75,
) -> str:
    """Generate speech audio using ElevenLabs TTS.

    Returns the file path of the saved audio clip.
    """
    default_voice = await _get_voice_id()
    used_voice_id = voice_id or default_voice
    if not used_voice_id:
        raise ValueError("No voice_id provided and ElevenLabs Voice ID not configured in Settings.")

    url = f"{ELEVENLABS_BASE_URL}/text-to-speech/{used_voice_id}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            headers={**(await _headers()), "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": stability,
                    "similarity_boost": similarity_boost,
                },
            },
        )

    if response.status_code != 200:
        logger.error("ElevenLabs TTS error %d: %s", response.status_code, response.text)
        raise RuntimeError(f"ElevenLabs API error: {response.status_code}")

    # Save the audio bytes as a clip
    filename = f"tts_{uuid.uuid4()}.mp3"
    file_path = await storage.save_bytes_as_clip(response.content, filename)
    return file_path


async def clone_voice(name: str, audio_files: list[str]) -> str:
    """Clone a voice from audio samples using ElevenLabs.

    Args:
        name: Name for the cloned voice
        audio_files: List of file paths to audio samples

    Returns the provider voice_id.
    """
    url = f"{ELEVENLABS_BASE_URL}/voices/add"

    files_data: list[tuple[str, tuple[str, bytes, str]]] = []
    for audio_path in audio_files:
        path = Path(audio_path)
        if not path.exists():
            raise FileNotFoundError(f"Sample file not found: {audio_path}")
        with open(path, "rb") as f:
            files_data.append(("files", (path.name, f.read(), "audio/mpeg")))

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            url,
            headers=await _headers(),
            data={"name": name, "description": f"LoroApp cloned voice: {name}"},
            files=files_data,
        )

    if response.status_code != 200:
        logger.error("ElevenLabs clone error %d: %s", response.status_code, response.text)
        raise RuntimeError(f"ElevenLabs clone error: {response.status_code}")

    data = response.json()
    voice_id: str = data["voice_id"]
    logger.info("Voice cloned successfully: %s (id: %s)", name, voice_id)
    return voice_id


async def list_voices() -> list[dict[str, str]]:
    """List available ElevenLabs voices."""
    url = f"{ELEVENLABS_BASE_URL}/voices"

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=await _headers())

    if response.status_code != 200:
        raise RuntimeError(f"ElevenLabs list voices error: {response.status_code}")

    data = response.json()
    return [
        {"voice_id": v["voice_id"], "name": v["name"]}
        for v in data.get("voices", [])
    ]
