# Server/Host Architecture + Auth + WebRTC

**Date:** 2026-03-12
**Status:** Approved

## Overview

Transform LoroApp from a single-user open app into a two-device system with authentication:
- **Server** (owner's PC/laptop): Full web app + new Remote Control panel
- **Host** (phone/tablet near parrot): Enhanced Station mode with camera + walkie talkie
- **Auth**: Basic Auth protecting all routes (HTTP + WebSocket)
- **Media streaming**: WebRTC peer-to-peer for bidirectional audio + unidirectional video (Host → Server)

## 1. Authentication — Basic Auth with Cookie

### Flow

1. User opens any route → backend middleware checks `loro_session` cookie
2. Missing/invalid cookie → frontend detects 401 → redirects to `/login`
3. User submits credentials → `POST /api/v1/auth/login`
4. Backend validates against ENV vars → sets HTTP-only signed cookie
5. All subsequent requests (HTTP + WebSocket) include cookie automatically

### Backend Implementation

**New module: `app/modules/auth/`**

- **`service.py`**: Validates credentials, generates/verifies HMAC-SHA256 token with expiry check
- **`middleware.py`**: Starlette pure ASGI middleware (NOT `BaseHTTPMiddleware`) that intercepts HTTP requests. WebSocket auth is handled separately inside each WebSocket endpoint handler.
- **`router.py`**: Login and logout endpoints

**Config additions (`app/config.py`):**

```python
AUTH_USER: str = ""      # Required — startup fails if empty
AUTH_PASS: str = ""      # Required — startup fails if empty
AUTH_SECRET: str = ""    # Auto-generated if empty (see below)
AUTH_MAX_AGE_DAYS: int = 30  # Cookie max age in days

@model_validator(mode="after")
def _generate_auth_secret(self) -> "Settings":
    """Generate a stable AUTH_SECRET at config load time if not provided.
    Uses secrets.token_hex(32). Because this runs in the model validator,
    it executes exactly once when Settings() is instantiated (module-level
    singleton). The generated secret persists for the lifetime of the process.
    On restart without a persisted AUTH_SECRET env var, a NEW secret is
    generated — this is acceptable because cookies have Max-Age and users
    simply re-login. For zero-downtime deployments, set AUTH_SECRET explicitly."""
    if not self.AUTH_SECRET:
        import secrets
        object.__setattr__(self, "AUTH_SECRET", secrets.token_hex(32))
    return self
```

A startup guard in `lifespan()` checks that `AUTH_USER` and `AUTH_PASS` are non-empty. If either is empty, the app logs an error and raises `SystemExit(1)`. Default values are provided via `docker-compose.yml` and `.env.example` only (not in code). The `AUTH_SECRET` auto-generation is intentionally in the `@model_validator` — if the process restarts without a persisted secret, existing cookies become invalid and users re-login (acceptable tradeoff for dev simplicity).

**Cookie format:**
- Name: `loro_session`
- Value: `{user}:{timestamp}:{hmac_sha256(user:timestamp, secret)}`
- Flags: HTTP-only, SameSite=Strict, Path=/
- Max-Age: `AUTH_MAX_AGE_DAYS * 86400` seconds (default 30 days)
- Token validation: middleware verifies HMAC signature AND checks that `timestamp` is within `AUTH_MAX_AGE_DAYS` from current time. Expired tokens return 401.

**Why SameSite=Strict:** SameSite=Lax does NOT protect WebSocket upgrade requests (they are GET). SameSite=Strict prevents any cross-site request from sending the cookie, closing CSRF on both HTTP and WebSocket surfaces.

**Middleware exclusions (HTTP only):**
- `POST /api/v1/auth/login`
- `GET /health`

**WebSocket auth (inside endpoint handlers, NOT in middleware):**
- FastAPI's `BaseHTTPMiddleware` does not intercept WebSocket ASGI scopes reliably
- Each WebSocket endpoint reads the cookie from `websocket.headers.get("cookie")`, parses it, and validates the token BEFORE calling `websocket.accept()`
- Invalid or missing token → `websocket.close(code=4001, reason="Unauthorized")`
- Helper function `validate_ws_cookie(websocket) -> bool` in `auth/service.py` encapsulates this logic

**Auth endpoints:**
- `POST /api/v1/auth/login` — Validates credentials, sets `loro_session` cookie
- `POST /api/v1/auth/logout` — Clears cookie via `Set-Cookie: loro_session=; Max-Age=0; Path=/`
- `GET /api/v1/auth/me` — Returns `{"user": "..."}` if authenticated, 401 otherwise (for frontend to check auth state)

### Frontend Implementation

**New page: `app/login/page.tsx`**
- Simple form: username + password fields
- POST to `/api/v1/auth/login` with `credentials: 'include'`
- On success: redirect to `/` (cookie set by backend response)
- On failure: show error message

**Changes to `core/api-client.ts`:**
- Add `credentials: 'include'` to ALL fetch calls (required for cross-origin cookie sending during development — Vite on :5173, backend on :8000)
- Detect 401 responses → `window.location.href = '/login'` (except when already on /login)

**Changes to `app/router.tsx`:**
- `/login` route OUTSIDE `<Route element={<Layout />}>` — no sidebar, no auth
- Follow existing pattern: `layout.tsx` already has `isStation` check for fullscreen pages — add `isLogin` check for `/login` path OR simply place `/login` route before the Layout route

## 2. WebSocket Architecture — Two Endpoints

### Current State

Single endpoint `/ws/station` with a singleton `ConnectionManager` that accepts one WebSocket connection (the Host/station).

### New Architecture

Two WebSocket endpoints, one `ConnectionManager` that knows both:

| Endpoint | Client | Purpose |
|---|---|---|
| `/ws/station` | Host (phone/tablet) | Existing station protocol + WebRTC signaling |
| `/ws/control` | Server (owner's browser) | Send commands to Host + receive status + WebRTC signaling |

Both endpoints registered directly in `main.py` (same pattern as existing `/ws/station`).

### ConnectionManager v2

```python
class ConnectionManager:
    _station: WebSocket | None   # Host connection
    _control: WebSocket | None   # Server connection

    async def connect_station(ws) -> None
    async def connect_control(ws) -> None
    def disconnect_station() -> None
    def disconnect_control() -> None
    async def send_to_station(message) -> None
    async def send_to_control(message) -> None
    async def handle_station_message(raw) -> None  # Routes to control if needed
    async def handle_control_message(raw) -> None  # Routes to station if needed
```

**Concurrent connection policy:**
- Only ONE station and ONE control connection at a time
- When a new station connects while one is already active: close the old connection with code 4002 ("Replaced by new connection"), then accept the new one
- Same policy for control connections
- On station disconnect: send `{"type": "station_disconnected"}` to control (if connected)
- On control disconnect: send `{"type": "control_disconnected"}` to station (if connected), and send `{"type": "webrtc_reset"}` so station can tear down its RTCPeerConnection

**Message routing logic:**
- Messages with `type: "webrtc_offer"`, `"webrtc_answer"`, `"webrtc_ice_candidate"` are forwarded between station ↔ control
- Command messages from control are forwarded to station
- Status messages from station are forwarded to control AND processed locally (event_bus)
- Heartbeat (`ping`/`pong`) handled locally per connection; battery/firmware data from station heartbeat is forwarded to control as `{"type": "station_heartbeat", "battery": ..., "firmware_version": ...}`

### WebSocket Message Types

**Control → Backend → Station:**
- `webrtc_offer` — SDP offer from Server
- `webrtc_ice_candidate` — ICE candidate from Server
- `play_clip` — Forwarded as-is (matches existing `handle_incoming` case in station page)
- `stop` — Stop playback
- `start_recording`, `stop_recording` — Recording commands
- `start_session` — Start training session
- `pause`, `resume` — Pause/resume station
- `play_random` — Play random clip (existing, handled by backend's `_handle_play_random`)

Note: The existing `commands.py` defines typed command models (`PlayCommand` with type `"play"`, `RecordCommand` with type `"record"`, etc.) used by the scheduler/response engine. The WebSocket protocol between frontend and backend uses different type names (`play_clip`, `start_recording`). The ConnectionManager routes control messages using the **frontend WebSocket protocol names**, not the `commands.py` types. No changes to `commands.py` are needed.

**Station → Backend → Control:**
- `webrtc_answer` — SDP answer from Host
- `webrtc_ice_candidate` — ICE candidate from Host
- `sound_detected` — Forwarded to control AND emitted to event_bus (dual routing)
- `recording_ready` — Forwarded to control AND emitted to event_bus
- `playback_finished` — Forwarded to control (Remote Control uses it to clear "playing" indicator and update clips_played count) AND emitted to event_bus
- `station_status` — Periodic status update, forwarded to control only

**Backend → Control (originated by backend):**
- `station_connected` — When Host connects
- `station_disconnected` — When Host disconnects
- `station_heartbeat` — Forwarded from station ping:

```json
{
  "type": "station_heartbeat",
  "battery": 78,
  "firmware_version": "1.2.3",
  "last_heartbeat": "2026-03-12T14:32:05Z"
}
```

**Backend → Station (originated by backend):**
- `control_connected` — When Server connects
- `control_disconnected` — When Server disconnects (triggers WebRTC teardown)
- `webrtc_reset` — Sent with `control_disconnected` to signal WebRTC cleanup

**`station_status` message schema:**
```json
{
  "type": "station_status",
  "detection_active": true,
  "is_recording": false,
  "is_playing": false,
  "is_paused": false,
  "uptime_seconds": 3600,
  "last_sound_at": "2026-03-12T14:32:05Z",
  "stats": {
    "clips_played": 15,
    "recordings_made": 23,
    "sessions_completed": 2,
    "sounds_detected": 45
  }
}
```
Emitted by station page every 10 seconds when station is active.

### Frontend WebSocket Clients

**New file: `core/control-ws-client.ts`**
- Same reconnect/heartbeat pattern as `ws-client.ts` but connects to `/ws/control`
- Extends `ConnectionState` type to include `'auth_failed'` and `'replaced'` states
- **Close code handling:**
  - 4001 (auth failure) → set state to `'auth_failed'`, stop reconnecting. UI layer detects this state and redirects to `/login`
  - 4002 (replaced) → set state to `'replaced'`, stop reconnecting. UI shows "session replaced" toast
  - Normal close → existing exponential backoff reconnect behavior
- Used only by the Remote Control page
- Singleton instance

**Existing `core/ws-client.ts`:**
- Add same 4001/4002 close code handling with extended `ConnectionState` type
- No other changes

**Updated `ConnectionState` type (both clients):**
```typescript
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_failed' | 'replaced'
```

## 3. WebRTC — Audio Bidirectional + Video Unidirectional

### Connection Flow

1. Server user clicks "Connect" on Remote Control page
2. Server creates `RTCPeerConnection` with STUN config
3. Server calls `getUserMedia({audio: true})` for mic access
4. Server adds audio track to peer connection (muted by default)
5. Server creates SDP offer → sends via `/ws/control`
6. Backend forwards offer to Host via `/ws/station`
7. Host receives offer, creates `RTCPeerConnection`
8. Host calls `getUserMedia({audio: true, video: true})` for mic + camera
9. Host adds audio + video tracks to peer connection
10. Host creates SDP answer → sends via `/ws/station`
11. Backend forwards answer to Server via `/ws/control`
12. ICE candidates exchanged bidirectionally via same WebSocket path
13. P2P connection established — media flows directly

### Disconnect/Recovery Handling

**Host disconnects (phone dies, network drops):**
- Server's `RTCPeerConnection` fires `onconnectionstatechange` → state becomes `"disconnected"` then `"failed"`
- `use-webrtc` hook detects `"failed"` state → calls `stop()` automatically, cleans up peer connection
- Remote Control page shows "Host disconnected" state
- Backend sends `station_disconnected` to control via WebSocket
- When Host reconnects → Server can re-initiate WebRTC by clicking "Connect" again

**Server refreshes/reconnects (browser tab refresh):**
- Backend detects control WebSocket close → sends `control_disconnected` + `webrtc_reset` to station
- Host's `use-webrtc` hook receives `webrtc_reset` → tears down existing `RTCPeerConnection`
- Host is now ready to accept a new offer
- New Server page mounts → connects `/ws/control` → user clicks "Connect" → new WebRTC session

**WebSocket drops but WebRTC stays alive:**
- WebRTC P2P connection is independent of WebSocket — media continues flowing
- Signaling channel (WebSocket) reconnects automatically
- No action needed unless WebRTC itself fails

### ICE Configuration

```javascript
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
}
```

STUN only for first version. Sufficient for LAN and most NAT configurations.

### Media Tracks

| Direction | Track | Purpose |
|---|---|---|
| Server → Host | Audio | Owner's voice to parrot (push-to-talk, muted by default) |
| Host → Server | Audio | Parrot/environment sounds to owner (always on) |
| Host → Server | Video | Camera feed to owner (always on when WebRTC active) |

### Push-to-Talk Implementation

- Server audio track is added to peer connection but **muted by default** (`track.enabled = false`)
- When user holds the push-to-talk button: `track.enabled = true`
- When user releases: `track.enabled = false`
- No renegotiation needed — mute/unmute is instant

### Photo Capture

- Done entirely on the Server side — no additional Host logic needed
- Capture frame from `<video>` element using `canvas.drawImage(video, 0, 0)`
- Export via `canvas.toBlob()` for download
- `POST /api/v1/recordings/photo` endpoint is **out of scope** for this iteration
- First version: download directly in browser

### Frontend Hooks

**New: `hooks/use-webrtc.ts`**

```typescript
// Signaling message discriminated union
type SignalingMessage =
  | { type: 'webrtc_offer'; sdp: string }
  | { type: 'webrtc_answer'; sdp: string }
  | { type: 'webrtc_ice_candidate'; candidate: RTCIceCandidateInit }
  | { type: 'webrtc_reset' }

interface UseWebRTCOptions {
  role: 'caller' | 'answerer'
  onRemoteStream: (stream: MediaStream) => void
  sendSignaling: (message: SignalingMessage) => void
}

interface UseWebRTCReturn {
  start: (localStream: MediaStream) => Promise<void>
  stop: () => void
  handleSignaling: (message: SignalingMessage) => void
  connectionState: RTCPeerConnectionState
  localAudioTrack: MediaStreamTrack | null
}
```

**New: `hooks/use-camera.ts`**
```typescript
interface UseCameraReturn {
  stream: MediaStream | null
  start: (constraints?: MediaStreamConstraints) => Promise<void>
  stop: () => void
  capturePhoto: () => string | null  // data URL from canvas
  isActive: boolean
}
```

## 4. Host — Enhanced Station Mode

### Changes to `app/station/page.tsx`

The existing Station page becomes the Host interface. Changes:

**On station start:**
1. Request camera permission alongside microphone (existing)
2. Show small camera preview (picture-in-picture style, bottom corner)
3. Connect WebSocket to `/ws/station` (existing behavior)
4. Listen for WebRTC offers from Server
5. Emit `station_status` every 10 seconds

**WebRTC answerer behavior:**
1. When `webrtc_offer` arrives via WebSocket → create peer connection via `useWebRTC(role: 'answerer')`
2. Add local audio + video tracks
3. Send answer back via WebSocket
4. Play incoming audio from Server through device speaker
5. Show "Owner connected" indicator
6. On `webrtc_reset` or `control_disconnected` → tear down peer connection, ready for new offer

**New UI elements:**
- Camera preview thumbnail (bottom-right corner, small)
- WebRTC connection indicator (green dot when P2P active)
- "Owner connected" badge in top bar
- Audio-from-server volume indicator

**State management:**
- `useWebRTC` hook manages all peer connection logic
- `useCamera` hook manages camera stream
- Existing hooks (`useWebSocket`, `useWakeLock`, `useRecorder`) unchanged

## 5. Server — Remote Control Page

### New page: `app/remote-control/page.tsx`

**Layout (two-column on desktop, stacked on mobile):**

**Left column — Media:**
- Video feed from Host camera (`<video>` element with remote stream)
- Audio level indicator for Host audio
- Photo capture button (overlay on video)
- Fullscreen toggle for video

**Right column — Controls:**
- **Walkie Talkie section:** Large push-to-talk button (mousedown/touchstart → unmute, mouseup/touchend → mute), audio-from-host volume bar
- **Quick Actions grid:** Play random clip, Start/stop recording, Start training session, Pause/resume Host
- **Host Status panel:** Connection state, detection active, last sound time, today's stats, uptime

**Top bar:**
- Host connection status (green/yellow/red dot)
- WebRTC connection state
- Host uptime
- Battery level (from `station_heartbeat` messages)

### Navigation

- Add "Remote Control" entry to sidebar navigation in `app/layout.tsx`
- Icon: remote/controller icon
- Position: below "Station" in nav

### Connection flow

1. Page mounts → connect to `/ws/control`
2. Backend sends `station_connected` or no message (Host not connected) → show status
3. User clicks "Connect Camera/Walkie" → initiate WebRTC (caller role)
4. WebRTC established → video appears, audio flows
5. User can send commands anytime via WebSocket (even without WebRTC)
6. On `station_disconnected` → show "Host offline", disable WebRTC controls

## 6. Files to Create/Modify

### New Files

**Backend:**
- `backend/app/modules/auth/__init__.py`
- `backend/app/modules/auth/router.py` — Login, logout, me endpoints
- `backend/app/modules/auth/middleware.py` — Pure ASGI auth middleware (HTTP only)
- `backend/app/modules/auth/service.py` — Token generation/validation + `validate_ws_cookie()` helper

**Frontend:**
- `frontend/src/app/login/page.tsx` — Login page
- `frontend/src/app/remote-control/page.tsx` — Remote Control page
- `frontend/src/hooks/use-webrtc.ts` — WebRTC peer connection hook
- `frontend/src/hooks/use-camera.ts` — Camera access hook
- `frontend/src/core/control-ws-client.ts` — WebSocket client for /ws/control

### Modified Files

**Backend:**
- `backend/app/config.py` — Add AUTH_USER, AUTH_PASS, AUTH_SECRET, AUTH_MAX_AGE_DAYS (no defaults for USER/PASS)
- `backend/app/main.py` — Add auth middleware, /ws/control endpoint, startup auth validation, update CORS for credentials with explicit origins
- `backend/app/modules/station/websocket.py` — ConnectionManager v2 with dual connections + signaling routing + disconnect notifications

**Frontend:**
- `frontend/src/app/router.tsx` — Add /login (outside Layout), /remote-control routes
- `frontend/src/app/layout.tsx` — Add Remote Control nav entry + handle /login path (no sidebar)
- `frontend/src/app/station/page.tsx` — Add WebRTC answerer + camera + station_status emission
- `frontend/src/core/api-client.ts` — Add `credentials: 'include'` to all fetch calls + 401 → redirect to /login
- `frontend/src/core/ws-client.ts` — Add 4001/4002 close code handling (stop reconnect)
- `frontend/src/types.ts` — Add to `WsEventType` union: `station_status`, `station_connected`, `station_disconnected`, `station_heartbeat`, `control_connected`, `control_disconnected`, `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`, `webrtc_reset`. Add `SignalingMessage` discriminated union type. Add `StationStatusMessage` and `StationHeartbeatMessage` interfaces matching the JSON schemas in Section 2. The existing `StationStatus` interface (used by the dashboard) is kept as-is — `StationStatusMessage` is a separate WS-specific type for the real-time status protocol.

**Config:**
- `docker-compose.yml` — Add AUTH_USER=mtorres, AUTH_PASS=Password01, CORS_ORIGINS with explicit origins
- `docker-compose.dev.yml` — Currently only has a `db` service. Add a new `backend` service block (or document that for local dev without Docker, auth env vars go in `backend/.env`)
- `.env.example` — Add AUTH_USER, AUTH_PASS, AUTH_SECRET, AUTH_MAX_AGE_DAYS

## 7. Key Design Decisions

| Decision | Options Considered | Choice | Reasoning |
|---|---|---|---|
| WebSocket endpoints | Single (reuse /ws/station) vs Two separate | Two separate | Clean separation of concerns, no role confusion |
| Server WS client | Reuse ws-client.ts vs New file | New control-ws-client.ts | Existing one hardcoded to /ws/station with Host-specific logic |
| Photo capture | Backend endpoint on Host vs Canvas on Server | Canvas on Server | Video already streams to Server, zero additional complexity |
| Walkie talkie mode | Always-on mic vs Push-to-talk | Push-to-talk (Server→Host) + always-on (Host→Server) | Prevents noise to parrot, owner always hears parrot |
| Login page | Modal overlay vs Separate route | Separate route outside Layout | No app chrome should load without auth |
| Auth token storage | JWT vs Signed cookie | HMAC-SHA256 signed cookie | Simpler, no library needed, HTTP-only prevents XSS |
| WebRTC vs WS relay | WebRTC P2P vs Media through backend | WebRTC P2P | Minimal latency, no server load, industry standard |
| Cookie SameSite | Lax vs Strict | Strict | Lax doesn't protect WebSocket upgrades from CSRF |
| Auth middleware type | BaseHTTPMiddleware vs Pure ASGI | Pure ASGI | BaseHTTPMiddleware doesn't intercept WebSocket scopes |
| WS auth approach | Via middleware vs Inside endpoint handler | Inside endpoint handler | FastAPI middleware can't reliably intercept WS connections |
| Credential defaults | Hardcoded defaults vs Required env vars | Required env vars (defaults only in docker-compose) | Prevents accidental deployment with default credentials in code |

## 8. Security Considerations

- Cookie is HTTP-only (not accessible from JavaScript)
- Cookie is SameSite=Strict (prevents CSRF on both HTTP and WebSocket upgrades)
- Cookie has configurable max-age (default 30 days) — tokens expire and require re-login
- AUTH_SECRET auto-generated if not provided (prevents forgotten config)
- AUTH_USER/AUTH_PASS have no code defaults — must be set via environment (docker-compose provides defaults for dev)
- CORS updated to explicit origins: `["http://localhost:80", "http://localhost:5173"]` for development, configurable via CORS_ORIGINS env var
- WebSocket auth validated inside endpoint handler (not middleware) — no bypass possible
- `credentials: 'include'` added to all frontend fetch calls for cross-origin cookie support
- WebSocket clients handle close code 4001 by stopping reconnect and redirecting to login
- No secrets stored in database or frontend code

## 9. Testing Strategy

### Backend
- Unit tests for auth service (token generation, validation, expiry, reject expired tokens)
- Integration tests for auth middleware (protected routes return 401, login flow, logout clears cookie)
- Integration tests for WebSocket auth (valid cookie → connect, invalid → 4001, expired → 4001)
- Integration tests for ConnectionManager v2 (message routing, disconnect notifications, concurrent connection replacement)

### Frontend
- Unit tests for `use-webrtc` hook (mock RTCPeerConnection, test caller/answerer flows, test disconnect recovery)
- Unit tests for `use-camera` hook (mock getUserMedia)
- Integration test for login flow (form submit, redirect, cookie handling)
- E2E test for Remote Control → Host connection flow

## 10. Out of Scope

These items are explicitly deferred to future iterations:
- TURN server for strict NAT environments
- `POST /api/v1/recordings/photo` endpoint for storing captured photos
- Multiple user accounts (currently single-user with env var credentials)
- End-to-end encryption on WebRTC (SRTP is default, sufficient for LAN use)
- Mobile app (Host uses browser on phone/tablet)
