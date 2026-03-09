# LoroApp - Parrot Training System Design

## Architecture

- **Backend**: Python 3.12 + FastAPI + SQLAlchemy async + PostgreSQL + APScheduler
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Vite (PWA)
- **Deployment**: Docker Compose on VPS (Hostinger/Easypanel)
- **Client**: Android phone in kiosk mode (Chrome PWA, always-on screen)

## Communication

- REST API for CRUD operations
- WebSocket for real-time commands (server → phone) and events (phone → server)
- Phone uses Wake Lock API to keep screen on

## Modules

1. **Clips Library** - Upload, record, import, tag, categorize audio clips
2. **YouTube Ingestor** - Extract audio segments from YouTube videos
3. **Training Engine** - Create and run training sessions with exercises
4. **Recording Engine** - Record parrot vocalizations, classify, track
5. **Scheduler** - Time-based and event-based automation
6. **Response Engine** - Automatic responses to parrot sounds
7. **Station** - Kiosk mode for the phone, WebSocket bridge

## Database

PostgreSQL with tables: clips, recordings, sessions, session_logs, schedules, schedule_actions, response_rules, daily_stats

## Deployment

Docker Compose with 3 services: db (postgres:16), backend (FastAPI), frontend (nginx + React)
