import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, getApiBaseUrl } from '@/core/api-client'
import { AudioEngine } from '@/core/audio-engine'
import { SoundDetector } from '@/core/detector'
import { AudioRecorder } from '@/core/recorder'
import { VolumeMeter } from '@/components/volume-meter'
import { useWakeLock } from '@/hooks/use-wakelock'
import { useWebSocket, useWsCommand } from '@/hooks/use-websocket'
import type { DailyStats, StationStatus, UpcomingEvent, WsEvent } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecentRecording {
  id: string
  recorded_at: string
  duration: number | null
  classification: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

const StationPage = () => {
  const navigate = useNavigate()
  const { connectionState, connect, disconnect: wsDisconnect, send } = useWebSocket()
  const { acquire: acquireWakeLock, release: releaseWakeLock, isActive: wakeLockActive } = useWakeLock()

  const [stationActive, setStationActive] = useState(false)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [lastSoundTime, setLastSoundTime] = useState<Date | null>(null)
  const [currentClipName, setCurrentClipName] = useState<string | null>(null)
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [nextEvent, setNextEvent] = useState<StationStatus['next_event']>(null)
  const [uptime, setUptime] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [detectionActive, setDetectionActive] = useState(false)
  const [recentRecordings, setRecentRecordings] = useState<RecentRecording[]>([])
  const [playingRecId, setPlayingRecId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const recAudioRef = useRef<HTMLAudioElement | null>(null)

  const AUTO_RECORD_DURATION_MS = 10_000
  const engineRef = useRef(new AudioEngine())
  const recorderRef = useRef(new AudioRecorder())
  const detectorRef = useRef(new SoundDetector())
  const rafRef = useRef<number | null>(null)
  const autoRecordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRecordingRef = useRef(false)

  // ── Auto-record on sound detection ──────────────────────────────────

  const autoRecord = useCallback(async () => {
    if (isRecordingRef.current || isPaused) return
    const recorder = recorderRef.current
    try {
      await recorder.start()
      isRecordingRef.current = true
      setIsRecording(true)

      autoRecordTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const blob = await recorder.stop()
            isRecordingRef.current = false
            setIsRecording(false)
            const file = new File([blob], 'recording.webm', { type: blob.type })
            await apiClient.upload('/api/v1/recordings/', file)
            setStats((prev) => prev ? { ...prev, recordings_made: prev.recordings_made + 1 } : prev)
            try {
              const recs = await apiClient.get<RecentRecording[]>('/api/v1/recordings/', { limit: '20' })
              setRecentRecordings(recs)
            } catch { /* silent */ }
          } catch {
            isRecordingRef.current = false
            setIsRecording(false)
          }
        })()
      }, AUTO_RECORD_DURATION_MS)
    } catch {
      // Mic already in use or denied
    }
  }, [isPaused])

  // ── Start / Stop ────────────────────────────────────────────────────

  const handleStartStation = useCallback(async () => {
    setStationActive(true)
    setStartTime(Date.now())
    setUptime(0)
    void acquireWakeLock()
    connect()

    const detector = detectorRef.current
    try {
      await detector.start(0.15, 300, 2_000)
      setDetectionActive(true)

      detector.onSoundDetected(() => {
        setLastSoundTime(new Date())
        send({ type: 'sound_detected' })
        void autoRecord()
      })

      const tick = () => {
        setVolumeLevel(detector.getCurrentLevel())
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setDetectionActive(false)
    }
  }, [acquireWakeLock, connect, send, autoRecord])

  const handleStopStation = useCallback(() => {
    setStationActive(false)
    setDetectionActive(false)
    setVolumeLevel(0)
    setIsPlaying(false)
    setIsRecording(false)
    isRecordingRef.current = false
    setIsPaused(false)
    setCurrentClipName(null)
    setShowHistory(false)

    if (autoRecordTimerRef.current !== null) {
      clearTimeout(autoRecordTimerRef.current)
      autoRecordTimerRef.current = null
    }
    detectorRef.current.stop()
    engineRef.current.stop()
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    releaseWakeLock()
    wsDisconnect()
  }, [releaseWakeLock, wsDisconnect])

  const handleStopAndGoHome = useCallback(() => {
    handleStopStation()
    navigate('/')
  }, [handleStopStation, navigate])

  // ── Cleanup on unmount ──────────────────────────────────────────────

  useEffect(() => {
    return () => {
      detectorRef.current.stop()
      engineRef.current.stop()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  // ── Uptime counter ──────────────────────────────────────────────────

  useEffect(() => {
    if (!stationActive || !startTime) return
    const id = setInterval(() => {
      setUptime(Math.floor((Date.now() - startTime) / 1_000))
    }, 1_000)
    return () => clearInterval(id)
  }, [stationActive, startTime])

  // ── Load stats + recordings periodically ────────────────────────────

  useEffect(() => {
    if (!stationActive) return
    const loadData = async () => {
      try {
        const [statsData, recData] = await Promise.all([
          apiClient.get<DailyStats>('/api/v1/recordings/stats'),
          apiClient.get<RecentRecording[]>('/api/v1/recordings/', { limit: '20' }),
        ])
        setStats(statsData)
        setRecentRecordings(recData)
      } catch { /* silent */ }
    }
    void loadData()
    const id = setInterval(() => void loadData(), 15_000)
    return () => clearInterval(id)
  }, [stationActive])

  // ── Load upcoming events ────────────────────────────────────────────

  useEffect(() => {
    if (!stationActive) return
    const loadStatus = async () => {
      try {
        const events = await apiClient.get<UpcomingEvent[]>('/api/v1/scheduler/upcoming')
        if (events.length > 0) {
          setNextEvent({ schedule_name: events[0].schedule_name, trigger_at: events[0].next_run, action_type: `${events[0].action_count} accion(es)` })
        }
      } catch { /* silent */ }
    }
    void loadStatus()
    const id = setInterval(() => void loadStatus(), 60_000)
    return () => clearInterval(id)
  }, [stationActive])

  // ── WebSocket command handlers ──────────────────────────────────────

  const handlePlayClip = useCallback(async (event: WsEvent) => {
    if (isPaused || !event.clip_id) return
    const engine = engineRef.current
    try {
      setCurrentClipName(event.clip_name ?? null)
      setIsPlaying(true)
      await engine.play(`${getApiBaseUrl()}/api/v1/clips/${event.clip_id}/file`)
      engine.onFinished = () => {
        setIsPlaying(false)
        setCurrentClipName(null)
      }
    } catch {
      setIsPlaying(false)
      setCurrentClipName(null)
    }
  }, [isPaused])

  const handleStopCommand = useCallback(() => {
    engineRef.current.stop()
    setIsPlaying(false)
    setCurrentClipName(null)
  }, [])

  const handleStartRecording = useCallback(async () => {
    if (isRecording) return
    try {
      await recorderRef.current.start()
      isRecordingRef.current = true
      setIsRecording(true)
    } catch { /* silent */ }
  }, [isRecording])

  const handleStopRecording = useCallback(async () => {
    if (!isRecording) return
    try {
      const blob = await recorderRef.current.stop()
      isRecordingRef.current = false
      setIsRecording(false)
      const file = new File([blob], 'recording.webm', { type: blob.type })
      await apiClient.upload('/api/v1/recordings/', file)
      setStats((prev) => prev ? { ...prev, recordings_made: prev.recordings_made + 1 } : prev)
    } catch {
      isRecordingRef.current = false
      setIsRecording(false)
    }
  }, [isRecording])

  useWsCommand('play_clip', handlePlayClip)
  useWsCommand('stop', handleStopCommand)
  useWsCommand('start_recording', handleStartRecording)
  useWsCommand('stop_recording', handleStopRecording)
  useWsCommand('clip_started', (e) => {
    setIsPlaying(true)
    setCurrentClipName(e.clip_name ?? null)
    setStats((prev) => prev ? { ...prev, clips_played: prev.clips_played + 1 } : prev)
  })
  useWsCommand('clip_finished', () => {
    setIsPlaying(false)
    setCurrentClipName(null)
  })

  const handleManualPlay = useCallback(() => {
    send({ type: 'play_random' })
  }, [send])

  const handleManualRecord = useCallback(async () => {
    if (isRecording) {
      await handleStopRecording()
    } else {
      await handleStartRecording()
    }
  }, [isRecording, handleStartRecording, handleStopRecording])

  const handlePlayRecording = useCallback((recId: string) => {
    if (playingRecId === recId) {
      recAudioRef.current?.pause()
      recAudioRef.current = null
      setPlayingRecId(null)
      return
    }
    recAudioRef.current?.pause()
    const audio = new Audio(`${getApiBaseUrl()}/api/v1/recordings/${recId}/file`)
    recAudioRef.current = audio
    setPlayingRecId(recId)
    audio.play().catch(() => setPlayingRecId(null))
    audio.onended = () => {
      setPlayingRecId(null)
      recAudioRef.current = null
    }
  }, [playingRecId])

  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      setIsPaused(false)
      send({ type: 'resume' })
    } else {
      setIsPaused(true)
      engineRef.current.stop()
      setIsPlaying(false)
      send({ type: 'pause' })
    }
  }, [isPaused, send])

  // ── Formatters ──────────────────────────────────────────────────────

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
    return `${s}s`
  }

  const formatTime = (date: Date | null) => {
    if (!date) return '--:--'
    return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  // ── Connection status ───────────────────────────────────────────────

  const connectionColor = connectionState === 'connected'
    ? 'bg-emerald-400'
    : connectionState === 'connecting'
      ? 'bg-yellow-400 animate-pulse'
      : 'bg-red-500'

  // ── Inactive state ──────────────────────────────────────────────────

  if (!stationActive) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col select-none">
        {/* Hero */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          {/* Mic icon */}
          <div className="w-28 h-28 rounded-full bg-slate-800/80 border-2 border-slate-700 flex items-center justify-center">
            <svg className="w-14 h-14 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>

          <div className="text-center max-w-sm">
            <h1 className="text-2xl font-bold text-slate-100">Modo Estacion</h1>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Activa el microfono, la deteccion de sonido y la conexion con el servidor para entrenar a tu loro automaticamente.
            </p>
          </div>

          {/* Actions */}
          <div className="w-full max-w-xs flex flex-col gap-3">
            <button
              onClick={() => void handleStartStation()}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-white font-bold text-lg transition-colors active:scale-[0.97] min-h-[56px]"
            >
              Iniciar Estacion
            </button>

            <button
              onClick={() => navigate('/')}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 font-medium text-sm transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver al menu principal
            </button>
          </div>

          {/* Quick info */}
          <div className="w-full max-w-xs space-y-2">
            <div className="flex items-center gap-3 text-slate-500 text-xs">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4" />
              </svg>
              <span>Detecta sonidos y graba automaticamente</span>
            </div>
            <div className="flex items-center gap-3 text-slate-500 text-xs">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Ejecuta los horarios programados</span>
            </div>
            <div className="flex items-center gap-3 text-slate-500 text-xs">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>Mantiene la pantalla activa</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Active state ────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-slate-950 flex flex-col select-none overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="bg-slate-900 px-4 py-2.5 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full shrink-0 ${connectionColor}`} />
          <span className="font-mono text-xs text-slate-300 tabular-nums">{formatUptime(uptime)}</span>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          {wakeLockActive && (
            <span className="bg-slate-800 px-2 py-0.5 rounded-md">Pantalla activa</span>
          )}
          {detectionActive && (
            <span className="bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded-md">Escuchando</span>
          )}
          {isPaused && (
            <span className="bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded-md">Pausado</span>
          )}
        </div>
      </div>

      {/* ── Main content area ────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 gap-3 overflow-hidden">

        {/* Volume meter */}
        <div className="bg-slate-900 rounded-xl px-4 py-3 flex items-center gap-3 shrink-0">
          <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <div className="flex-1">
            <VolumeMeter level={volumeLevel} threshold={0.15} orientation="horizontal" className="h-3" />
          </div>
          <span className="text-sm font-mono font-bold text-slate-100 tabular-nums w-10 text-right">
            {Math.round(volumeLevel * 100)}%
          </span>
        </div>

        {/* Activity + playing clip */}
        {(isPlaying && currentClipName) && (
          <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-xl px-4 py-2.5 flex items-center gap-3 shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <p className="text-emerald-300 text-xs font-medium truncate">{currentClipName}</p>
          </div>
        )}

        {isRecording && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-2.5 flex items-center gap-3 shrink-0">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <p className="text-red-300 text-xs font-medium">Grabando...</p>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 shrink-0">
          <MiniStat label="Clips" value={stats?.clips_played ?? 0} />
          <MiniStat label="Grabaciones" value={stats?.recordings_made ?? 0} />
          <MiniStat label="Sesiones" value={stats?.sessions_completed ?? 0} />
          <div className="bg-slate-900 rounded-xl py-2.5 px-2 text-center">
            <p className="text-xs font-medium text-slate-400 tabular-nums">{formatTime(lastSoundTime)}</p>
            <p className="text-[9px] text-slate-600 uppercase tracking-wide mt-0.5">Ult. sonido</p>
          </div>
        </div>

        {/* Next event */}
        {nextEvent && (
          <div className="bg-slate-900 rounded-xl px-4 py-2.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-slate-400 text-xs">Proximo:</span>
            </div>
            <span className="text-slate-200 text-xs font-medium truncate ml-2">{nextEvent.schedule_name}</span>
          </div>
        )}

        {/* History toggle + list */}
        <div className="bg-slate-900 rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-2.5 flex items-center justify-between shrink-0 hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Historial</p>
              <span className="text-slate-600 text-[10px] tabular-nums bg-slate-800 px-1.5 py-0.5 rounded-md">
                {recentRecordings.length}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform ${showHistory ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showHistory && (
            <div className="flex-1 overflow-y-auto overscroll-contain border-t border-slate-800/50">
              {recentRecordings.length === 0 ? (
                <p className="text-slate-600 text-xs text-center py-6">Sin grabaciones aun</p>
              ) : (
                (() => {
                  const grouped: Record<string, RecentRecording[]> = {}
                  for (const rec of recentRecordings) {
                    const d = new Date(rec.recorded_at)
                    const key = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
                    if (!grouped[key]) grouped[key] = []
                    grouped[key].push(rec)
                  }
                  return Object.entries(grouped).map(([dayLabel, recs]) => (
                    <div key={dayLabel}>
                      <div className="sticky top-0 z-10 bg-slate-800/90 backdrop-blur-sm px-4 py-1.5">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">{dayLabel}</span>
                        <span className="text-[10px] text-slate-600 ml-2">{recs.length}</span>
                      </div>
                      <div className="divide-y divide-slate-800/30">
                        {recs.map((rec) => {
                          const recTime = new Date(rec.recorded_at)
                          const timeStr = recTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          const durStr = rec.duration != null ? `${rec.duration.toFixed(1)}s` : ''
                          const isActive = playingRecId === rec.id
                          return (
                            <button
                              key={rec.id}
                              onClick={() => handlePlayRecording(rec.id)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                isActive ? 'bg-emerald-900/20' : 'active:bg-slate-800/60'
                              }`}
                            >
                              {isActive ? (
                                <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                  <rect x="6" y="4" width="4" height="16" rx="1" />
                                  <rect x="14" y="4" width="4" height="16" rx="1" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              )}
                              <span className={`text-xs font-mono tabular-nums ${isActive ? 'text-emerald-300' : 'text-slate-400'}`}>
                                {timeStr}
                              </span>
                              {rec.classification && (
                                <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-md">
                                  {rec.classification}
                                </span>
                              )}
                              {durStr && <span className="text-[10px] text-slate-600 ml-auto tabular-nums">{durStr}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))
                })()
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom controls ──────────────────────────────────────────── */}
      <div className="shrink-0 bg-slate-900 border-t border-slate-800 px-4 pt-3 pb-5 space-y-2.5">

        {/* Primary: Play + Record */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleManualPlay}
            disabled={isPaused}
            className="h-20 bg-emerald-600 rounded-2xl flex flex-col items-center justify-center gap-1.5 hover:bg-emerald-500 active:scale-[0.97] disabled:opacity-40 transition-all touch-manipulation"
          >
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="text-white text-xs font-bold">Reproducir</span>
          </button>

          <button
            onClick={() => void handleManualRecord()}
            className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all touch-manipulation active:scale-[0.97] ${
              isRecording
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-slate-800 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            {isRecording ? (
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="6" />
              </svg>
            )}
            <span className={`text-xs font-bold ${isRecording ? 'text-white' : 'text-slate-200'}`}>
              {isRecording ? 'Detener' : 'Grabar'}
            </span>
          </button>
        </div>

        {/* Secondary: Pause + Stop & Exit */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handlePauseResume}
            className={`h-12 rounded-xl flex items-center justify-center gap-2 transition-all touch-manipulation active:scale-[0.98] ${
              isPaused
                ? 'bg-yellow-500 hover:bg-yellow-400'
                : 'bg-slate-800 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            {isPaused ? (
              <>
                <svg className="w-4 h-4 text-slate-900" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span className="text-slate-900 font-bold text-sm">Reanudar</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
                <span className="text-slate-300 font-bold text-sm">Pausar</span>
              </>
            )}
          </button>

          <button
            onClick={handleStopAndGoHome}
            className="h-12 rounded-xl bg-red-900/30 border border-red-800/40 hover:bg-red-900/50 flex items-center justify-center gap-2 transition-all touch-manipulation active:scale-[0.98]"
          >
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12H3m6-6l-6 6 6 6" />
            </svg>
            <span className="text-red-400 font-bold text-sm">Detener y salir</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface MiniStatProps {
  label: string
  value: number
}

const MiniStat = ({ label, value }: MiniStatProps) => (
  <div className="bg-slate-900 rounded-xl py-2.5 px-2 text-center">
    <p className="text-lg font-bold text-slate-100 tabular-nums">{value}</p>
    <p className="text-[9px] text-slate-600 uppercase tracking-wide">{label}</p>
  </div>
)

export default StationPage
