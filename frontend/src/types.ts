// ── Clip types ──────────────────────────────────────────────────────────────

export type ClipType = 'word' | 'phrase' | 'sound' | 'music' | 'reward'

export interface Clip {
  id: number
  name: string
  type: ClipType
  category: string
  tags: string[]
  file_path: string
  duration: number | null
  source_url: string | null
  created_at: string
  updated_at: string
}

export interface ClipCreate {
  name: string
  type: ClipType
  category: string
  tags: string[]
  source_url?: string
}

export interface ClipUpdate {
  name?: string
  type?: ClipType
  category?: string
  tags?: string[]
}

// ── Recording types ──────────────────────────────────────────────────────────

export type RecordingClassification = 'imitation' | 'spontaneous' | 'noise' | 'unclassified'

export interface Recording {
  id: number
  file_path: string
  duration: number | null
  classification: RecordingClassification
  is_favorite: boolean
  trigger_type: string | null
  session_id: number | null
  volume_peak: number | null
  created_at: string
}

export interface RecordingCreate {
  classification?: RecordingClassification
  trigger_type?: string
  session_id?: number
}

export interface RecordingUpdate {
  classification?: RecordingClassification
  is_favorite?: boolean
}

// ── Training session types ────────────────────────────────────────────────────

export interface SessionStep {
  clip_id: number
  clip_name?: string
  repetitions: number
  wait_seconds: number
}

export interface Session {
  id: number
  name: string
  objective: string
  steps: SessionStep[]
  reward_clip_id: number | null
  reward_clip_name?: string
  created_at: string
  updated_at: string
}

export interface SessionCreate {
  name: string
  objective: string
  steps: SessionStep[]
  reward_clip_id?: number
}

export interface SessionLog {
  id: number
  session_id: number
  started_at: string
  ended_at: string | null
  steps_completed: number
  notes: string | null
}

// ── Schedule types ────────────────────────────────────────────────────────────

export type ScheduleType = 'fixed' | 'random_window' | 'interval'
export type ScheduleActionType = 'play_clip' | 'play_random' | 'start_session' | 'start_recording'

export interface ScheduleAction {
  type: ScheduleActionType
  clip_id?: number
  clip_name?: string
  session_id?: number
  session_name?: string
  duration?: number
}

export interface Schedule {
  id: number
  name: string
  schedule_type: ScheduleType
  enabled: boolean
  time: string | null
  days: number[]
  window_start: string | null
  window_end: string | null
  interval_minutes: number | null
  actions: ScheduleAction[]
  created_at: string
}

export interface ScheduleCreate {
  name: string
  schedule_type: ScheduleType
  enabled?: boolean
  time?: string
  days?: number[]
  window_start?: string
  window_end?: string
  interval_minutes?: number
  actions: ScheduleAction[]
}

// ── Response rule types ───────────────────────────────────────────────────────

export type TriggerType = 'sound_detected' | 'keyword' | 'time_of_day' | 'manual'
export type ActionType = 'play_clip' | 'play_random' | 'start_recording' | 'start_session'

export interface TriggerConfig {
  threshold?: number
  min_duration?: number
  keyword?: string
  time?: string
}

export interface ActionConfig {
  clip_id?: number
  session_id?: number
  duration?: number
  category?: string
}

export interface ResponseRule {
  id: number
  name: string
  enabled: boolean
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  action_type: ActionType
  action_config: ActionConfig
  cooldown_seconds: number
  times_triggered: number
  created_at: string
}

export interface ResponseRuleCreate {
  name: string
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  action_type: ActionType
  action_config: ActionConfig
  cooldown_seconds?: number
}

// ── WebSocket types ───────────────────────────────────────────────────────────

// Commands sent from client to server
export type WsCommandType =
  | 'play_clip'
  | 'play_random'
  | 'stop'
  | 'start_recording'
  | 'stop_recording'
  | 'start_session'
  | 'pause'
  | 'resume'
  | 'set_volume'
  | 'sound_detected'

// Events received from server (includes commands server sends to station)
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
  // Server can also push commands to the station client:
  | 'play_clip'
  | 'play_random'
  | 'stop'
  | 'start_recording'
  | 'stop_recording'
  | 'start_session'
  | 'pause'
  | 'resume'

export interface WsCommand {
  type: WsCommandType
  clip_id?: number
  session_id?: number
  volume?: number
  duration?: number
  category?: string
}

export interface WsEvent {
  type: WsEventType
  clip_id?: number
  clip_name?: string
  session_id?: number
  recording_id?: number
  volume?: number
  timestamp?: string
  message?: string
  payload?: Record<string, unknown>
}

// ── Stats & station types ─────────────────────────────────────────────────────

export interface DailyStats {
  date: string
  clips_played: number
  recordings_made: number
  sessions_completed: number
  sounds_detected: number
  uptime_minutes: number
}

export interface StationStatus {
  connected: boolean
  is_playing: boolean
  is_recording: boolean
  current_clip: string | null
  volume: number
  uptime_seconds: number
  next_event: NextEvent | null
  daily_stats: DailyStats
}

export interface NextEvent {
  schedule_name: string
  trigger_at: string
  action_type: string
}

// ── YouTube import types ──────────────────────────────────────────────────────

export interface YoutubeInfo {
  title: string
  duration: number
  thumbnail: string
  channel: string
}

export interface YoutubeExtractRequest {
  url: string
  start_time: number
  end_time: number
  name: string
  category: string
  tags: string[]
  clip_type: ClipType
}

// ── API pagination ────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}
