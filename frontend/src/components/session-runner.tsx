import { useEffect, useState } from 'react'
import type { Session, SessionStep } from '@/types'

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
  const [elapsed, setElapsed] = useState(0)
  const step: SessionStep | undefined = session.steps[currentStep]
  const total = session.steps.length

  useEffect(() => {
    setElapsed(0)
    const id = setInterval(() => setElapsed((s) => s + 1), 1_000)
    return () => clearInterval(id)
  }, [currentStep])

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
      </div>
    )
  }

  const progress = (currentStep / total) * 100

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
          className="bg-brand-500 h-2 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current step info */}
      <div className="bg-slate-700 rounded-lg p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎵</span>
          <div>
            <p className="text-xs text-slate-400">Clip</p>
            <p className="font-semibold text-slate-100">
              {step.clip_name ?? `Clip #${step.clip_id}`}
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <div>
            <p className="text-xs text-slate-400">Repeticiones</p>
            <p className="text-lg font-bold text-slate-100">{step.repetitions}</p>
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

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/30 rounded-lg p-3">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-blink" />
          <span className="text-sm text-red-300 font-medium">Grabando respuesta...</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        {onNext && (
          <button
            onClick={onNext}
            className="flex-1 py-3 bg-brand-500 rounded-xl text-white font-semibold active:bg-brand-600"
          >
            Siguiente
          </button>
        )}
        {onStop && (
          <button
            onClick={onStop}
            className="px-4 py-3 bg-slate-700 rounded-xl text-slate-300 font-semibold active:bg-slate-600"
          >
            Detener
          </button>
        )}
      </div>
    </div>
  )
}
