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

- **`service.py`**: Validates credentials, generates/verifies HMAC-SHA256 token
- **`middleware.py`**: FastAPI middleware that intercepts all requests
- **`router.py`**: Login endpoint

**Config additions (`app/config.py`):**

```python
AUTH_USER: str = "mtorres"
AUTH_PASS: str = "Password01"
AUTH_SECRET: str = ""  # Auto-generated with secrets.token_hex(32) if empty
```

**Cookie format:**
- Name: `loro_session`
- Value: `{user}:{timestamp}:{hmac_sha256(user:timestamp, secret)}`
- Flags: HTTP-only, SameSite=Lax, Path=/
- No expiry (session cookie) — persists until browser closes or explicit logout

**Middleware exclusions:**
- `POST /api/v1/auth/login`
- `GET /health`

**WebSocket auth:**
- Cookie sent automatically by browser on WebSocket handshake (same origin)
- Backend validates cookie in `websocket.accept()` phase
- Invalid → close connection with code 4001

### Frontend Implementation

**New page: `app/login/page.tsx`**
- Simple form: username + password fields
- POST to `/api/v1/auth/login`
- On success: redirect to `/` (cookie set by backend response)
- On failure: show error message

**Changes to `core/api-client.ts`:**
- Detect 401 responses → `window.location.href = '/login'`

**Changes to `app/router.tsx`:**
- `/login` route outside `<Layout>` (no sidebar, no auth required)
- All other routes remain inside `<Layout>`

## 2. WebSocket Architecture — Two Endpoints

### Current State

Single endpoint `/ws/station` with a singleton `ConnectionManager` that accepts one WebSocket connection (the Host/station).

### New Architecture

Two WebSocket endpoints, one `ConnectionManager` that knows both:

| Endpoint | Client | Purpose |
|---|---|---|
| `/ws/station` | Host (phone/tablet) | Existing station protocol + WebRTC signaling |
| `/ws/control` | Server (owner's browser) | Send commands to Host + receive status + WebRTC signaling |

### ConnectionManager v2

```python
class ConnectionManager:
    _station: WebSocket | None   # Host connection
    _control: WebSocket | None   # Server connection

    async def connect_station(ws) -> None
    async def connect_control(ws) -> None
    async def send_to_station(message) -> None
    async def send_to_control(message) -> None
    async def handle_station_message(raw) -> None  # Routes to control if needed
    async def handle_control_message(raw) -> None  # Routes to station if needed
```

**Message routing logic:**
- Messages with `type: "webrtc_offer"`, `"webrtc_answer"`, `"webrtc_ice_candidate"` are forwarded between station ↔ control
- Command messages from control (e.g., `play_clip`, `start_recording`) are forwarded to station
- Status messages from station (e.g., `sound_detected`, `playback_finished`) are forwarded to control
- Heartbeat (`ping`/`pong`) handled locally per connection

### New WebSocket Message Types

**Control → Backend → Station:**
- `webrtc_offer` — SDP offer from Server
- `webrtc_ice_candidate` — ICE candidate from Server
- `play_clip`, `stop`, `start_recording`, `stop_recording` — existing commands
- `start_session`, `pause`, `resume` — existing commands

**Station → Backend → Control:**
- `webrtc_answer` — SDP answer from Host
- `webrtc_ice_candidate` — ICE candidate from Host
- `sound_detected`, `recording_ready`, `playback_finished` — existing events
- `station_status` — periodic status update (detection active, recording state, stats)

### Frontend WebSocket Client

**New file: `core/control-ws-client.ts`**
- Same pattern as `ws-client.ts` but connects to `/ws/control`
- Used only by the Remote Control page
- Singleton instance

**Existing `core/ws-client.ts`:**
- No changes — still used by Station page (Host)

## 3. WebRTC — Audio Bidirectional + Video Unidirectional

### Connection Flow

1. Server user activates walkie talkie or camera on Remote Control page
2. Server creates `RTCPeerConnection` with STUN config
3. Server calls `getUserMedia({audio: true})` for mic access
4. Server adds audio track to peer connection
5. Server creates SDP offer → sends via `/ws/control`
6. Backend forwards offer to Host via `/ws/station`
7. Host receives offer, creates `RTCPeerConnection`
8. Host calls `getUserMedia({audio: true, video: true})` for mic + camera
9. Host adds audio + video tracks to peer connection
10. Host creates SDP answer → sends via `/ws/station`
11. Backend forwards answer to Server via `/ws/control`
12. ICE candidates exchanged bidirectionally via same WebSocket path
13. P2P connection established — media flows directly

### ICE Configuration

```javascript
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
}
```

STUN only for first version. Sufficient for LAN and most NAT configurations. TURN server can be added later if needed for strict NAT environments.

### Media Tracks

| Direction | Track | Purpose |
|---|---|---|
| Server → Host | Audio | Owner's voice to parrot (push-to-talk) |
| Host → Server | Audio | Parrot/environment sounds to owner (always on) |
| Host → Server | Video | Camera feed to owner (always on when WebRTC active) |

### Push-to-Talk Implementation

- Server audio track is added to peer connection but **muted by default** (`track.enabled = false`)
- When user holds the push-to-talk button: `track.enabled = true`
- When user releases: `track.enabled = false`
- No renegotiation needed — mute/unmute is instant

### Photo Capture

- Done entirely on the Server side
- Capture frame from `<video>` element using `canvas.drawImage(video, 0, 0)`
- Export via `canvas.toDataURL('image/png')` or `canvas.toBlob()`
- Optional: upload to backend for storage via `POST /api/v1/recordings/photo` (future)
- First version: download directly in browser

### Frontend Hooks

**New: `hooks/use-webrtc.ts`**
```typescript
interface UseWebRTCOptions {
  role: 'caller' | 'answerer'
  onRemoteStream: (stream: MediaStream) => void
  sendSignaling: (message: unknown) => void
}

interface UseWebRTCReturn {
  start: (localStream: MediaStream) => Promise<void>
  stop: () => void
  handleSignaling: (message: unknown) => void
  connectionState: RTCPeerConnectionState
  localAudioTrack: MediaStreamTrack | null
}
```

**New: `hooks/use-camera.ts`**
```typescript
interface UseCameraReturn {
  stream: MediaStream | null
  start: () => Promise<void>
  stop: () => void
  capturePhoto: () => string | null  // data URL
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

**WebRTC answerer behavior:**
1. When `webrtc_offer` arrives via WebSocket → create peer connection
2. Add local audio + video tracks
3. Send answer back
4. Play incoming audio from Server through device speaker
5. Show "Owner connected" indicator

**New UI elements:**
- Camera preview thumbnail (draggable, bottom-right corner)
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
- **Walkie Talkie section:** Large push-to-talk button, mute indicator, audio-from-host volume bar
- **Quick Actions grid:** Play random clip, Start/stop recording, Start training session, Pause/resume Host
- **Host Status panel:** Connection state, detection active, last sound time, today's stats, uptime

**Top bar:**
- Host connection status (green/yellow/red dot)
- WebRTC connection state
- Host uptime
- Battery level (from heartbeat)

### Navigation

- Add "Remote Control" entry to sidebar navigation in `app/layout.tsx`
- Icon: remote/controller icon
- Position: below "Station" in nav

### Connection flow

1. Page mounts → connect to `/ws/control`
2. If Host is connected → show status, enable controls
3. User clicks "Connect Camera/Walkie" → initiate WebRTC
4. WebRTC established → video appears, audio flows
5. User can send commands anytime (even without WebRTC)

## 6. Files to Create/Modify

### New Files

**Backend:**
- `backend/app/modules/auth/__init__.py`
- `backend/app/modules/auth/router.py` — Login/logout endpoints
- `backend/app/modules/auth/middleware.py` — Auth middleware
- `backend/app/modules/auth/service.py` — Token generation/validation

**Frontend:**
- `frontend/src/app/login/page.tsx` — Login page
- `frontend/src/app/remote-control/page.tsx` — Remote Control page
- `frontend/src/hooks/use-webrtc.ts` — WebRTC peer connection hook
- `frontend/src/hooks/use-camera.ts` — Camera access hook
- `frontend/src/core/control-ws-client.ts` — WebSocket client for /ws/control

### Modified Files

**Backend:**
- `backend/app/config.py` — Add AUTH_USER, AUTH_PASS, AUTH_SECRET
- `backend/app/main.py` — Add auth middleware, /ws/control endpoint, update CORS for credentials
- `backend/app/modules/station/websocket.py` — ConnectionManager v2 with dual connections + signaling routing

**Frontend:**
- `frontend/src/app/router.tsx` — Add /login, /remote-control routes
- `frontend/src/app/layout.tsx` — Add Remote Control nav entry
- `frontend/src/app/station/page.tsx` — Add WebRTC answerer + camera
- `frontend/src/core/api-client.ts` — 401 → redirect to /login
- `frontend/src/types.ts` — New WebSocket message types for signaling + control

**Config:**
- `docker-compose.yml` — Add AUTH_USER, AUTH_PASS env vars
- `.env.example` — Add AUTH_USER, AUTH_PASS, AUTH_SECRET

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

## 8. Security Considerations

- Cookie is HTTP-only (not accessible from JavaScript)
- Cookie is SameSite=Lax (CSRF protection for state-changing requests)
- AUTH_SECRET auto-generated if not provided (prevents forgotten config)
- CORS must be updated from `["*"]` to specific origins when auth is enabled (credentials require explicit origins)
- WebSocket auth validated on handshake — no unauthenticated connections
- No secrets stored in database or frontend code
- Basic Auth credentials only transmitted over the login POST (not on every request — cookie-based after that)

## 9. Testing Strategy

### Backend
- Unit tests for auth service (token generation, validation, expiry)
- Integration tests for auth middleware (protected routes return 401, login flow)
- Integration tests for WebSocket auth (valid cookie → connect, invalid → 4001)
- Integration tests for ConnectionManager v2 (message routing between station/control)

### Frontend
- Unit tests for `use-webrtc` hook (mock RTCPeerConnection)
- Unit tests for `use-camera` hook (mock getUserMedia)
- Integration test for login flow (form submit, redirect, cookie handling)
- E2E test for Remote Control → Host connection flow
