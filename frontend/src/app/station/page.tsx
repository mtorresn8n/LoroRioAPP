import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, BASE_URL } from '@/core/api-client'
import { AudioEngine } from '@/core/audio-engine'
import { SoundDetector } from '@/core/detector'
import { AudioRecorder } from '@/core/recorder'
import { VolumeMeter } from '@/components/volume-meter'
import { Tooltip } from '@/components/tooltip'
import { useWakeLock } from '@/hooks/use-wakelock'
import { useWebSocket, useWsCommand } from '@/hooks/use-websocket'
import type { DailyStats, StationStatus, WsEvent } from '@/types'

const StationPage = () => {
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

  const engineRef = useRef(new AudioEngine())
  const recorderRef = useRef(new AudioRecorder())
  const detectorRef = useRef(new SoundDetector())
  const rafRef = useRef<number | null>(null)

  // Start station
  const handleStartStation = useCallback(async () => {
    setStationActive(true)
    setStartTime(Date.now())
    setUptime(0)
    void acquireWakeLock()
    connect()

    // Start sound detector
    const detector = detectorRef.current
    try {
      await detector.start(0.15, 300, 2_000)
      setDetectionActive(true)

      detector.onSoundDetected(() => {
        setLastSoundTime(new Date())
        send({ type: 'sound_detected' })
      })

      const tick = () => {
        setVolumeLevel(detector.getCurrentLevel())
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setDetectionActive(false)
    }
  }, [acquireWakeLock, connect, send])

  // Stop station
  const handleStopStation = useCallback(() => {
    setStationActive(false)
    setDetectionActive(false)
    setVolumeLevel(0)
    setIsPlaying(false)
    setIsRecording(false)
    setIsPaused(false)
    setCurrentClipName(null)

    detectorRef.current.stop()
    engineRef.current.stop()
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    releaseWakeLock()
    wsDisconnect()
  }, [releaseWakeLock, wsDisconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      detectorRef.current.stop()
      engineRef.current.stop()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  // Uptime counter (only when active)
  useEffect(() => {
    if (!stationActive || !startTime) return
    const id = setInterval(() => {
      setUptime(Math.floor((Date.now() - startTime) / 1_000))
    }, 1_000)
    return () => clearInterval(id)
  }, [stationActive, startTime])

  // Load stats periodically (only when active)
  useEffect(() => {
    if (!stationActive) return
    const loadStats = async () => {
      try {
        const data = await apiClient.get<DailyStats>('/api/v1/recordings/stats')
        setStats(data)
      } catch {
        // silent
      }
    }
    void loadStats()
    const id = setInterval(() => void loadStats(), 30_000)
    return () => clearInterval(id)
  }, [stationActive])

  // Load upcoming events (only when active)
  useEffect(() => {
    if (!stationActive) return
    const loadStatus = async () => {
      try {
        const events = await apiClient.get<Array<{ name: string; next_run: string; action_type: string }>>('/api/v1/scheduler/upcoming')
        if (events.length > 0) {
          setNextEvent({ schedule_name: events[0].name, trigger_at: events[0].next_run, action_type: events[0].action_type })
        }
      } catch {
        // silent
      }
    }
    void loadStatus()
    const id = setInterval(() => void loadStatus(), 60_000)
    return () => clearInterval(id)
  }, [stationActive])

  // WebSocket command handlers
  const handlePlayClip = useCallback(async (event: WsEvent) => {
    if (isPaused || !event.clip_id) return
    const engine = engineRef.current
    try {
      setCurrentClipName(event.clip_name ?? null)
      setIsPlaying(true)
      await engine.play(`${BASE_URL}/api/v1/clips/${event.clip_id}/file`)
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
      setIsRecording(true)
    } catch {
      // silent
    }
  }, [isRecording])

  const handleStopRecording = useCallback(async () => {
    if (!isRecording) return
    try {
      const blob = await recorderRef.current.stop()
      setIsRecording(false)
      const file = new File([blob], 'recording.webm', { type: blob.type })
      await apiClient.upload('/api/v1/recordings', file)
      setStats((prev) => prev ? { ...prev, recordings_made: prev.recordings_made + 1 } : prev)
    } catch {
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

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const formatTime = (date: Date | null) => {
    if (!date) return '--'
    return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const connectionColor = connectionState === 'connected'
    ? 'bg-brand-400'
    : connectionState === 'connecting'
      ? 'bg-yellow-400'
      : 'bg-red-500'

  const connectionLabel = connectionState === 'connected'
    ? 'Conectado'
    : connectionState === 'connecting'
      ? 'Conectando...'
      : 'Desconectado'

  // Inactive state - show start button
  if (!stationActive) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col select-none">
        <div className="bg-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-800 safe-top">
          <span className="text-sm text-slate-300 font-medium">Modo Estacion</span>
          <Link
            to="/"
            className="text-slate-500 text-sm hover:text-slate-300 transition-colors"
          >
            Menu
          </Link>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
          <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center">
            <svg className="w-12 h-12 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-100">Modo Estacion</h1>
            <p className="text-slate-400 text-sm mt-2 max-w-xs">
              Activa el microfono, la deteccion de sonido y la conexion con el servidor para entrenar a tu loro
            </p>
          </div>

          <button
            onClick={() => void handleStartStation()}
            className="w-full max-w-xs py-4 bg-brand-600 hover:bg-brand-500 rounded-2xl text-white font-bold text-lg transition-colors min-h-[56px]"
          >
            Iniciar Estacion
          </button>

          {/* Stats preview */}
          {stats && (
            <div className="w-full max-w-xs grid grid-cols-3 gap-3">
              <StatBadge label="Clips" value={stats.clips_played} />
              <StatBadge label="Grabaciones" value={stats.recordings_made} />
              <StatBadge label="Sesiones" value={stats.sessions_completed} />
            </div>
          )}
        </div>
      </div>
    )
  }

  // Active state - full station UI
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col select-none">
      {/* Top status bar */}
      <div className="bg-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-800 safe-top">
        <div className="flex items-center gap-2">
          <Tooltip text={`Estado de conexion con el servidor: ${connectionLabel}`} position="bottom">
            <span className={`w-2.5 h-2.5 rounded-full ${connectionColor} ${connectionState === 'connecting' ? 'animate-pulse' : ''}`} />
          </Tooltip>
          <span className="text-sm text-slate-300 font-medium">{connectionLabel}</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          {wakeLockActive && (
            <Tooltip text="Mantiene la pantalla encendida para que la app siga funcionando" position="bottom">
              <span className="cursor-help">Pantalla activa</span>
            </Tooltip>
          )}
          {detectionActive && (
            <Tooltip text="El microfono esta escuchando activamente" position="bottom">
              <span className="cursor-help text-brand-400">Escuchando</span>
            </Tooltip>
          )}
          <Tooltip text={`Tiempo activo en esta sesion: ${formatUptime(uptime)}`} position="bottom">
            <span className="cursor-help font-mono">{formatUptime(uptime)}</span>
          </Tooltip>
        </div>

        <Link
          to="/"
          className="text-slate-500 text-sm hover:text-slate-300 transition-colors"
        >
          Menu
        </Link>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-between px-6 py-8 gap-6">

        {/* Volume meter - large */}
        <div className="w-full flex flex-col items-center gap-4">
          <p className="text-slate-500 text-sm uppercase tracking-widest">Nivel de audio</p>
          <Tooltip text="Nivel de volumen del sonido ambiente en tiempo real" position="right">
            <div className="w-full h-8 cursor-help">
              <VolumeMeter
                level={volumeLevel}
                threshold={0.15}
                orientation="horizontal"
                className="h-8"
              />
            </div>
          </Tooltip>
          <p className="text-3xl font-mono font-bold text-slate-200">
            {Math.round(volumeLevel * 100)}%
          </p>
        </div>

        {/* Status info */}
        <div className="w-full grid grid-cols-2 gap-4">
          <div className="bg-slate-900 rounded-2xl p-4 flex flex-col">
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Ultimo sonido</p>
            <p className="text-slate-200 font-mono text-sm font-semibold">
              {formatTime(lastSoundTime)}
            </p>
          </div>
          <div className="bg-slate-900 rounded-2xl p-4 flex flex-col">
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Proximo evento</p>
            <p className="text-slate-200 text-sm font-semibold truncate">
              {nextEvent ? nextEvent.schedule_name : '--'}
            </p>
          </div>
        </div>

        {/* Current activity indicator */}
        <div className="w-full bg-slate-900 rounded-2xl p-5 min-h-[80px] flex items-center justify-center">
          {isPaused ? (
            <p className="text-yellow-400 font-bold text-xl">PAUSADO</p>
          ) : isRecording ? (
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
              <p className="text-red-300 font-bold text-xl">GRABANDO</p>
            </div>
          ) : isPlaying && currentClipName ? (
            <div className="flex flex-col items-center gap-1">
              <svg className="w-7 h-7 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <p className="text-brand-300 font-bold text-lg text-center">{currentClipName}</p>
            </div>
          ) : (
            <p className="text-slate-600 font-medium">En espera...</p>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="w-full grid grid-cols-3 gap-3">
            <StatBadge label="Clips" value={stats.clips_played} />
            <StatBadge label="Grabaciones" value={stats.recordings_made} />
            <StatBadge label="Sesiones" value={stats.sessions_completed} />
          </div>
        )}

        {/* Big manual controls */}
        <div className="w-full flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Tooltip text="Reproduce este sonido por el parlante de manera manual" position="top">
              <button
                onClick={handleManualPlay}
                disabled={isPaused}
                className="h-20 bg-brand-600 rounded-2xl flex flex-col items-center justify-center gap-1 hover:bg-brand-500 disabled:opacity-40 transition-colors"
              >
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span className="text-white text-xs font-semibold">Reproducir</span>
              </button>
            </Tooltip>

            <Tooltip text="Graba el sonido ambiente durante unos segundos" position="top">
              <button
                onClick={() => void handleManualRecord()}
                className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors ${
                  isRecording
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 1a11 11 0 100 22A11 11 0 0012 1zm0 2a9 9 0 110 18A9 9 0 0112 3z" />
                </svg>
                <span className="text-white text-xs font-semibold">
                  {isRecording ? 'Detener grab.' : 'Grabar'}
                </span>
              </button>
            </Tooltip>
          </div>

          <Tooltip
            text={isPaused ? 'Reanudar el modo estacion automatico' : 'Pausar temporalmente para no molestar al loro'}
            position="top"
          >
            <button
              onClick={handlePauseResume}
              className={`w-full h-16 rounded-2xl flex items-center justify-center gap-3 transition-colors ${
                isPaused
                  ? 'bg-yellow-600 hover:bg-yellow-500'
                  : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              {isPaused ? (
                <>
                  <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-white font-bold text-lg">Reanudar</span>
                </>
              ) : (
                <>
                  <svg className="w-7 h-7 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                  <span className="text-slate-300 font-bold text-lg">Pausar todo</span>
                </>
              )}
            </button>
          </Tooltip>

          {/* Stop station button */}
          <button
            onClick={handleStopStation}
            className="w-full h-14 rounded-2xl bg-red-900/40 hover:bg-red-900/60 border border-red-800/50 flex items-center justify-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            <span className="text-red-400 font-semibold text-sm">Detener Estacion</span>
          </button>
        </div>
      </div>
    </div>
  )
}

interface StatBadgeProps {
  label: string
  value: number
}

const StatBadge = ({ label, value }: StatBadgeProps) => (
  <div className="bg-slate-900 rounded-xl p-3 text-center">
    <p className="text-xl font-bold text-slate-100">{value}</p>
    <p className="text-xs text-slate-500">{label}</p>
  </div>
)

export default StationPage
