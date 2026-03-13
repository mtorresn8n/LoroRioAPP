import asyncio
import os
import tempfile
import uuid
from pathlib import Path

from fastapi import HTTPException, status

from app.modules.clips.models import Clip
from app.modules.youtube.schemas import YouTubeExtractRequest, YouTubeInfoResponse
from app.shared import audio_utils, storage

# Browser to extract cookies from. Override with YOUTUBE_COOKIES_BROWSER env var.
# Supported: chrome, edge, firefox, opera, brave, chromium, safari
# Default empty — server environments typically have no browser installed.
_COOKIES_BROWSER = os.environ.get("YOUTUBE_COOKIES_BROWSER", "")

# Optional Netscape-format cookies file (takes priority over browser cookies).
_COOKIES_FILE = os.environ.get("YOUTUBE_COOKIES_FILE", "")

# ffmpeg location – auto-detected from common install paths if not on PATH.
_FFMPEG_DIR = os.environ.get("FFMPEG_LOCATION", "")
if not _FFMPEG_DIR:
    import shutil
    if shutil.which("ffmpeg") is None:
        # Check winget default install path
        _winget_path = os.path.join(
            os.environ.get("LOCALAPPDATA", ""),
            "Microsoft", "WinGet", "Packages",
        )
        if os.path.isdir(_winget_path):
            for entry in os.listdir(_winget_path):
                if "FFmpeg" in entry:
                    candidate = os.path.join(_winget_path, entry)
                    for root, dirs, files in os.walk(candidate):
                        if "ffmpeg.exe" in files:
                            _FFMPEG_DIR = root
                            break
                    if _FFMPEG_DIR:
                        break


def _base_ydl_opts() -> dict:
    """Return yt-dlp options shared by info and download calls."""
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
    }
    if _COOKIES_FILE and os.path.isfile(_COOKIES_FILE):
        opts["cookiefile"] = _COOKIES_FILE
    elif _COOKIES_BROWSER:
        opts["cookiesfrombrowser"] = (_COOKIES_BROWSER,)
    if _FFMPEG_DIR:
        opts["ffmpeg_location"] = _FFMPEG_DIR
    return opts


async def get_video_info(url: str) -> YouTubeInfoResponse:
    """Fetch YouTube video metadata without downloading."""
    import yt_dlp  # type: ignore[import-untyped]

    ydl_opts = {
        **_base_ydl_opts(),
        "skip_download": True,
    }

    def _extract() -> YouTubeInfoResponse:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Could not extract video information",
                )
            return YouTubeInfoResponse(
                title=str(info.get("title", "Unknown")),
                duration=float(info.get("duration", 0)),
                thumbnail=info.get("thumbnail"),
                uploader=info.get("uploader"),
            )

    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, _extract)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to fetch video info: {exc}",
        ) from exc


async def extract_audio_clip(request: YouTubeExtractRequest) -> dict:
    """Download YouTube audio, cut the requested segment, and persist as a Clip."""
    import yt_dlp  # type: ignore[import-untyped]

    clip_id = uuid.uuid4()
    unique_name = f"{clip_id}.mp3"

    with tempfile.TemporaryDirectory() as tmp_dir:
        raw_path = os.path.join(tmp_dir, f"raw_{clip_id}")

        ydl_opts: dict = {
            **_base_ydl_opts(),
            "format": "bestaudio/best",
            "outtmpl": raw_path,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
        }

        def _download() -> str:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([request.url])
            mp3_path = f"{raw_path}.mp3"
            if not os.path.exists(mp3_path):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Download failed: output file not found",
                )
            return mp3_path

        loop = asyncio.get_event_loop()
        try:
            downloaded_path = await loop.run_in_executor(None, _download)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Download error: {exc}",
            ) from exc

        # Cut audio if time boundaries specified
        start_ms = int(request.start_time * 1000)
        if request.end_time is not None:
            end_ms = int(request.end_time * 1000)
            cut_tmp = os.path.join(tmp_dir, f"cut_{clip_id}.mp3")
            await audio_utils.cut_audio_async(downloaded_path, cut_tmp, start_ms, end_ms)
            final_tmp = cut_tmp
        else:
            final_tmp = downloaded_path

        duration = await audio_utils.get_audio_duration_async(final_tmp)

        # Read bytes and persist via storage helper
        with open(final_tmp, "rb") as f:
            audio_bytes = f.read()

    saved_path = await storage.save_bytes_as_clip(audio_bytes, unique_name)

    return {
        "id": str(clip_id),
        "name": request.name,
        "file_path": saved_path,
        "duration": duration,
        "type": "sound",
        "category": request.category,
        "tags": request.tags,
        "difficulty": request.difficulty,
        "default_volume": request.default_volume,
        "source": "youtube",
        "youtube_url": request.url,
    }
