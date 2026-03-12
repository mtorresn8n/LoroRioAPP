# Server/Host + Auth + WebRTC Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Basic Auth, Server/Host architecture with WebRTC for walkie talkie and camera streaming to LoroApp.

**Architecture:** Two-device system — Server (owner's browser) controls Host (phone near parrot) via WebSocket. WebRTC P2P for audio/video streaming. Cookie-based auth protects all routes.

**Tech Stack:** FastAPI, React 18, TypeScript, WebRTC, WebSocket, HMAC-SHA256 cookies

**Spec:** `docs/superpowers/specs/2026-03-12-server-host-auth-webrtc-design.md`

---

## Chunk 1: Authentication (Backend)

### Task 1: Config — Add auth environment variables

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/.env.example` (create if missing)

- [ ] **Step 1: Add AUTH fields to Settings class**

```python
# In config.py, add to Settings class:
import secrets as _secrets
from pydantic import model_validator

AUTH_USER: str = ""
AUTH_PASS: str = ""
AUTH_SECRET: str = ""
AUTH_MAX_AGE_DAYS: int = 30

@model_validator(mode="after")
def _generate_auth_secret(self) -> "Settings":
    if not self.AUTH_SECRET:
        object.__setattr__(self, "AUTH_SECRET", _secrets.token_hex(32))
    return self
```

- [ ] **Step 2: Add startup guard in main.py lifespan**

Add at the top of `lifespan()` in `backend/app/main.py`:

```python
if not settings.AUTH_USER or not settings.AUTH_PASS:
    logger.error("AUTH_USER and AUTH_PASS must be set. Exiting.")
    raise SystemExit(1)
```

- [ ] **Step 3: Create/update .env.example and backend/.env for local dev**

```env
# backend/.env
DATABASE_URL=postgresql+asyncpg://loroapp:loroapp@localhost:5432/loroapp
AUTH_USER=mtorres
AUTH_PASS=Password01
# AUTH_SECRET=  (auto-generated if empty)
# AUTH_MAX_AGE_DAYS=30
```

- [ ] **Step 4: Verify app starts with env vars set**

Run: `cd backend && python -c "from app.config import settings; print(settings.AUTH_USER, bool(settings.AUTH_SECRET))"`
Expected: `mtorres True`

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/app/main.py backend/.env.example
git commit -m "feat(auth): add auth config env vars with auto-generated secret"
```

### Task 2: Auth service — Token generation and validation

**Files:**
- Create: `backend/app/modules/auth/__init__.py`
- Create: `backend/app/modules/auth/service.py`

- [ ] **Step 1: Create auth module init**

```python
# backend/app/modules/auth/__init__.py
# Auth module
```

- [ ] **Step 2: Implement auth service**

```python
# backend/app/modules/auth/service.py
import hashlib
import hmac
import time
from http.cookies import SimpleCookie

from fastapi import WebSocket

from app.config import settings

COOKIE_NAME = "loro_session"


def generate_token(user: str) -> str:
    """Generate a signed token: user:timestamp:hmac."""
    timestamp = str(int(time.time()))
    payload = f"{user}:{timestamp}"
    signature = hmac.new(
        settings.AUTH_SECRET.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    return f"{user}:{timestamp}:{signature}"


def validate_token(token: str) -> str | None:
    """Validate token, return username if valid, None otherwise."""
    parts = token.split(":")
    if len(parts) != 3:
        return None
    user, timestamp_str, signature = parts

    # Check signature
    payload = f"{user}:{timestamp_str}"
    expected = hmac.new(
        settings.AUTH_SECRET.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None

    # Check expiry
    try:
        token_time = int(timestamp_str)
    except ValueError:
        return None
    max_age = settings.AUTH_MAX_AGE_DAYS * 86400
    if time.time() - token_time > max_age:
        return None

    return user


def validate_credentials(user: str, password: str) -> bool:
    """Check credentials against env vars."""
    return (
        hmac.compare_digest(user, settings.AUTH_USER)
        and hmac.compare_digest(password, settings.AUTH_PASS)
    )


def get_cookie_max_age() -> int:
    return settings.AUTH_MAX_AGE_DAYS * 86400


async def validate_ws_cookie(websocket: WebSocket) -> bool:
    """Validate auth cookie from WebSocket handshake headers."""
    cookie_header = websocket.headers.get("cookie", "")
    if not cookie_header:
        return False
    cookies = SimpleCookie(cookie_header)
    morsel = cookies.get(COOKIE_NAME)
    if morsel is None:
        return False
    return validate_token(morsel.value) is not None
```

- [ ] **Step 3: Verify module imports**

Run: `cd backend && python -c "from app.modules.auth.service import generate_token, validate_token, validate_credentials; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/auth/
git commit -m "feat(auth): add auth service with HMAC-SHA256 token and ws cookie validation"
```

### Task 3: Auth middleware — Pure ASGI for HTTP

**Files:**
- Create: `backend/app/modules/auth/middleware.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Implement pure ASGI middleware**

```python
# backend/app/modules/auth/middleware.py
from http.cookies import SimpleCookie
from typing import Any

from starlette.requests import HTTPConnection
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.modules.auth.service import COOKIE_NAME, validate_token

# Paths that skip auth (method, path)
_PUBLIC_PATHS: set[tuple[str, str]] = {
    ("POST", "/api/v1/auth/login"),
    ("GET", "/health"),
}


class AuthMiddleware:
    """Pure ASGI middleware for HTTP auth. Does NOT handle WebSocket."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Only intercept HTTP, not WebSocket or lifespan
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        conn = HTTPConnection(scope)
        method = scope.get("method", "GET")
        path = scope.get("path", "")

        # Check public paths
        if (method, path) in _PUBLIC_PATHS:
            await self.app(scope, receive, send)
            return

        # Allow static media files
        if path.startswith("/media/"):
            await self.app(scope, receive, send)
            return

        # Validate cookie
        cookie_value = conn.cookies.get(COOKIE_NAME)
        if cookie_value and validate_token(cookie_value) is not None:
            await self.app(scope, receive, send)
            return

        # Unauthorized
        response = JSONResponse(
            status_code=401,
            content={"detail": "Not authenticated"},
        )
        await response(scope, receive, send)
```

- [ ] **Step 2: Register middleware in main.py and update CORS**

In `main.py`, **replace the entire existing CORS middleware block** (including the `_cors_credentials` variable) with:

```python
from app.modules.auth.middleware import AuthMiddleware

# Middleware order: Starlette is LIFO — last added = outermost.
# Auth added FIRST (inner, runs first), CORS added SECOND (outer, wraps 401 responses with CORS headers).
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Also update `CORS_ORIGINS` default in `config.py`:

```python
CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:80", "http://localhost:8000"]
```

Remove the old `_cors_credentials` logic.

- [ ] **Step 4: Test that /health is accessible without auth**

Run: `curl -s http://localhost:8000/health`
Expected: `{"status":"ok","service":"loroapp-backend"}`

- [ ] **Step 5: Test that API returns 401 without cookie**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/clips/`
Expected: `401`

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/auth/middleware.py backend/app/main.py backend/app/config.py
git commit -m "feat(auth): add pure ASGI auth middleware with CORS integration"
```

### Task 4: Auth router — Login, logout, me endpoints

**Files:**
- Create: `backend/app/modules/auth/router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Implement auth router**

```python
# backend/app/modules/auth/router.py
from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.modules.auth.service import (
    COOKIE_NAME,
    generate_token,
    get_cookie_max_age,
    validate_credentials,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    user: str
    message: str


class MeResponse(BaseModel):
    user: str


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, response: Response) -> LoginResponse:
    if not validate_credentials(body.username, body.password):
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = generate_token(body.username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=get_cookie_max_age(),
        httponly=True,
        samesite="strict",
        path="/",
    )
    return LoginResponse(user=body.username, message="Login successful")


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"message": "Logged out"}


@router.get("/me", response_model=MeResponse)
async def me() -> MeResponse:
    # If we reach here, middleware already validated the cookie
    # For now return the configured user
    from app.config import settings
    return MeResponse(user=settings.AUTH_USER)
```

- [ ] **Step 2: Register router in main.py**

```python
from app.modules.auth.router import router as auth_router
app.include_router(auth_router, prefix=API_PREFIX)
```

- [ ] **Step 3: Test login flow**

```bash
# Login
curl -s -c cookies.txt -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"mtorres","password":"Password01"}'
# Expected: {"user":"mtorres","message":"Login successful"}

# Access protected route with cookie
curl -s -b cookies.txt http://localhost:8000/api/v1/clips/
# Expected: 200 with clips array

# Me endpoint
curl -s -b cookies.txt http://localhost:8000/api/v1/auth/me
# Expected: {"user":"mtorres"}

# Logout
curl -s -b cookies.txt -X POST http://localhost:8000/api/v1/auth/logout
# Expected: {"message":"Logged out"}

rm cookies.txt
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/auth/router.py backend/app/main.py
git commit -m "feat(auth): add login, logout, me endpoints"
```

---

## Chunk 2: Authentication (Frontend)

### Task 5: Frontend types and api-client auth support

**Files:**
- Modify: `frontend/src/core/api-client.ts`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Add `credentials: 'include'` to all fetch calls in api-client.ts**

In every `fetch()` call inside `apiClient` (get, post, put, del, upload), add `credentials: 'include'` to the options object. Example for `get`:

```typescript
async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    const res = await fetch(buildUrl(path, params), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
    })
    return parseResponse<T>(res)
  },
```

Do the same for `post`, `put`, `del`, `upload`.

- [ ] **Step 2: Add 401 redirect to parseResponse**

At the top of `parseResponse`, before the existing `if (!res.ok)` block:

```typescript
async function parseResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''

  // Redirect to login on 401 (unless already on /login)
  if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
    return new Promise(() => {}) // Never resolves — page is navigating
  }

  if (!res.ok) {
    // ... existing error handling
```

- [ ] **Step 3: Add new WebSocket types to types.ts**

Append to `WsEventType`:

```typescript
export type WsEventType =
  | 'sound_detected'
  | 'recording_started'
  | 'recording_stopped'
  | 'clip_started'
  | 'clip_finished'
  | 'session_started'
  | 'session_finished'
  | 'status_update'
  | 'error'
  | 'play_clip'
  | 'play_random'
  | 'stop'
  | 'start_recording'
  | 'stop_recording'
  | 'start_session'
  | 'pause'
  | 'resume'
  // Server/Host protocol
  | 'station_status'
  | 'station_connected'
  | 'station_disconnected'
  | 'station_heartbeat'
  | 'control_connected'
  | 'control_disconnected'
  | 'webrtc_offer'
  | 'webrtc_answer'
  | 'webrtc_ice_candidate'
  | 'webrtc_reset'
```

Extend `WsEvent` to include signaling fields:

```typescript
export interface WsEvent {
  type: WsEventType
  clip_id?: string
  clip_name?: string
  session_id?: string
  recording_id?: string
  volume?: number
  timestamp?: string
  message?: string
  payload?: Record<string, unknown>
  // Signaling fields
  sdp?: string
  candidate?: RTCIceCandidateInit
}
```

Add new interfaces at end of file:

```typescript
// ── Signaling types ─────────────────────────────────────────────────────────

export type SignalingMessage =
  | { type: 'webrtc_offer'; sdp: string }
  | { type: 'webrtc_answer'; sdp: string }
  | { type: 'webrtc_ice_candidate'; candidate: RTCIceCandidateInit }
  | { type: 'webrtc_reset' }

export interface StationStatusMessage {
  type: 'station_status'
  detection_active: boolean
  is_recording: boolean
  is_playing: boolean
  is_paused: boolean
  uptime_seconds: number
  last_sound_at: string | null
  stats: {
    clips_played: number
    recordings_made: number
    sessions_completed: number
    sounds_detected: number
  }
}

export interface StationHeartbeatMessage {
  type: 'station_heartbeat'
  battery: number | null
  firmware_version: string | null
  last_heartbeat: string
}

// ── Connection state (extended for auth) ────────────────────────────────────

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_failed' | 'replaced'
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/core/api-client.ts frontend/src/types.ts
git commit -m "feat(auth): add credentials include and new WS types for server/host protocol"
```

### Task 6: Login page

**Files:**
- Create: `frontend/src/app/login/page.tsx`
- Modify: `frontend/src/app/router.tsx`

- [ ] **Step 1: Create login page**

```typescript
// frontend/src/app/login/page.tsx
import { FormEvent, useState } from 'react'
import { getApiBaseUrl } from '@/core/api-client'

const LoginPage = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.detail ?? 'Credenciales invalidas')
        return
      }

      window.location.href = '/'
    } catch {
      setError('Error de conexion con el servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 2C8.5 2 6 4.5 6 7c0 1.5.6 2.8 1.5 3.8L7 12H5a2 2 0 00-2 2v1a5 5 0 005 5h8a5 5 0 005-5v-1a2 2 0 00-2-2h-2l-.5-1.2C17.4 9.8 18 8.5 18 7c0-2.5-2.5-5-6-5z" />
              <circle cx="15" cy="7" r="1" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">LoroApp</h1>
          <p className="text-slate-500 text-sm mt-1">Inicia sesion para continuar</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-400 mb-1">
              Usuario
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-400 mb-1">
              Contrasena
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Ingresando...' : 'Iniciar sesion'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
```

- [ ] **Step 2: Update router.tsx to add /login outside Layout**

```typescript
// frontend/src/app/router.tsx
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from '@/app/layout'

const LoginPage = lazy(() => import('@/app/login/page'))
// ... existing lazy imports ...

const AppRouter = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Login — no Layout wrapper */}
      <Route path="login" element={<LoginPage />} />

      <Route element={<Layout />}>
        {/* ... all existing routes ... */}
      </Route>
    </Routes>
  </Suspense>
)
```

- [ ] **Step 3: Verify login page renders**

Open http://localhost:5173/login in browser. Should see the login form with no sidebar.

- [ ] **Step 4: Test full login flow**

1. Open http://localhost:5173/ — should redirect to /login (401 from API)
2. Enter mtorres / Password01 → should redirect to dashboard
3. Refresh → should stay on dashboard (cookie persists)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/login/page.tsx frontend/src/app/router.tsx
git commit -m "feat(auth): add login page and route outside layout"
```

### Task 7: WebSocket close code handling

**Files:**
- Modify: `frontend/src/core/ws-client.ts`

- [ ] **Step 1: Update ConnectionState type import and close handler**

In `ws-client.ts`:

1. Replace the local `ConnectionState` type with an import:

```typescript
import type { ConnectionState } from '@/types'
```

2. Remove the local `export type ConnectionState = ...` definition.

3. Add a `sendRaw` method (matches `control-ws-client.ts`):

```typescript
sendRaw(message: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
    }
  }
```

4. Update `handleClose` to check close codes:

```typescript
private handleClose = (event: CloseEvent): void => {
    this.clearTimers()

    if (event.code === 4001) {
      this.setState('auth_failed')
      // Do NOT reconnect — redirect to login
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      return
    }

    if (event.code === 4002) {
      this.setState('replaced')
      // Do NOT reconnect — session replaced
      return
    }

    this.setState('disconnected')
    this.scheduleReconnect()
  }
```

Change the `onclose` assignment in `connect()`:

```typescript
this.socket.onclose = this.handleClose
```

This already works because `onclose` receives a `CloseEvent`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/core/ws-client.ts
git commit -m "feat(auth): handle 4001/4002 close codes in ws-client"
```

---

## Chunk 3: WebSocket Architecture (Backend)

### Task 8: ConnectionManager v2 — Dual connections + routing

**Files:**
- Modify: `backend/app/modules/station/websocket.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Rewrite ConnectionManager with dual connections**

Replace the entire `backend/app/modules/station/websocket.py`:

```python
import json
import logging
import random
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.database import async_session_factory
from app.modules.clips.models import Clip
from app.modules.station.commands import BaseCommand
from app.shared.events import EventType, event_bus

logger = logging.getLogger(__name__)

# Message types that get forwarded between station and control
_SIGNALING_TYPES = {"webrtc_offer", "webrtc_answer", "webrtc_ice_candidate"}

# Station events forwarded to control AND emitted to event_bus
_DUAL_ROUTE_TYPES = {"sound_detected", "recording_ready", "playback_finished"}

# Station events forwarded to control only
_CONTROL_ONLY_TYPES = {"station_status"}

# Event bus mapping for dual-routed types
_EVENT_MAP = {
    "sound_detected": EventType.SOUND_DETECTED,
    "recording_ready": EventType.RECORDING_READY,
    "playback_finished": EventType.CLIP_PLAYED,
}


class ConnectionManager:
    def __init__(self) -> None:
        self._station: WebSocket | None = None
        self._control: WebSocket | None = None
        self._station_last_heartbeat: datetime | None = None
        self._station_battery: float | None = None
        self._station_firmware: str | None = None

    @property
    def station_connected(self) -> bool:
        return self._station is not None

    @property
    def control_connected(self) -> bool:
        return self._control is not None

    # ── Connect / Disconnect ─────────────────────────────────────────

    async def connect_station(self, websocket: WebSocket) -> None:
        # Replace existing station if any
        if self._station is not None:
            try:
                await self._station.close(code=4002, reason="Replaced by new connection")
            except Exception:
                pass
            self._station = None

        await websocket.accept()
        self._station = websocket
        self._station_last_heartbeat = datetime.now(timezone.utc)
        logger.info("Station (Host) connected")

        # Notify control
        await self._send_to_control({"type": "station_connected"})

    async def connect_control(self, websocket: WebSocket) -> None:
        # Replace existing control if any
        if self._control is not None:
            try:
                await self._control.close(code=4002, reason="Replaced by new connection")
            except Exception:
                pass
            self._control = None

        await websocket.accept()
        self._control = websocket
        logger.info("Control (Server) connected")

        # Notify station
        await self._send_to_station({"type": "control_connected"})

        # Send current station status to new control
        if self._station is not None:
            await self._send_to_control({"type": "station_connected"})

    def disconnect_station(self) -> None:
        self._station = None
        self._station_last_heartbeat = None
        logger.info("Station (Host) disconnected")

    def disconnect_control(self) -> None:
        self._control = None
        logger.info("Control (Server) disconnected")

    async def notify_station_disconnected(self) -> None:
        """Called after disconnect_station to notify control."""
        await self._send_to_control({"type": "station_disconnected"})

    async def notify_control_disconnected(self) -> None:
        """Called after disconnect_control to notify station."""
        await self._send_to_station({"type": "control_disconnected"})
        await self._send_to_station({"type": "webrtc_reset"})

    # ── Send helpers ─────────────────────────────────────────────────

    async def send_command(self, command: BaseCommand) -> None:
        """Send a structured command to the station (used by scheduler/responses)."""
        if self._station is None:
            raise RuntimeError("No station connected")
        payload = json.dumps(command.to_ws_message())
        await self._station.send_text(payload)
        logger.debug("Sent command: %s", command.type)

    async def _send_to_station(self, message: dict[str, Any]) -> None:
        if self._station is None:
            return
        try:
            await self._station.send_text(json.dumps(message))
        except Exception:
            pass

    async def _send_to_control(self, message: dict[str, Any]) -> None:
        if self._control is None:
            return
        try:
            await self._control.send_text(json.dumps(message))
        except Exception:
            pass

    # ── Message routing ──────────────────────────────────────────────

    async def handle_station_message(self, raw: str) -> None:
        """Route incoming message from station (Host)."""
        try:
            data: dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid JSON from station: %s", raw[:200])
            return

        msg_type: str = data.get("type", "")
        logger.debug("Station message: %s", msg_type)

        # Signaling — forward to control
        if msg_type in _SIGNALING_TYPES:
            await self._send_to_control(data)
            return

        # Heartbeat — handle locally + forward battery to control
        if msg_type in ("ping", "heartbeat"):
            self._station_last_heartbeat = datetime.now(timezone.utc)
            self._station_battery = data.get("battery")
            self._station_firmware = data.get("firmware_version")
            await self._send_to_station({"type": "pong"})
            await self._send_to_control({
                "type": "station_heartbeat",
                "battery": self._station_battery,
                "firmware_version": self._station_firmware,
                "last_heartbeat": self._station_last_heartbeat.isoformat(),
            })
            return

        # Dual-routed — forward to control AND emit to event_bus
        if msg_type in _DUAL_ROUTE_TYPES:
            await self._send_to_control(data)
            event_type = _EVENT_MAP.get(msg_type)
            if event_type:
                await event_bus.emit(event_type, data)
            return

        # Control-only — forward to control
        if msg_type in _CONTROL_ONLY_TYPES:
            await self._send_to_control(data)
            return

        # play_random — handled by backend
        if msg_type == "play_random":
            await self._handle_play_random()
            return

        # pause/resume — log and forward
        if msg_type in ("pause", "resume"):
            logger.info("Station %s", msg_type)
            await self._send_to_control(data)
            return

        logger.warning("Unknown station message type: %s", msg_type)

    async def handle_control_message(self, raw: str) -> None:
        """Route incoming message from control (Server)."""
        try:
            data: dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid JSON from control: %s", raw[:200])
            return

        msg_type: str = data.get("type", "")
        logger.debug("Control message: %s", msg_type)

        # Signaling — forward to station
        if msg_type in _SIGNALING_TYPES:
            await self._send_to_station(data)
            return

        # Heartbeat from control
        if msg_type in ("ping", "heartbeat"):
            await self._send_to_control({"type": "pong"})
            return

        # play_random — handled by backend, not forwarded
        if msg_type == "play_random":
            await self._handle_play_random()
            return

        # All other commands — forward to station
        await self._send_to_station(data)

    async def _handle_play_random(self) -> None:
        try:
            async with async_session_factory() as db:
                result = await db.execute(select(Clip))
                clips = result.scalars().all()
            if not clips:
                logger.warning("No clips for play_random")
                return
            clip = random.choice(clips)
            msg = {
                "type": "play_clip",
                "clip_id": str(clip.id),
                "clip_name": clip.name,
            }
            await self._send_to_station(msg)
            await self._send_to_control(msg)
        except Exception as exc:
            logger.error("play_random error: %s", exc, exc_info=True)


# Module-level singleton
connection_manager = ConnectionManager()


async def station_websocket_handler(websocket: WebSocket) -> None:
    """Entry point for /ws/station (Host device)."""
    from app.modules.auth.service import validate_ws_cookie

    if not await validate_ws_cookie(websocket):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await connection_manager.connect_station(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            await connection_manager.handle_station_message(raw)
    except WebSocketDisconnect:
        connection_manager.disconnect_station()
        await connection_manager.notify_station_disconnected()
    except Exception as exc:
        logger.error("Station WS error: %s", exc, exc_info=True)
        connection_manager.disconnect_station()
        await connection_manager.notify_station_disconnected()


async def control_websocket_handler(websocket: WebSocket) -> None:
    """Entry point for /ws/control (Server/owner device)."""
    from app.modules.auth.service import validate_ws_cookie

    if not await validate_ws_cookie(websocket):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await connection_manager.connect_control(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            await connection_manager.handle_control_message(raw)
    except WebSocketDisconnect:
        connection_manager.disconnect_control()
        await connection_manager.notify_control_disconnected()
    except Exception as exc:
        logger.error("Control WS error: %s", exc, exc_info=True)
        connection_manager.disconnect_control()
        await connection_manager.notify_control_disconnected()
```

- [ ] **Step 2: Add /ws/control endpoint in main.py**

```python
from app.modules.station.websocket import station_websocket_handler, control_websocket_handler

# Replace existing ws_station endpoint:
@app.websocket("/ws/station")
async def ws_station(websocket: WebSocket) -> None:
    await station_websocket_handler(websocket)

@app.websocket("/ws/control")
async def ws_control(websocket: WebSocket) -> None:
    await control_websocket_handler(websocket)
```

- [ ] **Step 3: Verify both endpoints accept connections**

Start backend, test with: `python -c "import asyncio, websockets; asyncio.run(websockets.connect('ws://localhost:8000/ws/station'))"` — should get 4001 (no auth).

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/station/websocket.py backend/app/main.py
git commit -m "feat(ws): ConnectionManager v2 with dual connections and message routing"
```

---

## Chunk 4: WebSocket (Frontend) + Control Client

### Task 9: Control WebSocket client

**Files:**
- Create: `frontend/src/core/control-ws-client.ts`

- [ ] **Step 1: Create control-ws-client.ts**

```typescript
// frontend/src/core/control-ws-client.ts
// WebSocket client for /ws/control (Server/owner side)

import type { ConnectionState, WsCommand, WsEvent, WsEventType } from '@/types'
import { getApiBaseUrl } from '@/core/api-client'

const getControlWsUrl = (): string => {
  const apiUrl = getApiBaseUrl()
  const wsProtocol = apiUrl.startsWith('https') ? 'wss' : 'ws'
  return apiUrl.replace(/^https?/, wsProtocol) + '/ws/control'
}

const HEARTBEAT_INTERVAL = 15_000
const MAX_BACKOFF = 30_000

type CommandHandler = (event: WsEvent) => void

class ControlWsClient {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private handlers = new Map<WsEventType | '*', Set<CommandHandler>>()
  private stateListeners = new Set<(state: ConnectionState) => void>()

  state: ConnectionState = 'disconnected'

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) return
    this.setState('connecting')
    this.socket = new WebSocket(getControlWsUrl())
    this.socket.onopen = this.handleOpen
    this.socket.onmessage = this.handleMessage
    this.socket.onclose = this.handleClose
    this.socket.onerror = this.handleError
  }

  disconnect(): void {
    this.clearTimers()
    this.socket?.close()
    this.socket = null
    this.setState('disconnected')
  }

  send(command: WsCommand): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(command))
    }
  }

  sendRaw(message: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
    }
  }

  onCommand(type: WsEventType | '*', handler: CommandHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)
    return () => this.handlers.get(type)?.delete(handler)
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  private setState(state: ConnectionState): void {
    this.state = state
    this.stateListeners.forEach((l) => l(state))
  }

  private handleOpen = (): void => {
    this.reconnectAttempts = 0
    this.setState('connected')
    this.startHeartbeat()
  }

  private handleMessage = (event: MessageEvent): void => {
    let parsed: WsEvent
    try {
      parsed = JSON.parse(event.data as string) as WsEvent
    } catch {
      return
    }

    const specific = this.handlers.get(parsed.type)
    if (specific) specific.forEach((h) => h(parsed))

    const wildcard = this.handlers.get('*')
    if (wildcard) wildcard.forEach((h) => h(parsed))
  }

  private handleClose = (event: CloseEvent): void => {
    this.clearTimers()

    if (event.code === 4001) {
      this.setState('auth_failed')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      return
    }

    if (event.code === 4002) {
      this.setState('replaced')
      return
    }

    this.setState('disconnected')
    this.scheduleReconnect()
  }

  private handleError = (): void => {
    this.setState('error')
    this.socket?.close()
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1_000 * 2 ** this.reconnectAttempts, MAX_BACKOFF)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }))
      }
    }, HEARTBEAT_INTERVAL)
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer)
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer)
    this.reconnectTimer = null
    this.heartbeatTimer = null
  }
}

export const controlWsClient = new ControlWsClient()
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/core/control-ws-client.ts
git commit -m "feat(ws): add control-ws-client for server/owner side"
```

---

## Chunk 5: WebRTC Hooks

### Task 10: use-webrtc hook

**Files:**
- Create: `frontend/src/hooks/use-webrtc.ts`

- [ ] **Step 1: Implement use-webrtc hook**

```typescript
// frontend/src/hooks/use-webrtc.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SignalingMessage } from '@/types'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

interface UseWebRTCOptions {
  role: 'caller' | 'answerer'
  onRemoteStream: (stream: MediaStream) => void
  sendSignaling: (message: SignalingMessage) => void
}

interface UseWebRTCReturn {
  start: (localStream: MediaStream) => Promise<void>
  stop: () => void
  handleSignaling: (message: SignalingMessage) => Promise<void>
  connectionState: RTCPeerConnectionState | 'new'
  localAudioTrack: MediaStreamTrack | null
}

export const useWebRTC = ({ role, onRemoteStream, sendSignaling }: UseWebRTCOptions): UseWebRTCReturn => {
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | 'new'>('new')
  const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null)

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    setConnectionState('new')
    setLocalAudioTrack(null)
  }, [])

  const createPeerConnection = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection(RTC_CONFIG)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignaling({
          type: 'webrtc_ice_candidate',
          candidate: event.candidate.toJSON(),
        })
      }
    }

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        onRemoteStream(event.streams[0])
      }
    }

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanup()
      }
    }

    pcRef.current = pc
    return pc
  }, [sendSignaling, onRemoteStream, cleanup])

  const start = useCallback(async (localStream: MediaStream) => {
    cleanup()
    const pc = createPeerConnection()

    // Add local tracks
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream)
      if (track.kind === 'audio' && role === 'caller') {
        // Caller mutes audio by default (push-to-talk)
        track.enabled = false
        setLocalAudioTrack(track)
      }
    }

    if (role === 'caller') {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendSignaling({ type: 'webrtc_offer', sdp: offer.sdp! })
    }
    // Answerer waits for offer via handleSignaling
  }, [role, createPeerConnection, sendSignaling, cleanup])

  const handleSignaling = useCallback(async (message: SignalingMessage) => {
    if (message.type === 'webrtc_reset') {
      cleanup()
      return
    }

    let pc = pcRef.current

    if (message.type === 'webrtc_offer' && role === 'answerer') {
      // Answerer receives offer — create PC if needed
      if (!pc) {
        // Answerer needs to call start() first to provide local stream
        // This case means the offer arrived before start() — store and handle after
        return
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignaling({ type: 'webrtc_answer', sdp: answer.sdp! })
      return
    }

    if (message.type === 'webrtc_answer' && role === 'caller' && pc) {
      await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp })
      return
    }

    if (message.type === 'webrtc_ice_candidate' && pc) {
      await pc.addIceCandidate(message.candidate)
    }
  }, [role, sendSignaling, cleanup])

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  return {
    start,
    stop: cleanup,
    handleSignaling,
    connectionState,
    localAudioTrack,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/use-webrtc.ts
git commit -m "feat(webrtc): add use-webrtc hook with caller/answerer roles"
```

### Task 11: use-camera hook

**Files:**
- Create: `frontend/src/hooks/use-camera.ts`

- [ ] **Step 1: Implement use-camera hook**

```typescript
// frontend/src/hooks/use-camera.ts
import { useCallback, useRef, useState } from 'react'

interface UseCameraReturn {
  stream: MediaStream | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  start: (constraints?: MediaStreamConstraints) => Promise<MediaStream>
  stop: () => void
  capturePhoto: () => string | null
  isActive: boolean
}

export const useCamera = (): UseCameraReturn => {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const start = useCallback(async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
    const defaultConstraints: MediaStreamConstraints = {
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
      ...constraints,
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia(defaultConstraints)
    setStream(mediaStream)
    setIsActive(true)

    if (videoRef.current) {
      videoRef.current.srcObject = mediaStream
    }

    return mediaStream
  }, [])

  const stop = useCallback(() => {
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
    }
    setStream(null)
    setIsActive(false)
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [stream])

  const capturePhoto = useCallback((): string | null => {
    if (!videoRef.current || !isActive) return null

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    const video = videoRef.current

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/png')
  }, [isActive])

  return { stream, videoRef, start, stop, capturePhoto, isActive }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/use-camera.ts
git commit -m "feat(camera): add use-camera hook with photo capture"
```

---

## Chunk 6: Remote Control Page (Server)

### Task 12: Remote Control page

**Files:**
- Create: `frontend/src/app/remote-control/page.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Create Remote Control page**

Create `frontend/src/app/remote-control/page.tsx` with:
- Two-column layout (video left, controls right)
- Connect to `/ws/control` via `controlWsClient`
- WebRTC caller via `useWebRTC`
- Push-to-talk button (mousedown/touchstart → unmute, mouseup/touchend → mute)
- Quick actions grid (play random, record, training, pause)
- Host status panel (from `station_status` and `station_heartbeat` messages)
- Photo capture button on video overlay
- Video `<video>` element for remote stream

The page listens for:
- `station_connected` / `station_disconnected` — show/hide controls
- `station_status` — update host status panel
- `station_heartbeat` — update battery/uptime
- `webrtc_answer` / `webrtc_ice_candidate` — pass to `useWebRTC.handleSignaling`
- `play_clip` / `playback_finished` — show playing indicator

This is a large component (~400 lines). Implementation should follow existing patterns from `station/page.tsx`.

- [ ] **Step 2: Add route in router.tsx**

Add lazy import and route:

```typescript
const RemoteControlPage = lazy(() => import('@/app/remote-control/page'))

// Inside <Route element={<Layout />}>:
<Route path="remote-control" element={<RemoteControlPage />} />
```

- [ ] **Step 3: Add nav entry in layout.tsx**

In the `NAV_SECTIONS` array, in the "Estacion" section, add after the Station item:

```typescript
{
  to: '/remote-control',
  label: 'Control Remoto',
  tooltip: 'Controla el Host remotamente: camara, walkie talkie y acciones',
  icon: <IconRemote />,
},
```

Add the icon component:

```typescript
const IconRemote = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)
```

- [ ] **Step 4: Verify page loads and WS connects**

Navigate to http://localhost:5173/remote-control. Should see the UI with "Host disconnected" state.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/remote-control/page.tsx frontend/src/app/router.tsx frontend/src/app/layout.tsx
git commit -m "feat(remote): add Remote Control page with video, walkie talkie, and actions"
```

---

## Chunk 7: Station Mode Enhancements (Host)

### Task 13: Station page — Add camera, WebRTC answerer, status emission

**Files:**
- Modify: `frontend/src/app/station/page.tsx`

- [ ] **Step 1: Add camera preview and WebRTC answerer**

At the top of `StationPage`, add:

```typescript
import { useWebRTC } from '@/hooks/use-webrtc'
import { useCamera } from '@/hooks/use-camera'
```

Add state and hooks:

```typescript
const { stream: cameraStream, videoRef: cameraPreviewRef, start: startCamera, stop: stopCamera, isActive: cameraActive } = useCamera()
const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null)
const [ownerConnected, setOwnerConnected] = useState(false)
const remoteAudioRef = useRef<HTMLAudioElement | null>(null)

const { start: startWebRTC, stop: stopWebRTC, handleSignaling, connectionState: rtcState } = useWebRTC({
  role: 'answerer',
  onRemoteStream: (stream) => {
    setRemoteAudioStream(stream)
    // Play audio from server through speaker
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream
      remoteAudioRef.current.play().catch(() => {})
    }
  },
  sendSignaling: (msg) => wsClient.sendRaw(msg as Record<string, unknown>),
})
```

- [ ] **Step 2: Handle WebRTC signaling messages from WS**

```typescript
useWsCommand('webrtc_offer', (e) => {
  if (e.sdp) void handleSignaling({ type: 'webrtc_offer', sdp: e.sdp })
})
useWsCommand('webrtc_ice_candidate', (e) => {
  if (e.candidate) void handleSignaling({ type: 'webrtc_ice_candidate', candidate: e.candidate })
})
useWsCommand('webrtc_reset', () => {
  void handleSignaling({ type: 'webrtc_reset' })
  setOwnerConnected(false)
})
useWsCommand('control_connected', () => setOwnerConnected(true))
useWsCommand('control_disconnected', () => {
  setOwnerConnected(false)
  void handleSignaling({ type: 'webrtc_reset' })
})
```

- [ ] **Step 3: Request camera on station start and setup WebRTC answerer**

In `handleStartStation`, after starting the detector, add:

```typescript
// Start camera for WebRTC
try {
  const mediaStream = await startCamera({ video: { facingMode: 'environment' }, audio: true })
  // WebRTC answerer: start with local stream, ready to receive offers
  await startWebRTC(mediaStream)
} catch {
  // Camera denied — WebRTC won't work but station still functions
}
```

In `handleStopStation`, add:

```typescript
stopWebRTC()
stopCamera()
setOwnerConnected(false)
```

- [ ] **Step 4: Emit station_status every 10 seconds**

Use `sendRaw` (added to `ws-client.ts` in Task 7) instead of `send` to avoid type casting:

```typescript
// Import wsClient singleton directly for sendRaw
import { wsClient } from '@/core/ws-client'

useEffect(() => {
  if (!stationActive) return
  const emitStatus = () => {
    wsClient.sendRaw({
      type: 'station_status',
      detection_active: detectionActive,
      is_recording: isRecording,
      is_playing: isPlaying,
      is_paused: isPaused,
      uptime_seconds: uptime,
      last_sound_at: lastSoundTime?.toISOString() ?? null,
      stats: stats ?? { clips_played: 0, recordings_made: 0, sessions_completed: 0, sounds_detected: 0 },
    })
  }
  const id = setInterval(emitStatus, 10_000)
  return () => clearInterval(id)
}, [stationActive, detectionActive, isRecording, isPlaying, isPaused, uptime, lastSoundTime, stats])
```

- [ ] **Step 5: Add camera preview and owner indicator to UI**

In the active state JSX, add after the top bar badges:

```tsx
{ownerConnected && (
  <span className="bg-brand-900/40 text-brand-400 px-2 py-0.5 rounded-md">Dueno conectado</span>
)}
```

Before the closing `</div>` of the main content, add camera preview:

```tsx
{/* Camera preview */}
{cameraActive && (
  <div className="fixed bottom-24 right-4 w-24 h-32 rounded-xl overflow-hidden border-2 border-slate-700 shadow-lg z-20">
    <video
      ref={cameraPreviewRef}
      autoPlay
      playsInline
      muted
      className="w-full h-full object-cover"
    />
    {rtcState === 'connected' && (
      <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400" />
    )}
  </div>
)}

{/* Hidden audio element for server audio */}
<audio ref={remoteAudioRef} autoPlay />
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/station/page.tsx
git commit -m "feat(station): add camera preview, WebRTC answerer, and status emission"
```

---

## Chunk 8: Config & Docker

### Task 14: Update docker-compose and env files

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `backend/.env` (if exists, for local dev)

- [ ] **Step 1: Update docker-compose.yml**

```yaml
  backend:
    build: ./backend
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql+asyncpg://loroapp:${DB_PASSWORD:-loroapp_secret}@db:5432/loroapp
      MEDIA_PATH: /app/media
      CORS_ORIGINS: '["http://localhost:80", "http://localhost:5173"]'
      AUTH_USER: ${AUTH_USER:-mtorres}
      AUTH_PASS: ${AUTH_PASS:-Password01}
    volumes:
      - media_data:/app/media
    ports:
      - "8000:8000"
```

- [ ] **Step 2: Note on docker-compose.dev.yml**

`docker-compose.dev.yml` only defines a `db` service for local dev. For local backend dev without Docker, auth env vars go in `backend/.env` (already created in Task 1, Step 3). No changes needed to `docker-compose.dev.yml`.

- [ ] **Step 3: Update .env.example**

```env
DB_PASSWORD=loroapp_secret

# Auth
AUTH_USER=mtorres
AUTH_PASS=Password01
# AUTH_SECRET=  # Auto-generated if empty. Set for zero-downtime deploys.
# AUTH_MAX_AGE_DAYS=30
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add auth env vars to docker-compose and env.example"
```

---

## Chunk 9: Integration Testing

### Task 15: Manual integration test

- [ ] **Step 1: Start backend and frontend**

```bash
# Terminal 1:
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 2:
cd frontend && npm run dev
```

- [ ] **Step 2: Test auth flow**

1. Open http://localhost:5173/ → should redirect to /login
2. Enter wrong password → should show error
3. Enter mtorres / Password01 → should redirect to dashboard
4. All pages should load normally
5. Open DevTools → Application → Cookies → should see `loro_session`

- [ ] **Step 3: Test Server/Host flow**

1. **Tab 1 (Server):** Navigate to /remote-control
2. **Tab 2 or Phone (Host):** Navigate to /station → Click "Iniciar Estacion"
3. Server should show "Host conectado" and stats
4. Click "Connect Camera/Walkie" on Server → should see video from Host camera
5. Hold push-to-talk → audio should play on Host device
6. Audio from Host should play on Server
7. Click photo capture → should download PNG
8. Quick actions (play random, record) should work

- [ ] **Step 4: Test disconnect/reconnect**

1. Close Host tab → Server should show "Host disconnected"
2. Reopen Host station → Server should show "Host connected"
3. Click Connect again → WebRTC should re-establish
4. Refresh Server tab → Host should get `webrtc_reset`, ready for new connection

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration test fixes for server/host auth webrtc"
```
