// ── Parrot types ─────────────────────────────────────────────────────────────

export type ParrotSex = 'male' | 'female' | 'unknown'

export interface Parrot {
  id: string
  name: string
  species: string | null
  birth_date: string | null
  adoption_date: string | null
  weight_grams: number | null
  sex: ParrotSex | null
  notes: string | null
  avatar_path: string | null
  created_at: string
  updated_at: string
}

export interface ParrotCreate {
  name: string
  species?: string | null
  birth_date?: string | null
  adoption_date?: string | null
  weight_grams?: number | null
  sex?: ParrotSex | null
  notes?: string | null
}

export interface ParrotUpdate {
  name?: string | null
  species?: string | null
  birth_date?: string | null
  adoption_date?: string | null
  weight_grams?: number | null
  sex?: ParrotSex | null
  notes?: string | null
}

export interface AvatarUploadResponse {
  avatar_path: string
  avatar_url: string
}

// ── Clip types ──────────────────────────────────────────────────────────────

export type ClipType = 'word' | 'phrase' | 'sound' | 'music' | 'whistle' | 'reward'

export interface Clip {
  id: string
  name: string
  type: string
  category: string | null
  tags: string[] | null
  file_path: string
  duration: number | null
  difficulty: number
  default_volume: number
  source: string
  youtube_url: string | null
  created_at: string
}

export interface ClipCreate {
  name: string
  type?: string
  category?: string | null
  tags?: string[] | null
  difficulty?: number
  default_volume?: number
  source?: string
  youtube_url?: string | null
}

export interface ClipUpdate {
  name?: string
  type?: string
  category?: string | null
  tags?: string[] | null
  difficulty?: number
  default_volume?: number
}

// ── Recording types ──────────────────────────────────────────────────────────

export type RecordingClassification = 'speech' | 'noise' | 'silence' | 'parrot' | null

export interface Recording {
  id: string
  file_path: string
  duration: number | null
  classification: RecordingClassification
  notes: string | null
  starred: boolean
  peak_volume: number | null
  trigger_clip_id: string | null
  recorded_at: string
}

export interface RecordingCreate {
  classification?: RecordingClassification
  trigger_clip_id?: string
  notes?: string
  starred?: boolean
}

export interface RecordingUpdate {
  classification?: RecordingClassification
  notes?: string
  starred?: boolean
}

// ── Training session types ────────────────────────────────────────────────────

export interface SessionStep {
  clip_id: string
  clip_name?: string
  repetitions: number
  wait_seconds: number
}

export interface SessionConfig {
  steps?: SessionStep[]
  reward_clip_id?: string
  [key: string]: unknown
}

export interface Session {
  id: string
  name: string
  objective: string | null
  config: SessionConfig
  is_active: boolean
  created_at: string
}

/** Helper to extract steps from session config */
export const getSessionSteps = (session: Session): SessionStep[] =>
  Array.isArray(session.config?.steps) ? session.config.steps : []

export interface SessionCreate {
  name: string
  objective?: string
  config: SessionConfig
  is_active?: boolean
}

export interface SessionLog {
  id: string
  session_id: string
  step_number: number
  clip_played_id: string | null
  response_detected: boolean
  recording_id: string | null
  result: string | null
  executed_at: string
}

// ── Schedule types ────────────────────────────────────────────────────────────

export type ScheduleType = 'daily' | 'weekly' | 'interval' | 'once'
export type ScheduleActionType = 'play_clip' | 'start_session' | 'record' | 'detect'

export interface ScheduleAction {
  id?: string
  schedule_id?: string
  action_type: ScheduleActionType
  clip_id?: string | null
  session_id?: string | null
  volume?: number
  repetitions?: number
  pause_between?: number
  order_index?: number
}

export interface Schedule {
  id: string
  name: string
  schedule_type: ScheduleType
  time_start: string | null
  time_end: string | null
  days_of_week: number[] | null
  is_active: boolean
  priority: number
  actions: ScheduleAction[]
}

export interface ScheduleCreate {
  name: string
  schedule_type: ScheduleType
  time_start?: string
  time_end?: string
  days_of_week?: number[]
  is_active?: boolean
  priority?: number
  actions: ScheduleActionCreate[]
}

export interface ScheduleActionCreate {
  action_type: ScheduleActionType
  clip_id?: string | null
  session_id?: string | null
  volume?: number
  repetitions?: number
  pause_between?: number
  order_index?: number
}

// ── Response rule types ───────────────────────────────────────────────────────

export type TriggerType = 'sound_detected' | 'keyword' | 'volume_threshold' | 'time_of_day'
export type ActionType = 'play_clip' | 'start_session' | 'record' | 'log'

export interface TriggerConfig {
  threshold?: number
  min_duration?: number
  keyword?: string
  time?: string
  [key: string]: unknown
}

export interface ActionConfig {
  clip_id?: string
  session_id?: string
  duration?: number
  category?: string
  [key: string]: unknown
}

export interface ResponseRule {
  id: string
  name: string
  is_active: boolean
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  action_type: ActionType
  action_config: ActionConfig
  cooldown_secs: number
  times_triggered: number
}

export interface ResponseRuleCreate {
  name: string
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  action_type: ActionType
  action_config: ActionConfig
  cooldown_secs?: number
  is_active?: boolean
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
  | 'stop_session'
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
  | 'session_progress'
  | 'status_update'
  | 'error'
  // Server can also push commands to the station client:
  | 'play_clip'
  | 'play_random'
  | 'stop'
  | 'start_recording'
  | 'stop_recording'
  | 'start_session'
  | 'stop_session'
  | 'flip_camera'
  | 'set_sensitivity'
  | 'session_progress'
  | 'session_finished'
  | 'clip_started'
  | 'clip_finished'
  | 'pause'
  | 'resume'
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

export interface WsCommand {
  type: WsCommandType
  clip_id?: string
  session_id?: string
  volume?: number
  duration?: number
  category?: string
}

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

export interface UpcomingEvent {
  schedule_id: string
  schedule_name: string
  next_run: string
  action_count: number
}

// ── YouTube import types ──────────────────────────────────────────────────────

export interface YoutubeInfo {
  title: string
  duration: number
  thumbnail: string | null
  uploader: string | null
}

export interface YoutubeExtractRequest {
  url: string
  start_time: number
  end_time: number | null
  name: string
  category: string | null
  tags: string[] | null
  difficulty: number
  default_volume: number
}

// ── Feeding types ────────────────────────────────────────────────────────────

export type FoodCategory = 'fruit' | 'vegetable' | 'seed' | 'pellet' | 'nut' | 'protein' | 'grain' | 'treat' | 'toxic'
export type FrequencyRecommendation = 'daily' | '3x_week' | 'occasional' | 'never'
export type AgeRestriction = 'adult_only' | 'chick_friendly' | 'all_ages'

export interface FoodItem {
  id: string
  name: string
  category: FoodCategory
  is_safe: boolean
  is_toxic: boolean
  nutritional_info: Record<string, unknown> | null
  frequency_recommendation: FrequencyRecommendation | null
  notes: string | null
  age_restriction: AgeRestriction | null
}

export interface FoodItemCreate {
  name: string
  category: FoodCategory
  is_safe?: boolean
  is_toxic?: boolean
  nutritional_info?: Record<string, unknown> | null
  frequency_recommendation?: FrequencyRecommendation | null
  notes?: string | null
  age_restriction?: AgeRestriction | null
}

export interface FoodItemUpdate {
  name?: string
  category?: FoodCategory
  is_safe?: boolean
  is_toxic?: boolean
  nutritional_info?: Record<string, unknown> | null
  frequency_recommendation?: FrequencyRecommendation | null
  notes?: string | null
  age_restriction?: AgeRestriction | null
}

export interface FeedingLog {
  id: string
  parrot_id: string
  food_item_id: string | null
  food_name: string
  quantity: string | null
  fed_at: string
  notes: string | null
}

export interface FeedingLogCreate {
  parrot_id: string
  food_item_id?: string | null
  food_name: string
  quantity?: string | null
  fed_at?: string | null
  notes?: string | null
}

export interface FeedingSummary {
  parrot_id: string
  days: number
  total_feedings: number
  unique_foods: number
  most_fed_foods: Record<string, unknown>[]
  toxic_foods_fed: string[]
  category_breakdown: Record<string, number>
}

export interface FeedingPlan {
  id: string
  parrot_id: string
  plan_data: Record<string, unknown>
  generated_at: string
  active: boolean
  feedback: string | null
}

// ── API pagination ────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}

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
