import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/core/api-client'
import { AudioRecorder } from '@/core/recorder'
import { SessionRunner } from '@/components/session-runner'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'
import type { Clip, Session, SessionCreate, SessionLog, SessionStep } from '@/types'
import { getSessionSteps } from '@/types'

type View = 'list' | 'create' | 'detail' | 'running' | 'edit'

// ── Inline mic recorder for creating clips on the fly ────────────────────────

interface StepRecorderProps {
  onRecorded: (clip: Clip) => void
  onCancel: () => void
}

const StepRecorder = ({ onRecorded, onCancel }: StepRecorderProps) => {
  const { showToast } = useToast()
  const recorderRef = useRef(new AudioRecorder())
  const rafRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [recording, setRecording] = useState(false)
  const [volume, setVolume] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [clipName, setClipName] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Preview state: blob recorded but not yet uploaded
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  const startRecording = useCallback(async () => {
    // Reset preview if re-recording
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
    setPreviewBlob(null)
    setPlaying(false)
    try {
      await recorderRef.current.start()
      setRecording(true)
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)

      const tick = () => {
        setVolume(recorderRef.current.getVolumeLevel())
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      showToast('No se pudo acceder al microfono', 'error')
    }
  }, [showToast, previewUrl])

  const stopRecording = useCallback(async () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    if (timerRef.current !== null) clearInterval(timerRef.current)
    setRecording(false)
    setVolume(0)

    try {
      const blob = await recorderRef.current.stop()
      const url = URL.createObjectURL(blob)
      setPreviewBlob(blob)
      setPreviewUrl(url)
    } catch {
      showToast('Error al detener la grabacion', 'error')
    }
  }, [showToast])

  const handlePlay = useCallback(() => {
    if (!previewUrl) return
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    const audio = new Audio(previewUrl)
    audioRef.current = audio
    audio.play().catch(() => {})
    setPlaying(true)
    audio.onended = () => setPlaying(false)
  }, [previewUrl, playing])

  const handleUpload = useCallback(async () => {
    if (!previewBlob || !clipName.trim()) return
    const name = clipName.trim()
    setUploading(true)
    try {
      const file = new File([previewBlob], `${name}.webm`, { type: previewBlob.type })
      const clip = await apiClient.upload<Clip>('/api/v1/clips/', file, {
        name,
        type: 'sound',
        category: 'training',
        tags: 'grabado,entrenamiento',
      })
      showToast('Clip grabado y guardado', 'success')
      onRecorded(clip)
    } catch {
      showToast('Error al guardar el clip', 'error')
    } finally {
      setUploading(false)
    }
  }, [previewBlob, clipName, showToast, onRecorded])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (timerRef.current !== null) clearInterval(timerRef.current)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="bg-slate-900 border border-brand-500/30 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-brand-300">Grabar clip nuevo</p>
        <button onClick={onCancel} className="text-slate-500 text-xs hover:text-slate-300">
          Cancelar
        </button>
      </div>

      <div>
        <input
          type="text"
          value={clipName}
          onChange={(e) => setClipName(e.target.value)}
          placeholder="Nombre del clip (obligatorio, ej: Hola buen dia)"
          className={`w-full bg-slate-800 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 ${
            clipName.trim() ? 'focus:ring-brand-500' : 'ring-2 ring-yellow-500/50 focus:ring-yellow-500'
          }`}
          disabled={recording || uploading}
          autoFocus
        />
        {!clipName.trim() && !recording && (
          <p className="text-yellow-400/80 text-xs mt-1">Escribe un nombre antes de grabar</p>
        )}
      </div>

      {/* Recording indicator */}
      {recording && (
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-red-300 text-sm font-mono">{formatTime(elapsed)}</span>
          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-75"
              style={{ width: `${Math.min(volume * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Preview: listen before saving */}
      {previewBlob && !recording && (
        <div className="flex items-center gap-3 bg-slate-800 rounded-lg p-3">
          <button
            onClick={handlePlay}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              playing ? 'bg-brand-600' : 'bg-brand-500 hover:bg-brand-600'
            }`}
            aria-label={playing ? 'Pausar' : 'Escuchar'}
          >
            {playing ? (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <div className="flex-1">
            <p className="text-slate-200 text-sm font-medium">{clipName.trim() || 'Grabacion sin nombre'}</p>
            <p className="text-slate-500 text-xs">{formatTime(elapsed)} · Toca play para escuchar</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {!recording && !previewBlob && (
          <button
            onClick={() => void startRecording()}
            disabled={uploading || !clipName.trim()}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-xl active:scale-[0.98] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            Grabar
          </button>
        )}
        {recording && (
          <button
            onClick={() => void stopRecording()}
            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl active:scale-[0.98] transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Detener
          </button>
        )}
        {previewBlob && !recording && (
          <>
            <button
              onClick={() => void startRecording()}
              disabled={uploading}
              className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-xl active:scale-[0.98] transition-colors disabled:opacity-50"
            >
              Regrabar
            </button>
            <button
              onClick={() => void handleUpload()}
              disabled={uploading || !clipName.trim()}
              className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl active:scale-[0.98] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading ? 'Guardando...' : 'Usar este clip'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Info tip: a small (i) icon that shows a tooltip on tap ───────────────────

const InfoTip = ({ text }: { text: string }) => (
  <Tooltip text={text} position="bottom">
    <button
      type="button"
      className="w-5 h-5 rounded-full bg-slate-700 text-slate-400 text-[10px] font-bold flex items-center justify-center hover:bg-slate-600 hover:text-slate-200 transition-colors shrink-0"
      aria-label="Mas informacion"
    >
      i
    </button>
  </Tooltip>
)

// ── Main page ────────────────────────────────────────────────────────────────

const TrainingPage = () => {
  const { showToast } = useToast()
  const [view, setView] = useState<View>('list')
  const [sessions, setSessions] = useState<Session[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [logs, setLogs] = useState<SessionLog[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)

  // Create / edit form state
  const [formName, setFormName] = useState('')
  const [formObjective, setFormObjective] = useState('')
  const [formSteps, setFormSteps] = useState<SessionStep[]>([])
  const [formRewardId, setFormRewardId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [recordingStepIndex, setRecordingStepIndex] = useState<number | 'new' | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [sessionData, clipData] = await Promise.all([
        apiClient.get<Session[]>('/api/v1/training/sessions'),
        apiClient.get<Clip[]>('/api/v1/clips/'),
      ])
      setSessions(Array.isArray(sessionData) ? sessionData : [])
      setClips(Array.isArray(clipData) ? clipData : [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSelectSession = useCallback(async (session: Session) => {
    setSelectedSession(session)
    try {
      const logData = await apiClient.get<SessionLog[]>(`/api/v1/training/sessions/${session.id}/logs`)
      setLogs(Array.isArray(logData) ? logData : [])
    } catch {
      setLogs([])
    }
    setView('detail')
  }, [])

  const handleDeleteSession = useCallback(async (session: Session) => {
    if (!confirm(`Eliminar sesion "${session.name}"?`)) return
    try {
      await apiClient.del(`/api/v1/training/sessions/${session.id}`)
      setSessions((prev) => prev.filter((s) => s.id !== session.id))
      if (selectedSession?.id === session.id) {
        setSelectedSession(null)
        setView('list')
      }
      showToast('Sesion eliminada', 'success')
    } catch {
      showToast('Error al eliminar la sesion', 'error')
    }
  }, [selectedSession, showToast])

  const handleStartSession = useCallback(() => {
    setCurrentStep(0)
    setView('running')
  }, [])

  const handleNextStep = useCallback(() => {
    if (!selectedSession) return
    const totalSteps = getSessionSteps(selectedSession).length
    setCurrentStep((prev) => {
      if (prev < totalSteps - 1) {
        return prev + 1
      }
      // Schedule view change after state update
      setTimeout(() => setView('detail'), 0)
      return prev
    })
  }, [selectedSession])

  const handleAddStep = useCallback(() => {
    const firstClip = clips[0]
    if (!firstClip) return
    setFormSteps((prev) => [
      ...prev,
      { clip_id: firstClip.id, clip_name: firstClip.name, repetitions: 3, wait_seconds: 5 },
    ])
  }, [clips])

  const handleRemoveStep = useCallback((index: number) => {
    setFormSteps((prev) => prev.filter((_, i) => i !== index))
    if (recordingStepIndex === index) setRecordingStepIndex(null)
  }, [recordingStepIndex])

  const handleUpdateStep = useCallback(
    (index: number, field: keyof SessionStep, value: number | string) => {
      setFormSteps((prev) =>
        prev.map((step, i) => {
          if (i !== index) return step
          if (field === 'clip_id') {
            const clip = clips.find((c) => c.id === String(value))
            return { ...step, clip_id: String(value), clip_name: clip?.name }
          }
          return { ...step, [field]: typeof step[field] === 'number' ? Number(value) : value }
        }),
      )
    },
    [clips],
  )

  const handleRecordedClip = useCallback((clip: Clip, stepIndex: number | 'new') => {
    setClips((prev) => [clip, ...prev])
    if (stepIndex === 'new') {
      setFormSteps((prev) => [
        ...prev,
        { clip_id: clip.id, clip_name: clip.name, repetitions: 3, wait_seconds: 5 },
      ])
    } else {
      setFormSteps((prev) =>
        prev.map((s, i) => i === stepIndex ? { ...s, clip_id: clip.id, clip_name: clip.name } : s),
      )
    }
    setRecordingStepIndex(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!formName.trim() || formSteps.length === 0) return
    setSaving(true)
    try {
      const payload: SessionCreate = {
        name: formName.trim(),
        objective: formObjective.trim() || undefined,
        config: {
          steps: formSteps,
          ...(formRewardId !== '' && { reward_clip_id: formRewardId }),
        },
      }
      await apiClient.post('/api/v1/training/sessions', payload)
      await loadData()
      setView('list')
      setFormName('')
      setFormObjective('')
      setFormSteps([])
      setFormRewardId('')
      showToast('Sesion creada', 'success')
    } catch {
      showToast('Error al crear la sesion', 'error')
    } finally {
      setSaving(false)
    }
  }, [formName, formObjective, formSteps, formRewardId, loadData, showToast])

  // Populate form from existing session data and switch to edit view
  const handleEditSession = useCallback((session: Session) => {
    setFormName(session.name)
    setFormObjective(session.objective ?? '')
    setFormSteps(getSessionSteps(session))
    setFormRewardId(session.config.reward_clip_id ?? '')
    setRecordingStepIndex(null)
    setView('edit')
  }, [])

  const handleUpdate = useCallback(async () => {
    if (!selectedSession || !formName.trim() || formSteps.length === 0) return
    setSaving(true)
    try {
      const payload = {
        name: formName.trim(),
        objective: formObjective.trim() || undefined,
        config: {
          steps: formSteps,
          ...(formRewardId !== '' && { reward_clip_id: formRewardId }),
        },
      }
      const updated = await apiClient.put<Session>(
        `/api/v1/training/sessions/${selectedSession.id}`,
        payload,
      )
      // Refresh session list and update the selected session in-place
      await loadData()
      setSelectedSession(updated)
      setView('detail')
      showToast('Sesion actualizada', 'success')
    } catch {
      showToast('Error al actualizar la sesion', 'error')
    } finally {
      setSaving(false)
    }
  }, [selectedSession, formName, formObjective, formSteps, formRewardId, loadData, showToast])

  const rewardClips = clips.filter((c) => c.type === 'reward')

  // ── Running view ─────────────────────────────────────────────────────────
  if (view === 'running' && selectedSession) {
    return (
      <div className="p-4 pb-6 max-w-lg md:max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-4 pt-2">
          <button
            onClick={() => setView('detail')}
            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center active:bg-slate-700"
            aria-label="Volver"
          >
            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-slate-100">En sesion</h1>
        </div>
        <SessionRunner
          session={selectedSession}
          currentStep={currentStep}
          onNext={handleNextStep}
          onStop={() => setView('detail')}
        />
      </div>
    )
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (view === 'detail' && selectedSession) {
    const steps = getSessionSteps(selectedSession)
    return (
      <div className="flex flex-col gap-5 p-4 pb-8 max-w-lg md:max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => setView('list')}
            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center active:bg-slate-700"
            aria-label="Volver"
          >
            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-100">{selectedSession.name}</h1>
            {selectedSession.objective && (
              <p className="text-slate-400 text-sm mt-0.5">{selectedSession.objective}</p>
            )}
          </div>
        </div>

        {/* How it works hint */}
        <div className="bg-brand-900/20 border border-brand-500/20 rounded-xl p-3 flex items-start gap-2.5">
          <svg className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-brand-200/80 leading-relaxed">
            Al iniciar, cada paso reproduce el clip seleccionado la cantidad de veces indicada, con la pausa configurada entre repeticiones. Avanza manualmente entre pasos.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStartSession}
            disabled={steps.length === 0}
            className="flex-1 py-3 bg-brand-500 rounded-xl text-white font-semibold text-sm active:bg-brand-600 active:scale-[0.98] min-h-[48px] disabled:opacity-50"
          >
            {steps.length === 0 ? 'Sin pasos para iniciar' : 'Iniciar sesion'}
          </button>
          <button
            onClick={() => handleEditSession(selectedSession)}
            className="px-4 py-3 bg-slate-800 rounded-xl text-slate-300 font-semibold text-sm hover:bg-slate-700 active:scale-[0.98] min-h-[48px]"
            aria-label="Editar sesion"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => void handleDeleteSession(selectedSession)}
            className="px-4 py-3 bg-slate-800 rounded-xl text-red-400 font-semibold text-sm hover:bg-red-600/20 active:scale-[0.98] min-h-[48px]"
            aria-label="Eliminar sesion"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pasos ({steps.length})
            </h2>
            <InfoTip text="Cada paso reproduce un clip de audio varias veces con una pausa entre repeticiones. Tu loro escucha e intenta imitar." />
          </div>
          {steps.length === 0 ? (
            <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-6 text-center">
              <p className="text-sm text-slate-500">Esta sesion no tiene pasos configurados</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {steps.map((step, i) => (
                <div key={i} className="bg-slate-800 rounded-xl p-4 flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-slate-700 text-slate-300 text-sm font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-slate-100 font-medium">{step.clip_name ?? `Clip #${step.clip_id}`}</p>
                    <p className="text-slate-400 text-sm">{step.repetitions}x · espera {step.wait_seconds}s</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logs */}
        {logs.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Historial
            </h2>
            <div className="flex flex-col gap-2">
              {logs.map((log) => (
                <div key={log.id} className="bg-slate-800 rounded-xl p-4">
                  <p className="text-slate-100 text-sm">
                    {new Date(log.executed_at).toLocaleDateString('es')}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    Paso {log.step_number} · {log.result ?? 'sin resultado'}
                    {log.response_detected && ' · respuesta detectada'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Edit view ────────────────────────────────────────────────────────────
  if (view === 'edit' && selectedSession) {
    return (
      <div className="flex flex-col gap-5 p-4 pb-8 max-w-lg md:max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => { setView('detail'); setRecordingStepIndex(null) }}
            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center active:bg-slate-700"
            aria-label="Cancelar"
          >
            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Editar sesion</h1>
            <p className="text-slate-400 text-xs mt-0.5">Modifica los datos de la sesion</p>
          </div>
        </div>

        {/* Name */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-medium text-slate-300">Nombre</label>
            <InfoTip text="Dale un nombre descriptivo a la sesion, por ejemplo: 'Sesion matutina' o 'Aprender hola'" />
          </div>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Ej: Sesion matutina"
            className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Objective */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-medium text-slate-300">Objetivo</label>
            <InfoTip text="Describe que queres lograr con esta sesion. Te ayuda a recordar el proposito." />
          </div>
          <input
            type="text"
            value={formObjective}
            onChange={(e) => setFormObjective(e.target.value)}
            placeholder="Ej: Aprender a decir 'hola buen dia'"
            className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-300">Pasos</label>
              <InfoTip text="Cada paso reproduce un clip de audio. Tu loro lo escuchara la cantidad de veces que indiques, con una pausa entre cada repeticion." />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRecordingStepIndex('new')}
                disabled={recordingStepIndex !== null}
                className="text-red-400 text-sm font-medium disabled:opacity-40 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
                Grabar
              </button>
              <button
                onClick={handleAddStep}
                disabled={clips.length === 0}
                className="text-brand-400 text-sm font-medium disabled:opacity-40"
              >
                + Agregar
              </button>
            </div>
          </div>

          {/* New step recorder (for adding a brand new step) */}
          {recordingStepIndex === 'new' && (
            <div className="mb-3">
              <StepRecorder
                onRecorded={(clip) => handleRecordedClip(clip, 'new')}
                onCancel={() => setRecordingStepIndex(null)}
              />
            </div>
          )}

          <div className="flex flex-col gap-3">
            {formSteps.map((step, i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-400">Paso {i + 1}</span>
                  <button
                    onClick={() => handleRemoveStep(i)}
                    className="text-red-400 text-xs hover:text-red-300"
                  >
                    Quitar
                  </button>
                </div>

                {/* Clip selector or recorder */}
                {recordingStepIndex === i ? (
                  <StepRecorder
                    onRecorded={(clip) => handleRecordedClip(clip, i)}
                    onCancel={() => setRecordingStepIndex(null)}
                  />
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={step.clip_id}
                      onChange={(e) => handleUpdateStep(i, 'clip_id', e.target.value)}
                      className="flex-1 bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                    >
                      {clips.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <Tooltip text="Grabar un clip nuevo para este paso" position="left">
                      <button
                        onClick={() => setRecordingStepIndex(i)}
                        className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center hover:bg-red-600/30 transition-colors"
                        aria-label="Grabar clip"
                      >
                        <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                      </button>
                    </Tooltip>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs text-slate-400">Repeticiones</label>
                      <InfoTip text="Cuantas veces se reproduce el clip seguidas. Mas repeticiones ayudan a que el loro memorice mejor." />
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={step.repetitions}
                      onChange={(e) => handleUpdateStep(i, 'repetitions', e.target.value)}
                      className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded-lg text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs text-slate-400">Espera (s)</label>
                      <InfoTip text="Segundos de silencio entre cada repeticion. Dale tiempo al loro para procesar e intentar imitar." />
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={step.wait_seconds}
                      onChange={(e) => handleUpdateStep(i, 'wait_seconds', e.target.value)}
                      className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded-lg text-sm focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
            {formSteps.length === 0 && recordingStepIndex !== 'new' && (
              <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-8 text-center">
                <svg className="w-10 h-10 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-sm text-slate-500">Agrega al menos un paso</p>
                <p className="text-xs text-slate-600 mt-1">Usa "+ Agregar" para elegir un clip existente o "Grabar" para crear uno nuevo</p>
              </div>
            )}
          </div>
        </div>

        {/* Reward clip */}
        {rewardClips.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-sm font-medium text-slate-300">
                Clip de recompensa
              </label>
              <InfoTip text="Se reproduce al final de la sesion como premio. Subi clips de tipo 'recompensa' en la Biblioteca para verlos aca." />
            </div>
            <select
              value={formRewardId}
              onChange={(e) => setFormRewardId(e.target.value)}
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Sin recompensa (opcional)</option>
              {rewardClips.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={() => void handleUpdate()}
          disabled={!formName.trim() || formSteps.length === 0 || saving}
          className="w-full py-3 bg-brand-500 rounded-xl text-white font-semibold text-sm disabled:opacity-50 active:bg-brand-600 active:scale-[0.98] min-h-[48px]"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    )
  }

  // ── Create view ──────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="flex flex-col gap-5 p-4 pb-8 max-w-lg md:max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => { setView('list'); setRecordingStepIndex(null) }}
            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center active:bg-slate-700"
            aria-label="Cancelar"
          >
            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Nueva sesion</h1>
            <p className="text-slate-400 text-xs mt-0.5">Configura que va a escuchar tu loro</p>
          </div>
        </div>

        {/* Guide card */}
        <div className="bg-brand-900/20 border border-brand-500/20 rounded-xl p-3 flex items-start gap-2.5">
          <svg className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <div className="text-xs text-brand-200/80 leading-relaxed space-y-1">
            <p><strong>Una sesion</strong> es una rutina de entrenamiento. Agrega los clips de audio que queres que tu loro escuche y practica repetidamente.</p>
            <p>Podes usar clips que ya subiste o <strong>grabar nuevos</strong> directamente aca.</p>
          </div>
        </div>

        {/* Name */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-medium text-slate-300">Nombre</label>
            <InfoTip text="Dale un nombre descriptivo a la sesion, por ejemplo: 'Sesion matutina' o 'Aprender hola'" />
          </div>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Ej: Sesion matutina"
            className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Objective */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-medium text-slate-300">Objetivo</label>
            <InfoTip text="Describe que queres lograr con esta sesion. Te ayuda a recordar el proposito." />
          </div>
          <input
            type="text"
            value={formObjective}
            onChange={(e) => setFormObjective(e.target.value)}
            placeholder="Ej: Aprender a decir 'hola buen dia'"
            className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-300">Pasos</label>
              <InfoTip text="Cada paso reproduce un clip de audio. Tu loro lo escuchara la cantidad de veces que indiques, con una pausa entre cada repeticion." />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRecordingStepIndex('new')}
                disabled={recordingStepIndex !== null}
                className="text-red-400 text-sm font-medium disabled:opacity-40 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
                Grabar
              </button>
              <button
                onClick={handleAddStep}
                disabled={clips.length === 0}
                className="text-brand-400 text-sm font-medium disabled:opacity-40"
              >
                + Agregar
              </button>
            </div>
          </div>

          {/* New step recorder (for adding a brand new step) */}
          {recordingStepIndex === 'new' && (
            <div className="mb-3">
              <StepRecorder
                onRecorded={(clip) => handleRecordedClip(clip, 'new')}
                onCancel={() => setRecordingStepIndex(null)}
              />
            </div>
          )}

          <div className="flex flex-col gap-3">
            {formSteps.map((step, i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-400">Paso {i + 1}</span>
                  <button
                    onClick={() => handleRemoveStep(i)}
                    className="text-red-400 text-xs hover:text-red-300"
                  >
                    Quitar
                  </button>
                </div>

                {/* Clip selector or recorder */}
                {recordingStepIndex === i ? (
                  <StepRecorder
                    onRecorded={(clip) => handleRecordedClip(clip, i)}
                    onCancel={() => setRecordingStepIndex(null)}
                  />
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={step.clip_id}
                      onChange={(e) => handleUpdateStep(i, 'clip_id', e.target.value)}
                      className="flex-1 bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                    >
                      {clips.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <Tooltip text="Grabar un clip nuevo para este paso" position="left">
                      <button
                        onClick={() => setRecordingStepIndex(i)}
                        className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center hover:bg-red-600/30 transition-colors"
                        aria-label="Grabar clip"
                      >
                        <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                      </button>
                    </Tooltip>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs text-slate-400">Repeticiones</label>
                      <InfoTip text="Cuantas veces se reproduce el clip seguidas. Mas repeticiones ayudan a que el loro memorice mejor." />
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={step.repetitions}
                      onChange={(e) => handleUpdateStep(i, 'repetitions', e.target.value)}
                      className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded-lg text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs text-slate-400">Espera (s)</label>
                      <InfoTip text="Segundos de silencio entre cada repeticion. Dale tiempo al loro para procesar e intentar imitar." />
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={step.wait_seconds}
                      onChange={(e) => handleUpdateStep(i, 'wait_seconds', e.target.value)}
                      className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded-lg text-sm focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
            {formSteps.length === 0 && recordingStepIndex !== 'new' && (
              <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-8 text-center">
                <svg className="w-10 h-10 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-sm text-slate-500">Agrega al menos un paso</p>
                <p className="text-xs text-slate-600 mt-1">Usa "+ Agregar" para elegir un clip existente o "Grabar" para crear uno nuevo</p>
              </div>
            )}
          </div>
        </div>

        {/* Reward clip */}
        {rewardClips.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-sm font-medium text-slate-300">
                Clip de recompensa
              </label>
              <InfoTip text="Se reproduce al final de la sesion como premio. Subi clips de tipo 'recompensa' en la Biblioteca para verlos aca." />
            </div>
            <select
              value={formRewardId}
              onChange={(e) => setFormRewardId(e.target.value)}
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Sin recompensa (opcional)</option>
              {rewardClips.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!formName.trim() || formSteps.length === 0 || saving}
          className="w-full py-3 bg-brand-500 rounded-xl text-white font-semibold text-sm disabled:opacity-50 active:bg-brand-600 active:scale-[0.98] min-h-[48px]"
        >
          {saving ? 'Guardando...' : 'Crear sesion'}
        </button>
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 p-4 pb-8 max-w-lg md:max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-100">Entrenamiento</h1>
          <InfoTip text="Crea sesiones de entrenamiento con los clips de audio que queres que tu loro aprenda. Cada sesion tiene pasos que se reproducen en orden." />
        </div>
        <button
          onClick={() => setView('create')}
          className="h-10 px-4 bg-brand-500 rounded-lg text-white font-medium text-sm active:bg-brand-600 active:scale-[0.98]"
        >
          + Nueva
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-8 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <p className="text-sm text-slate-400 font-medium">Sin sesiones de entrenamiento</p>
          <p className="text-xs text-slate-500 mt-1.5 max-w-[260px] mx-auto leading-relaxed">
            Una sesion es una rutina de clips que tu loro escuchara para aprender palabras, frases o sonidos.
          </p>
          <button
            onClick={() => setView('create')}
            className="mt-4 px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 active:scale-[0.98] transition-colors"
          >
            Crear primera sesion
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => {
            const stepCount = getSessionSteps(session).length
            return (
              <button
                key={session.id}
                onClick={() => void handleSelectSession(session)}
                className="bg-slate-800 rounded-xl p-4 text-left flex items-center gap-3 active:bg-slate-700 w-full"
              >
                <div className="w-12 h-12 rounded-full bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-100">{session.name}</p>
                  {session.objective && (
                    <p className="text-slate-400 text-sm truncate">{session.objective}</p>
                  )}
                  <p className="text-slate-500 text-xs mt-1">
                    {stepCount} {stepCount === 1 ? 'paso' : 'pasos'}
                  </p>
                </div>
                <svg className="w-5 h-5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default TrainingPage
