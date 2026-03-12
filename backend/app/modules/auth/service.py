import hashlib
import hmac
import logging
import time
from http.cookies import SimpleCookie

from fastapi import WebSocket

from app.config import settings

logger = logging.getLogger(__name__)

COOKIE_NAME = "loro_session"


def generate_token(user: str) -> str:
    """Create a signed token: user:timestamp:hmac_sha256."""
    timestamp = str(int(time.time()))
    payload = f"{user}:{timestamp}"
    signature = hmac.new(
        settings.AUTH_SECRET.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}:{signature}"


def validate_token(token: str) -> str | None:
    """Validate HMAC signature and check expiry. Returns username or None."""
    parts = token.split(":")
    if len(parts) != 3:
        return None

    user, timestamp_str, signature = parts

    # Verify HMAC
    payload = f"{user}:{timestamp_str}"
    expected = hmac.new(
        settings.AUTH_SECRET.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        return None

    # Check expiry
    try:
        timestamp = int(timestamp_str)
    except ValueError:
        return None

    max_age_seconds = settings.AUTH_MAX_AGE_DAYS * 86400
    if time.time() - timestamp > max_age_seconds:
        return None

    return user


def validate_credentials(user: str, password: str) -> bool:
    """Check credentials against environment variables using constant-time comparison."""
    user_ok = hmac.compare_digest(user, settings.AUTH_USER)
    pass_ok = hmac.compare_digest(password, settings.AUTH_PASS)
    return user_ok and pass_ok


def get_cookie_max_age() -> int:
    """Return cookie max age in seconds."""
    return settings.AUTH_MAX_AGE_DAYS * 86400


async def validate_ws_cookie(websocket: WebSocket) -> bool:
    """Read loro_session cookie from WebSocket headers and validate."""
    cookie_header = websocket.headers.get("cookie", "")
    if not cookie_header:
        return False

    cookies = SimpleCookie()
    try:
        cookies.load(cookie_header)
    except Exception:
        return False

    morsel = cookies.get(COOKIE_NAME)
    if morsel is None:
        return False

    token = morsel.value
    return validate_token(token) is not None
