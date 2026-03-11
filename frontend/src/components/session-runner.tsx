import { useCallback, useEffect, useRef, useState } from 'react'
import { getApiBaseUrl } from '@/core/api-client'
import type { Session, SessionStep } from '@/types'
import { getSessionSteps } from '@/types'

const AUTO_ADVANCE_SECONDS = 4

type PlayState = 'playing' | 'waiting' | 'idle' | 'done' | 'advancing'

interface SessionRunnerProps {
  session: Session
  currentStep: number
  isRecording?: boolean
  onNext?: () => void
  onStop?: () => void
}

export const SessionRunner = ({
  session,
  currentStep,
  isRecording = false,
  onNext,
  onStop,
}: SessionRunnerProps) => {
  const steps = getSessionSteps(session)
  const step: SessionStep | undefined = steps[currentStep]
  const total = steps.length
  const isLastStep = currentStep >= total - 1

  const [elapsed, setElapsed] = useState(0)
  const [currentRep, setCurrentRep] = useState(0)
  const [playState, setPlayState] = useState<PlayState>('idle')
  const [waitCountdown, setWaitCountdown] = useState(0)
  const [advanceCountdown, setAdvanceCountdown] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)
  const onNextRef = useRef(onNext)
  onNextRef.current = onNext

  const clearTimers = useCallback(() => {
    if (waitTimerRef.current !== null) clearTimeout(waitTimerRef.current)
    if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current)
  }, [])

  // Elapsed time counter
  useEffect(() => {
    setElapsed(0)
    const id = setInterval(() => setElapsed((s) => s + 1), 1_000)
    return () => clearInterval(id)
  }, [currentStep])

  // Reset state when step changes
  useEffect(() => {
    setCurrentRep(0)
    setPlayState('idle')
    setWaitCountdown(0)
    setAdvanceCountdown(0)
    cancelledRef.current = true
    audioRef.current?.pause()
    clearTimers()
  }, [currentStep, clearTimers])

  const playClipOnce = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      const url = `${getApiBaseUrl()}/api/v1/clips/${step?.clip_id}/file`
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('Audio playback failed'))
      audio.play().catch(reject)
    })
  }, [step?.clip_id])

  const waitSeconds = useCallback((seconds: number): Promise<void> => {
    return new Promise((resolve) => {
      setWaitCountdown(seconds)
      let remaining = seconds
      const tick = () => {
        if (cancelledRef.current) { resolve(); return }
        remaining -= 1
        setWaitCountdown(remaining)
        if (remaining <= 0) {
          resolve()
        } else {
          waitTimerRef.current = setTimeout(tick, 1000)
        }
      }
      if (seconds <= 0) { setWaitCountdown(0); resolve(); return }
      waitTimerRef.current = setTimeout(tick, 1000)
    })
  }, [])

  const startAutoAdvance = useCallback(() => {
    if (isLastStep) {
      setPlayState('done')
      return
    }
    setPlayState('advancing')
    setAdvanceCountdown(AUTO_ADVANCE_SECONDS)
    let remaining = AUTO_ADVANCE_SECONDS
    const tick = () => {
      if (cancelledRef.current) return
      remaining -= 1
      setAdvanceCountdown(remaining)
      if (remaining <= 0) {
        onNextRef.current?.()
      } else {
        advanceTimerRef.current = setTimeout(tick, 1000)
      }
    }
    advanceTimerRef.current = setTimeout(tick, 1000)
  }, [isLastStep])

  const runStep = useCallback(async () => {
    if (!step) return
    cancelledRef.current = false
    const reps = step.repetitions ?? 1
    const wait = step.wait_seconds ?? 0

    for (let i = 0; i < reps; i++) {
      if (cancelledRef.current) return
      setCurrentRep(i + 1)
      setPlayState('playing')
      try {
        await playClipOnce()
      } catch {
        // Audio error, continue
      }
      if (cancelledRef.current) return
      // Wait between reps (not after the last one)
      if (i < reps - 1 && wait > 0) {
        setPlayState('waiting')
        await waitSeconds(wait)
      }
    }
    if (!cancelledRef.current) {
      startAutoAdvance()
    }
  }, [step, playClipOnce, waitSeconds, startAutoAdvance])

  // Auto-start playback when step is loaded
  useEffect(() => {
    if (step) {
      void runStep()
    }
    return () => {
      cancelledRef.current = true
      audioRef.current?.pause()
      clearTimers()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  const handleStop = useCallback(() => {
    cancelledRef.current = true
    audioRef.current?.pause()
    clearTimers()
    onStop?.()
  }, [onStop, clearTimers])

  const handleNext = useCallback(() => {
    cancelledRef.current = true
    audioRef.current?.pause()
    clearTimers()
    onNext?.()
  }, [onNext, clearTimers])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!step) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 text-center">
        <div className="text-4xl mb-2">🎉</div>
        <p className="text-xl font-bold text-brand-400">Sesion completada</p>
        <p className="text-slate-400 mt-1">{session.name}</p>
        <p className="text-slate-500 text-sm mt-1">Tiempo total: {formatTime(elapsed)}</p>
        {onStop && (
          <button
            onClick={handleStop}
            className="mt-4 px-6 py-2.5 bg-brand-500 rounded-xl text-white font-semibold text-sm active:bg-brand-600"
          >
            Volver
          </button>
        )}
      </div>
    )
  }

  const reps = step.repetitions ?? 1
  const progress = ((currentStep + (playState === 'done' ? 1 : currentRep / Math.max(reps, 1))) / total) * 100

  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Sesion</p>
          <p className="font-bold text-slate-100">{session.name}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-400">Paso</p>
          <p className="font-bold text-brand-400">{currentStep + 1} / {total}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-slate-700 rounded-full h-2">
        <div
          className="bg-brand-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {/* Current step info */}
      <div className="bg-slate-700 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎵</span>
          <div className="flex-1">
            <p className="text-xs text-slate-400">Clip</p>
            <p className="font-semibold text-slate-100">
              {step.clip_name ?? `Clip #${step.clip_id}`}
            </p>
          </div>
        </div>

        {/* Repetition counter */}
        <div className="flex gap-4">
          <div className="flex-1">
            <p className="text-xs text-slate-400">Repeticiones</p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-lg font-bold text-brand-400">{currentRep}</p>
              <p className="text-sm text-slate-500">/ {reps}</p>
            </div>
            {/* Rep dots */}
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {Array.from({ length: reps }, (_, i) => (
                <span
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    i < currentRep
                      ? 'bg-brand-500'
                      : i === currentRep && playState === 'playing'
                        ? 'bg-brand-500 animate-pulse'
                        : 'bg-slate-600'
                  }`}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400">Espera</p>
            <p className="text-lg font-bold text-slate-100">{step.wait_seconds}s</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Tiempo</p>
            <p className="text-lg font-bold text-slate-100">{formatTime(elapsed)}</p>
          </div>
        </div>
      </div>

      {/* Status indicator */}
      <div className={`flex items-center gap-2 rounded-lg p-3 ${
        playState === 'playing'
          ? 'bg-brand-900/30 border border-brand-500/30'
          : playState === 'waiting'
            ? 'bg-yellow-900/30 border border-yellow-500/30'
            : playState === 'advancing'
              ? 'bg-blue-900/30 border border-blue-500/30'
              : playState === 'done'
                ? 'bg-emerald-900/30 border border-emerald-500/30'
                : 'bg-slate-700/50'
      }`}>
        {playState === 'playing' && (
          <>
            <span className="w-3 h-3 rounded-full bg-brand-500 animate-pulse" />
            <span className="text-sm text-brand-300 font-medium">
              Reproduciendo... ({currentRep}/{reps})
            </span>
          </>
        )}
        {playState === 'waiting' && (
          <>
            <span className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
            <span className="text-sm text-yellow-300 font-medium">
              Pausa entre repeticiones... {waitCountdown}s
            </span>
          </>
        )}
        {playState === 'advancing' && (
          <>
            <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm text-blue-300 font-medium">
              Siguiente paso en {advanceCountdown}s...
            </span>
          </>
        )}
        {playState === 'done' && (
          <>
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-sm text-emerald-300 font-medium">
              Sesion completada
            </span>
          </>
        )}
        {playState === 'idle' && (
          <>
            <span className="w-3 h-3 rounded-full bg-slate-500" />
            <span className="text-sm text-slate-400 font-medium">Preparando...</span>
          </>
        )}
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/30 rounded-lg p-3">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm text-red-300 font-medium">Grabando respuesta...</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        {onNext && (
          <button
            onClick={handleNext}
            className="flex-1 py-3 bg-brand-500 rounded-xl text-white font-semibold active:bg-brand-600 active:scale-[0.98]"
          >
            {playState === 'advancing'
              ? `Siguiente ahora`
              : playState === 'done'
                ? 'Volver'
                : 'Saltar paso'}
          </button>
        )}
        {onStop && (
          <button
            onClick={handleStop}
            className="px-4 py-3 bg-slate-700 rounded-xl text-slate-300 font-semibold active:bg-slate-600"
          >
            Detener
          </button>
        )}
      </div>
    </div>
  )
}
