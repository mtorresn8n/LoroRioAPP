import json
import logging
from http.cookies import SimpleCookie
from typing import Any

from app.modules.auth.service import COOKIE_NAME, validate_token

logger = logging.getLogger(__name__)

# ASGI type aliases
Scope = dict[str, Any]
Receive = Any
Send = Any
ASGIApp = Any

# Paths that don't require authentication (method, path)
PUBLIC_PATHS: set[tuple[str, str]] = {
    ("POST", "/api/v1/auth/login"),
    ("GET", "/health"),
}

# Path prefixes that don't require authentication
PUBLIC_PREFIXES = (
    "/media/",
)


class AuthMiddleware:
    """Pure ASGI middleware for cookie-based authentication on HTTP requests."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Only intercept HTTP requests, not WebSocket or lifespan
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        method: str = scope.get("method", "GET")

        # Allow public paths (method + path match)
        if (method, path) in PUBLIC_PATHS:
            await self.app(scope, receive, send)
            return

        # Allow public prefixes (e.g., /media/ static files)
        if any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES):
            await self.app(scope, receive, send)
            return

        # Extract cookie from headers
        headers = dict(scope.get("headers", []))
        cookie_header = headers.get(b"cookie", b"").decode("utf-8", errors="ignore")

        user = None
        if cookie_header:
            cookies = SimpleCookie()
            try:
                cookies.load(cookie_header)
            except Exception:
                pass
            else:
                morsel = cookies.get(COOKIE_NAME)
                if morsel is not None:
                    user = validate_token(morsel.value)

        if user is None:
            # Return 401 Unauthorized as a JSON response
            body = json.dumps({"detail": "Not authenticated"}).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 401,
                "headers": [
                    [b"content-type", b"application/json"],
                    [b"content-length", str(len(body)).encode()],
                ],
            })
            await send({
                "type": "http.response.body",
                "body": body,
            })
            return

        # Authenticated — proceed
        await self.app(scope, receive, send)
