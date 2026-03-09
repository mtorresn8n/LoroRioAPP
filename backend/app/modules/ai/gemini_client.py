import base64
import logging
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


async def _get_gemini_key() -> str:
    from app.database import async_session_factory
    from app.modules.settings.service import get_setting_value

    async with async_session_factory() as db:
        key = await get_setting_value(db, "gemini_api_key")
    if not key:
        raise ValueError("Gemini API Key not configured. Go to Settings to add it.")
    return key


async def _gemini_request(
    contents: list[dict],
    system_instruction: str | None = None,
) -> str:
    """Make a request to Gemini API and return text response."""
    api_key = await _get_gemini_key()
    url = (
        f"{GEMINI_BASE_URL}/models/gemini-2.0-flash:generateContent"
        f"?key={api_key}"
    )

    body: dict = {"contents": contents}
    if system_instruction:
        body["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }
    body["generationConfig"] = {
        "temperature": 0.7,
        "maxOutputTokens": 2048,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, json=body)

    if response.status_code != 200:
        logger.error("Gemini API error %d: %s", response.status_code, response.text)
        raise RuntimeError(f"Gemini API error: {response.status_code}")

    data = response.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")

    parts = candidates[0].get("content", {}).get("parts", [])
    return parts[0].get("text", "") if parts else ""


async def analyze_progress(
    session_logs: list[dict],
    recording_stats: dict,
    clips_info: list[dict],
) -> dict:
    """Analyze parrot training progress using Gemini.

    Returns structured insights about the parrot's learning.
    """
    system_prompt = """You are an expert parrot trainer AI assistant.
Analyze the training data provided and give actionable insights in Spanish.
Return your analysis as a JSON object with these fields:
- summary: string (2-3 sentence overview)
- best_time_of_day: string or null
- most_effective_clips: list of clip names that got best responses
- recommendations: list of 3-5 specific actionable suggestions
- progress_trend: "improving", "stable", or "declining"
- weekly_score: float 0-100 representing overall training effectiveness

Be encouraging but honest. Focus on practical advice for parrot training."""

    user_content = f"""Training data for analysis:

SESSION LOGS (last sessions):
{_format_logs(session_logs)}

RECORDING STATS:
{_format_dict(recording_stats)}

AVAILABLE CLIPS:
{_format_clips(clips_info)}

Analyze this data and provide insights as JSON."""

    text = await _gemini_request(
        contents=[{"role": "user", "parts": [{"text": user_content}]}],
        system_instruction=system_prompt,
    )

    return _parse_json_response(text)


async def suggest_training_plan(
    clips_info: list[dict],
    current_progress: dict,
    goal: str,
    difficulty: int,
    sessions_per_day: int,
) -> dict:
    """Generate a personalized training plan using Gemini."""
    system_prompt = """You are an expert parrot trainer AI. Generate a detailed
training plan in Spanish. Return a JSON object with:
- plan_name: string
- duration_days: int
- daily_schedule: list of {time: "HH:MM", activity: string, clip_names: list, duration_minutes: int, notes: string}
- milestones: list of {day: int, expected: string}
- tips: list of strings

Design the plan based on proven parrot training techniques:
- Short sessions (5-10 min) multiple times per day
- Positive reinforcement with reward sounds
- Spaced repetition
- Gradual difficulty increase
- Mix of imitation, association, and play"""

    user_content = f"""Generate a training plan with these parameters:

GOAL: {goal}
DIFFICULTY LEVEL: {difficulty}/5
SESSIONS PER DAY: {sessions_per_day}

AVAILABLE CLIPS: {_format_clips(clips_info)}

CURRENT PROGRESS: {_format_dict(current_progress)}

Create a structured plan as JSON."""

    text = await _gemini_request(
        contents=[{"role": "user", "parts": [{"text": user_content}]}],
        system_instruction=system_prompt,
    )

    return _parse_json_response(text)


async def analyze_audio_with_gemini(
    audio_path: str,
    target_description: str,
) -> str:
    """Send audio to Gemini for multimodal analysis.

    Returns Gemini's text analysis of the audio.
    """
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    with open(path, "rb") as f:
        audio_bytes = f.read()

    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

    # Determine MIME type
    suffix = path.suffix.lower()
    mime_map = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
    }
    mime_type = mime_map.get(suffix, "audio/mpeg")

    contents = [
        {
            "role": "user",
            "parts": [
                {
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": audio_b64,
                    }
                },
                {
                    "text": f"""Analyze this parrot audio recording in Spanish.
The target sound/word the parrot is trying to learn is: "{target_description}"

Evaluate:
1. Does the audio contain a parrot vocalization?
2. How similar is it to the target?
3. What specific sounds can you identify?
4. Rate the attempt from 0-100.
5. Suggestions to improve training.

Be specific and practical."""
                },
            ],
        }
    ]

    return await _gemini_request(
        contents=contents,
        system_instruction="You are an expert parrot trainer analyzing audio recordings. Respond in Spanish.",
    )


def _format_logs(logs: list[dict]) -> str:
    if not logs:
        return "No session logs available yet."
    lines = []
    for log in logs[:50]:
        lines.append(
            f"- Step {log.get('step_number', '?')}: "
            f"clip='{log.get('clip_name', 'unknown')}', "
            f"response={'YES' if log.get('response_detected') else 'NO'}, "
            f"result={log.get('result', 'unknown')}, "
            f"at={log.get('executed_at', '?')}"
        )
    return "\n".join(lines)


def _format_clips(clips: list[dict]) -> str:
    if not clips:
        return "No clips available."
    lines = []
    for c in clips:
        lines.append(
            f"- '{c.get('name', '?')}' (type={c.get('type', '?')}, "
            f"category={c.get('category', '?')}, "
            f"difficulty={c.get('difficulty', '?')})"
        )
    return "\n".join(lines)


def _format_dict(d: dict) -> str:
    return "\n".join(f"- {k}: {v}" for k, v in d.items())


def _parse_json_response(text: str) -> dict:
    """Extract JSON from Gemini response that may contain markdown code blocks."""
    import json

    cleaned = text.strip()

    # Remove markdown code block if present
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Remove first line (```json) and last line (```)
        json_lines = []
        inside = False
        for line in lines:
            if line.strip().startswith("```") and not inside:
                inside = True
                continue
            if line.strip() == "```" and inside:
                break
            if inside:
                json_lines.append(line)
        cleaned = "\n".join(json_lines)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Could not parse Gemini response as JSON, returning as text")
        return {"raw_response": text}
