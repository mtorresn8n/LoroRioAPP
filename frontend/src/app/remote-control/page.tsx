import { useCallback, useEffect, useRef, useState } from 'react'
import { controlWsClient } from '@/core/control-ws-client'
import { useWebRTC } from '@/hooks/use-webrtc'
import type { ConnectionState, SignalingMessage, WsEvent } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface HostStatus {
  connected: boolean
  detectionActive: boolean
  isRecording: boolean
  isPlaying: boolean
  isPaused: boolean
  uptimeSeconds: number
  lastSoundAt: string | null
  battery: number | null
  stats: {
    clipsPlayed: number
    recordingsMade: number
    sessionsCompleted: number
    soundsDetected: number
  }
}

const initialHostStatus: HostStatus = {
  connected: false,
  detectionActive: false,
  isRecording: false,
  isPlaying: false,
  isPaused: false,
  uptimeSeconds: 0,
  lastSoundAt: null,
  battery: null,
  stats: { clipsPlayed: 0, recordingsMade: 0, sessionsCompleted: 0, soundsDetected: 0 },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatUptime = (secs: number): string => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

const formatLastSound = (iso: string | null): string => {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Component ─────────────────────────────────────────────────────────────────

const RemoteControlPage = () => {
  const [wsState, setWsState] = useState<ConnectionState>('disconnected')
  const [hostStatus, setHostStatus] = useState<HostStatus>(initialHostStatus)
  const [rtcActive, setRtcActive] = useState(false)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [pttActive, setPttActive] = useState(false)
  const [playingIndicator, setPlayingIndicator] = useState(false)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const sendSignaling = useCallback((msg: SignalingMessage) => {
    controlWsClient.sendRaw(msg as unknown as Record<string, unknown>)
  }, [])

  const handleRemoteStream = useCallback((stream: MediaStream) => {
    setRemoteStream(stream)
    // Assign srcObject immediately if the video element is already in the DOM,
    // then explicitly call play() — browsers may not honour the autoPlay
    // attribute when srcObject is set programmatically after mount.
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream
      remoteVideoRef.current.play().catch(() => {
        // Autoplay was blocked (e.g. user hasn't interacted yet).
        // The video will start once the user interacts with the page.
      })
    }
  }, [])

  const {
    start: startRTC,
    stop: stopRTC,
    handleSignaling,
    connectionState: rtcState,
    localAudioTrack,
  } = useWebRTC({
    role: 'caller',
    onRemoteStream: handleRemoteStream,
    sendSignaling,
  })

  // Fallback: assign stream to video element if ontrack fired before the ref
  // was populated (unlikely but possible on very fast connections).
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
      remoteVideoRef.current.play().catch(() => {})
    }
  }, [remoteStream])

  // Connect WS on mount
  useEffect(() => {
    controlWsClient.connect()
    const unsub = controlWsClient.onStateChange(setWsState)
    return () => {
      unsub()
      controlWsClient.disconnect()
    }
  }, [])

  // Handle WS events
  useEffect(() => {
    const handlers: Array<() => void> = []

    handlers.push(controlWsClient.onCommand('station_connected', () => {
      setHostStatus(prev => ({ ...prev, connected: true }))
    }))

    handlers.push(controlWsClient.onCommand('station_disconnected', () => {
      setHostStatus({ ...initialHostStatus })
      stopRTC()
      setRtcActive(false)
      setRemoteStream(null)
    }))

    handlers.push(controlWsClient.onCommand('station_status', (e: WsEvent) => {
      const p = (e.payload ?? (e as unknown as Record<string, unknown>)) as Record<string, unknown>
      setHostStatus(prev => ({
        ...prev,
        detectionActive: (p['detection_active'] as boolean) ?? prev.detectionActive,
        isRecording: (p['is_recording'] as boolean) ?? prev.isRecording,
        isPlaying: (p['is_playing'] as boolean) ?? prev.isPlaying,
        isPaused: (p['is_paused'] as boolean) ?? prev.isPaused,
        uptimeSeconds: (p['uptime_seconds'] as number) ?? prev.uptimeSeconds,
        lastSoundAt: (p['last_sound_at'] as string | null) ?? prev.lastSoundAt,
        stats: {
          clipsPlayed: ((p['stats'] as Record<string, number> | undefined)?.['clips_played']) ?? prev.stats.clipsPlayed,
          recordingsMade: ((p['stats'] as Record<string, number> | undefined)?.['recordings_made']) ?? prev.stats.recordingsMade,
          sessionsCompleted: ((p['stats'] as Record<string, number> | undefined)?.['sessions_completed']) ?? prev.stats.sessionsCompleted,
          soundsDetected: ((p['stats'] as Record<string, number> | undefined)?.['sounds_detected']) ?? prev.stats.soundsDetected,
        },
      }))
    }))

    handlers.push(controlWsClient.onCommand('station_heartbeat', (e: WsEvent) => {
      const p = (e.payload ?? (e as unknown as Record<string, unknown>)) as Record<string, unknown>
      setHostStatus(prev => ({
        ...prev,
        battery: (p['battery'] as number | null) ?? prev.battery,
      }))
    }))

    handlers.push(controlWsClient.onCommand('webrtc_answer', (e: WsEvent) => {
      if (e.sdp) void handleSignaling({ type: 'webrtc_answer', sdp: e.sdp })
    }))

    handlers.push(controlWsClient.onCommand('webrtc_ice_candidate', (e: WsEvent) => {
      if (e.candidate) void handleSignaling({ type: 'webrtc_ice_candidate', candidate: e.candidate })
    }))

    handlers.push(controlWsClient.onCommand('webrtc_reset', () => {
      void handleSignaling({ type: 'webrtc_reset' })
      setRtcActive(false)
      setRemoteStream(null)
    }))

    handlers.push(controlWsClient.onCommand('clip_started', () => {
      setPlayingIndicator(true)
    }))

    handlers.push(controlWsClient.onCommand('clip_finished', () => {
      setPlayingIndicator(false)
    }))

    return () => handlers.forEach(unsub => unsub())
  }, [handleSignaling, stopRTC])

  // Connect WebRTC
  const handleConnectRTC = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      await startRTC(stream)
      setRtcActive(true)
    } catch {
      // Mic denied or unavailable
    }
  }, [startRTC])

  const handleDisconnectRTC = useCallback(() => {
    stopRTC()
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) track.stop()
      localStreamRef.current = null
    }
    setRtcActive(false)
    setRemoteStream(null)
  }, [stopRTC])

  // Push-to-talk
  const handlePTTDown = useCallback(() => {
    if (localAudioTrack) {
      localAudioTrack.enabled = true
      setPttActive(true)
    }
  }, [localAudioTrack])

  const handlePTTUp = useCallback(() => {
    if (localAudioTrack) {
      localAudioTrack.enabled = false
      setPttActive(false)
    }
  }, [localAudioTrack])

  // Photo capture
  const handleCapturePhoto = useCallback(() => {
    if (!remoteVideoRef.current) return
    const video = remoteVideoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `loro-foto-${Date.now()}.png`
    link.click()
  }, [])

  // Quick actions
  const sendAction = useCallback((type: string, extra?: Record<string, unknown>) => {
    controlWsClient.sendRaw({ type, ...extra })
  }, [])

  // ── Connection state colors ──────────────────────────────────────────────────

  const wsColor =
    wsState === 'connected' ? 'bg-emerald-400' :
    wsState === 'connecting' ? 'bg-yellow-400 animate-pulse' :
    wsState === 'error' || wsState === 'auth_failed' ? 'bg-red-500' :
    'bg-slate-600'

  const wsLabel =
    wsState === 'connected' ? 'Conectado al servidor' :
    wsState === 'connecting' ? 'Conectando...' :
    wsState === 'auth_failed' ? 'Error de autenticacion' :
    wsState === 'replaced' ? 'Sesion reemplazada' :
    wsState === 'error' ? 'Error de conexion' :
    'Desconectado'

  const rtcColor =
    rtcState === 'connected' ? 'bg-emerald-400' :
    rtcState === 'connecting' || rtcState === 'new' ? 'bg-yellow-400 animate-pulse' :
    'bg-slate-600'

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-6">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Control Remoto</h1>
          <p className="text-slate-500 text-sm mt-0.5">Controla el Host desde aqui</p>
        </div>

        {/* WS status */}
        <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-2 border border-slate-800">
          <span className={`w-2 h-2 rounded-full shrink-0 ${wsColor}`} />
          <span className="text-xs text-slate-400">{wsLabel}</span>
        </div>
      </div>

      {/* ── Host desconectado banner ─────────────────────────────────────── */}
      {!hostStatus.connected && (
        <div className="mb-6 bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-slate-300 text-sm font-medium">Host desconectado</p>
            <p className="text-slate-500 text-xs mt-0.5">Esperando que el Host inicie el Modo Estacion</p>
          </div>
        </div>
      )}

      {/* ── Main grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Left column: Video feed ──────────────────────────────────── */}
        <div className="space-y-4">

          {/* Video card */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            {/* Video container */}
            <div className="relative bg-black aspect-video">
              {/* Remote video — muted prevents audio feedback (caller also has a mic).
                  autoPlay + playsInline are required for mobile browsers. */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity ${remoteStream ? 'opacity-100' : 'opacity-0'}`}
              />

              {/* No stream placeholder */}
              {!remoteStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                    <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-slate-500 text-xs text-center px-4">
                    {rtcActive ? 'Conectando camara...' : 'Sin transmision de video'}
                  </p>
                </div>
              )}

              {/* Playing indicator overlay */}
              {playingIndicator && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-emerald-900/80 backdrop-blur-sm px-2 py-1 rounded-md">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-300 text-[10px] font-medium">Reproduciendo</span>
                </div>
              )}

              {/* RTC state badge */}
              {rtcActive && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded-md">
                  <span className={`w-1.5 h-1.5 rounded-full ${rtcColor}`} />
                  <span className="text-slate-300 text-[10px]">{rtcState}</span>
                </div>
              )}

              {/* Photo capture button (only when stream active) */}
              {remoteStream && (
                <button
                  onClick={handleCapturePhoto}
                  title="Capturar foto"
                  className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-slate-900/80 backdrop-blur-sm border border-slate-700 flex items-center justify-center hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Video controls bar */}
            <div className="px-4 py-3 flex items-center gap-3 border-t border-slate-800">
              {!rtcActive ? (
                <button
                  onClick={() => void handleConnectRTC()}
                  disabled={!hostStatus.connected}
                  className="flex-1 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Conectar camara
                </button>
              ) : (
                <button
                  onClick={handleDisconnectRTC}
                  className="flex-1 py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-800/50 text-red-400 font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Desconectar
                </button>
              )}

              {/* Push-to-talk */}
              <button
                onMouseDown={handlePTTDown}
                onMouseUp={handlePTTUp}
                onTouchStart={(e) => { e.preventDefault(); handlePTTDown() }}
                onTouchEnd={(e) => { e.preventDefault(); handlePTTUp() }}
                disabled={!rtcActive || !localAudioTrack}
                title="Mantener presionado para hablar"
                className={`w-12 h-9 rounded-lg font-bold text-xs transition-all border touch-manipulation select-none ${
                  pttActive
                    ? 'bg-emerald-500 border-emerald-400 text-white scale-95'
                    : rtcActive && localAudioTrack
                      ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-800/50 border-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            </div>
          </div>

          {/* PTT hint */}
          {rtcActive && localAudioTrack && (
            <p className="text-slate-600 text-xs text-center">
              Manten presionado el microfono para hablar (walkie talkie)
            </p>
          )}

        </div>

        {/* ── Right column: Controls + Status ─────────────────────────── */}
        <div className="space-y-4">

          {/* Quick actions */}
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Acciones rapidas</p>

            <div className="grid grid-cols-2 gap-2">
              {/* Play random */}
              <button
                onClick={() => {
                  sendAction('play_random')
                  setHostStatus(prev => ({ ...prev, isPlaying: true }))
                }}
                disabled={!hostStatus.connected || hostStatus.isPaused}
                className="h-16 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors active:scale-[0.97] flex flex-col items-center justify-center gap-1 touch-manipulation"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span className="text-xs">Reproducir</span>
              </button>

              {/* Start recording */}
              <button
                onClick={() => {
                  const action = hostStatus.isRecording ? 'stop_recording' : 'start_recording'
                  sendAction(action)
                  setHostStatus(prev => ({ ...prev, isRecording: !prev.isRecording }))
                }}
                disabled={!hostStatus.connected}
                className={`h-16 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm transition-colors active:scale-[0.97] flex flex-col items-center justify-center gap-1 touch-manipulation ${
                  hostStatus.isRecording
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200'
                }`}
              >
                {hostStatus.isRecording ? (
                  <>
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    <span className="text-xs">Detener</span>
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="6" />
                    </svg>
                    <span className="text-xs">Grabar</span>
                  </>
                )}
              </button>

              {/* Stop */}
              <button
                onClick={() => {
                  sendAction('stop')
                  setHostStatus(prev => ({ ...prev, isPlaying: false }))
                }}
                disabled={!hostStatus.connected || !hostStatus.isPlaying}
                className="h-16 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 font-bold text-sm transition-colors active:scale-[0.97] flex flex-col items-center justify-center gap-1 touch-manipulation"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                <span className="text-xs">Parar audio</span>
              </button>

              {/* Pause / Resume */}
              <button
                onClick={() => {
                  sendAction(hostStatus.isPaused ? 'resume' : 'pause')
                  setHostStatus(prev => ({ ...prev, isPaused: !prev.isPaused }))
                }}
                disabled={!hostStatus.connected}
                className={`h-16 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm transition-colors active:scale-[0.97] flex flex-col items-center justify-center gap-1 touch-manipulation ${
                  hostStatus.isPaused
                    ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900'
                    : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200'
                }`}
              >
                {hostStatus.isPaused ? (
                  <>
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span className="text-xs">Reanudar</span>
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                    <span className="text-xs">Pausar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Host status */}
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Estado del Host</p>
              {hostStatus.connected ? (
                <span className="bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded-md text-xs font-medium">Conectado</span>
              ) : (
                <span className="bg-slate-800 text-slate-500 px-2 py-0.5 rounded-md text-xs">Desconectado</span>
              )}
            </div>

            {/* Status badges row */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {hostStatus.detectionActive && (
                <span className="bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded-md text-xs">Escuchando</span>
              )}
              {hostStatus.isRecording && (
                <span className="bg-red-900/40 text-red-400 px-2 py-0.5 rounded-md text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Grabando
                </span>
              )}
              {hostStatus.isPlaying && (
                <span className="bg-brand-900/40 text-brand-400 px-2 py-0.5 rounded-md text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                  Reproduciendo
                </span>
              )}
              {hostStatus.isPaused && (
                <span className="bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded-md text-xs">Pausado</span>
              )}
              {!hostStatus.detectionActive && !hostStatus.isRecording && !hostStatus.isPlaying && !hostStatus.isPaused && hostStatus.connected && (
                <span className="text-slate-600 text-xs">Sin actividad</span>
              )}
            </div>

            {/* Uptime + last sound */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-800/50 rounded-lg p-2.5">
                <p className="text-slate-100 text-sm font-mono font-bold tabular-nums">
                  {hostStatus.uptimeSeconds > 0 ? formatUptime(hostStatus.uptimeSeconds) : '--'}
                </p>
                <p className="text-slate-500 text-[10px] uppercase tracking-wide mt-0.5">Tiempo activo</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2.5">
                <p className="text-slate-100 text-sm font-mono font-bold tabular-nums">
                  {formatLastSound(hostStatus.lastSoundAt)}
                </p>
                <p className="text-slate-500 text-[10px] uppercase tracking-wide mt-0.5">Ult. sonido</p>
              </div>
            </div>

            {/* Battery */}
            {hostStatus.battery !== null && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-500 text-xs">Bateria</span>
                  <span className="text-slate-300 text-xs font-mono">{hostStatus.battery}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      hostStatus.battery > 50 ? 'bg-emerald-500' :
                      hostStatus.battery > 20 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${hostStatus.battery}%` }}
                  />
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-2">
              <StatTile label="Clips" value={hostStatus.stats.clipsPlayed} />
              <StatTile label="Grabac." value={hostStatus.stats.recordingsMade} />
              <StatTile label="Sesiones" value={hostStatus.stats.sessionsCompleted} />
              <StatTile label="Sonidos" value={hostStatus.stats.soundsDetected} />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface StatTileProps {
  label: string
  value: number
}

const StatTile = ({ label, value }: StatTileProps) => (
  <div className="bg-slate-800/50 rounded-lg py-2 px-1 text-center">
    <p className="text-slate-100 text-base font-bold tabular-nums">{value}</p>
    <p className="text-slate-600 text-[9px] uppercase tracking-wide mt-0.5 truncate">{label}</p>
  </div>
)

export default RemoteControlPage
