import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/core/api-client'
import { SessionRunner } from '@/components/session-runner'
import type { Clip, ClipType, Session, SessionCreate, SessionLog, SessionStep } from '@/types'

type View = 'list' | 'create' | 'detail' | 'running'

const TrainingPage = () => {
  const [view, setView] = useState<View>('list')
  const [sessions, setSessions] = useState<Session[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [logs, setLogs] = useState<SessionLog[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)

  // Create form state
  const [formName, setFormName] = useState('')
  const [formObjective, setFormObjective] = useState('')
  const [formSteps, setFormSteps] = useState<SessionStep[]>([])
  const [formRewardId, setFormRewardId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [sessionData, clipData] = await Promise.all([
        apiClient.get<Session[]>('/api/sessions'),
        apiClient.get<Clip[]>('/api/clips'),
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
      const logData = await apiClient.get<SessionLog[]>(`/api/sessions/${session.id}/logs`)
      setLogs(Array.isArray(logData) ? logData : [])
    } catch {
      setLogs([])
    }
    setView('detail')
  }, [])

  const handleStartSession = useCallback(() => {
    setCurrentStep(0)
    setView('running')
  }, [])

  const handleNextStep = useCallback(() => {
    if (!selectedSession) return
    if (currentStep < selectedSession.steps.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      setView('detail')
    }
  }, [selectedSession, currentStep])

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
  }, [])

  const handleUpdateStep = useCallback(
    (index: number, field: keyof SessionStep, value: number | string) => {
      setFormSteps((prev) =>
        prev.map((step, i) => {
          if (i !== index) return step
          if (field === 'clip_id') {
            const clip = clips.find((c) => c.id === Number(value))
            return { ...step, clip_id: Number(value), clip_name: clip?.name }
          }
          return { ...step, [field]: typeof step[field] === 'number' ? Number(value) : value }
        }),
      )
    },
    [clips],
  )

  const handleSave = useCallback(async () => {
    if (!formName.trim() || formSteps.length === 0) return
    setSaving(true)
    try {
      const payload: SessionCreate = {
        name: formName.trim(),
        objective: formObjective.trim(),
        steps: formSteps,
        ...(formRewardId !== '' && { reward_clip_id: formRewardId }),
      }
      await apiClient.post('/api/sessions', payload)
      await loadData()
      setView('list')
      setFormName('')
      setFormObjective('')
      setFormSteps([])
      setFormRewardId('')
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }, [formName, formObjective, formSteps, formRewardId, loadData])

  const rewardClips = clips.filter((c): c is Clip & { type: ClipType } => c.type === 'reward')

  if (view === 'running' && selectedSession) {
    return (
      <div className="p-4 pb-6">
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

  if (view === 'detail' && selectedSession) {
    return (
      <div className="flex flex-col gap-4 p-4 pb-8">
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
          <div>
            <h1 className="text-xl font-bold text-slate-100">{selectedSession.name}</h1>
            {selectedSession.objective && (
              <p className="text-slate-400 text-sm">{selectedSession.objective}</p>
            )}
          </div>
        </div>

        <button
          onClick={handleStartSession}
          className="w-full py-4 bg-brand-500 rounded-xl text-white font-bold text-lg active:bg-brand-600"
        >
          Iniciar sesion
        </button>

        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Pasos ({selectedSession.steps.length})
          </h2>
          <div className="flex flex-col gap-2">
            {selectedSession.steps.map((step, i) => (
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
        </div>

        {logs.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Historial
            </h2>
            <div className="flex flex-col gap-2">
              {logs.map((log) => (
                <div key={log.id} className="bg-slate-800 rounded-xl p-4">
                  <p className="text-slate-100 text-sm">
                    {new Date(log.started_at).toLocaleDateString('es')}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    {log.steps_completed} pasos completados
                    {log.notes && ` · ${log.notes}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (view === 'create') {
    return (
      <div className="flex flex-col gap-4 p-4 pb-8">
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => setView('list')}
            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center active:bg-slate-700"
            aria-label="Cancelar"
          >
            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-slate-100">Nueva sesion</h1>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1">Nombre</label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Sesion matutina"
            className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1">Objetivo</label>
          <input
            type="text"
            value={formObjective}
            onChange={(e) => setFormObjective(e.target.value)}
            placeholder="Aprender a decir 'hola'"
            className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-300">Pasos</label>
            <button
              onClick={handleAddStep}
              disabled={clips.length === 0}
              className="text-brand-400 text-sm font-medium disabled:opacity-40"
            >
              + Agregar
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {formSteps.map((step, i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-400">Paso {i + 1}</span>
                  <button
                    onClick={() => handleRemoveStep(i)}
                    className="text-red-400 text-sm"
                  >
                    Quitar
                  </button>
                </div>
                <select
                  value={step.clip_id}
                  onChange={(e) => handleUpdateStep(i, 'clip_id', e.target.value)}
                  className="w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                >
                  {clips.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Repeticiones</label>
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
                    <label className="text-xs text-slate-400 block mb-1">Espera (s)</label>
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
            {formSteps.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-4">
                Agrega al menos un paso
              </p>
            )}
          </div>
        </div>

        {rewardClips.length > 0 && (
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">
              Clip de recompensa (opcional)
            </label>
            <select
              value={formRewardId}
              onChange={(e) => setFormRewardId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Sin recompensa</option>
              {rewardClips.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!formName.trim() || formSteps.length === 0 || saving}
          className="w-full py-4 bg-brand-500 rounded-xl text-white font-bold text-lg disabled:opacity-50 active:bg-brand-600"
        >
          {saving ? 'Guardando...' : 'Crear sesion'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-slate-100">Entrenamiento</h1>
        <button
          onClick={() => setView('create')}
          className="h-10 px-4 bg-brand-500 rounded-lg text-white font-medium text-sm active:bg-brand-600"
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
        <div className="text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">📚</p>
          <p>Sin sesiones de entrenamiento</p>
          <p className="text-sm mt-1">Crea tu primera sesion</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => handleSelectSession(session)}
              className="bg-slate-800 rounded-xl p-4 text-left flex items-center gap-3 active:bg-slate-700 w-full"
            >
              <div className="w-12 h-12 rounded-full bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">📚</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-100">{session.name}</p>
                {session.objective && (
                  <p className="text-slate-400 text-sm truncate">{session.objective}</p>
                )}
                <p className="text-slate-500 text-xs mt-1">{session.steps.length} pasos</p>
              </div>
              <svg className="w-5 h-5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default TrainingPage
