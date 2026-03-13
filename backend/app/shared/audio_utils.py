import asyncio
import math
import os
import shutil
import subprocess
from pathlib import Path

# Ensure pydub can find ffmpeg/ffprobe even if not on PATH
if shutil.which("ffmpeg") is None:
    _winget_path = os.path.join(
        os.environ.get("LOCALAPPDATA", ""),
        "Microsoft", "WinGet", "Packages",
    )
    if os.path.isdir(_winget_path):
        for _entry in os.listdir(_winget_path):
            if "FFmpeg" in _entry:
                for _root, _dirs, _files in os.walk(os.path.join(_winget_path, _entry)):
                    if "ffmpeg.exe" in _files:
                        os.environ["PATH"] = _root + os.pathsep + os.environ.get("PATH", "")
                        break
                break


def get_audio_duration(file_path: str) -> float:
    """Return duration in seconds using pydub."""
    from pydub import AudioSegment

    audio = AudioSegment.from_file(file_path)
    return len(audio) / 1000.0


def convert_to_mp3(input_path: str, output_path: str) -> None:
    """Convert any audio file to MP3 using pydub."""
    from pydub import AudioSegment

    audio = AudioSegment.from_file(input_path)
    audio.export(output_path, format="mp3", bitrate="192k")


def cut_audio(
    input_path: str, output_path: str, start_ms: int, end_ms: int
) -> None:
    """Cut audio segment between start_ms and end_ms milliseconds."""
    from pydub import AudioSegment

    audio = AudioSegment.from_file(input_path)
    segment = audio[start_ms:end_ms]
    suffix = Path(output_path).suffix.lstrip(".")
    segment.export(output_path, format=suffix or "mp3")


def normalize_volume(file_path: str, target_dBFS: float = -20.0) -> None:
    """Normalize audio file to target dBFS in-place.

    Silent audio produces a dBFS of -inf, which makes the gain delta +inf and
    crashes apply_gain(). Guard against that by returning early — there is
    nothing meaningful to normalize in a silent segment.
    """
    from pydub import AudioSegment

    audio = AudioSegment.from_file(file_path)
    if not math.isfinite(audio.dBFS):
        return
    change_in_dBFS = target_dBFS - audio.dBFS
    normalized = audio.apply_gain(change_in_dBFS)
    suffix = Path(file_path).suffix.lstrip(".")
    normalized.export(file_path, format=suffix or "mp3")


def add_fade(file_path: str, fade_in_ms: int, fade_out_ms: int) -> None:
    """Add fade in/out to audio file in-place."""
    from pydub import AudioSegment

    audio = AudioSegment.from_file(file_path)
    if fade_in_ms > 0:
        audio = audio.fade_in(fade_in_ms)
    if fade_out_ms > 0:
        audio = audio.fade_out(fade_out_ms)
    suffix = Path(file_path).suffix.lstrip(".")
    audio.export(file_path, format=suffix or "mp3")


def get_peak_volume(file_path: str) -> float | None:
    """Return peak dBFS of audio file, or None for silent/empty audio.

    pydub returns -inf dBFS for completely silent audio, which is not
    JSON-serializable. Sanitize it to None instead.
    """
    from pydub import AudioSegment

    audio = AudioSegment.from_file(file_path)
    value = audio.max_dBFS
    return value if math.isfinite(value) else None


async def get_audio_duration_async(file_path: str) -> float | None:
    """Async wrapper around get_audio_duration. Returns None if ffmpeg is missing."""
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, get_audio_duration, file_path)
    except (FileNotFoundError, Exception):
        return None


async def convert_to_mp3_async(input_path: str, output_path: str) -> None:
    """Async wrapper around convert_to_mp3."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, convert_to_mp3, input_path, output_path)


async def cut_audio_async(
    input_path: str, output_path: str, start_ms: int, end_ms: int
) -> None:
    """Async wrapper around cut_audio."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, cut_audio, input_path, output_path, start_ms, end_ms)


async def get_peak_volume_async(file_path: str) -> float | None:
    """Async wrapper around get_peak_volume. Returns None if ffmpeg is missing."""
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, get_peak_volume, file_path)
    except (FileNotFoundError, Exception):
        return None
