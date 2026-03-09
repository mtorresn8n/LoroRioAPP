import os
from pathlib import Path

import aiofiles
from fastapi import UploadFile

from app.config import settings


def _ensure_dir(path: str) -> None:
    Path(path).mkdir(parents=True, exist_ok=True)


async def save_clip(file: UploadFile, filename: str) -> str:
    """Save uploaded clip file and return the absolute path."""
    clips_dir = os.path.join(settings.MEDIA_PATH, "clips")
    _ensure_dir(clips_dir)
    dest = os.path.join(clips_dir, filename)
    async with aiofiles.open(dest, "wb") as f:
        content = await file.read()
        await f.write(content)
    return dest


async def save_recording(file: UploadFile, filename: str) -> str:
    """Save uploaded recording file and return the absolute path."""
    recordings_dir = os.path.join(settings.MEDIA_PATH, "recordings")
    _ensure_dir(recordings_dir)
    dest = os.path.join(recordings_dir, filename)
    async with aiofiles.open(dest, "wb") as f:
        content = await file.read()
        await f.write(content)
    return dest


async def save_bytes_as_clip(data: bytes, filename: str) -> str:
    """Save raw bytes as a clip file and return the absolute path."""
    clips_dir = os.path.join(settings.MEDIA_PATH, "clips")
    _ensure_dir(clips_dir)
    dest = os.path.join(clips_dir, filename)
    async with aiofiles.open(dest, "wb") as f:
        await f.write(data)
    return dest


def get_clips_dir() -> Path:
    """Return the clips directory path, ensuring it exists."""
    clips_dir = Path(settings.MEDIA_PATH) / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    return clips_dir


def get_recordings_dir() -> Path:
    """Return the recordings directory path, ensuring it exists."""
    recordings_dir = Path(settings.MEDIA_PATH) / "recordings"
    recordings_dir.mkdir(parents=True, exist_ok=True)
    return recordings_dir


def delete_file(path: str) -> None:
    """Delete a file if it exists."""
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def get_media_url(path: str) -> str:
    """Convert an absolute media path to a URL-accessible path."""
    media_path = settings.MEDIA_PATH.rstrip("/")
    relative = path.replace(media_path, "").lstrip("/")
    return f"/media/{relative}"
