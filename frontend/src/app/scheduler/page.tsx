import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/core/api-client'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'
import type { Clip, Schedule, ScheduleAction, ScheduleActionType, ScheduleCreate, ScheduleType, Session } from '@/types'

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

type View = 'list' | 'create'

const SchedulerPage = () => {
  const { showToast } = useToast()
  const [view, setView] = useState<View>('list')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<ScheduleType>('fixed')
  const [formTime, setFormTime] = useState('09:00')
  const [formDays, setFormDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [formWindowStart, setFormWindowStart] = useState('08:00')
  const [formWindowEnd, setFormWindowEnd] = useState('18:00')
  const [formInterval, setFormInterval] = useState(60)
  const [formActions, setFormActions] = useState<ScheduleAction[]>([])
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [schedData, clipData, sessionData] = await Promise.all([
        apiClient.get<Schedule[]>('/api/v1/scheduler'),
        apiClient.get<Clip[]>('/api/v1/clips'),
        apiClient.get<Session[]>('/api/v1/training/sessions'),
      ])
      setSchedules(Array.isArray(schedData) ? schedData : [])
      setClips(Array.isArray(clipData) ? clipData : [])
      setSessions(Array.isArray(sessionData) ? sessionData : [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleToggle = useCallback(async (schedule: Schedule) => {
    try {
      await apiClient.put<Schedule>(`/api/v1/scheduler/${schedule.id}`, {
        enabled: !schedule.enabled,
      })
      setSchedules((prev) =>
        prev.map((s) => s.id === schedule.id ? { ...s, enabled: !s.enabled } : s),
      )
      showToast(schedule.enabled ? 'Horario desactivado' : 'Horario activado', 'info')
    } catch {
      showToast('Error al actualizar el horario', 'error')
    }
  }, [showToast])

  const handleAddAction = useCallback(() => {
    const firstClip = clips[0]
    setFormActions((prev) => [
      ...prev,
      { type: 'play_clip' as ScheduleActionType, clip_id: firstClip?.id, clip_name: firstClip?.name },
    ])
  }, [clips])

  const handleRemoveAction = useCallback((i: number) => {
    setFormActions((prev) => prev.filter((_, idx) => idx !== i))
  }, [])

  const handleUpdateAction = useCallback(
    (i: number, field: keyof ScheduleAction, value: string | number) => {
      setFormActions((prev) =>
        prev.map((a, idx) => {
          if (idx !== i) return a
          if (field === 'type') return { type: value as ScheduleActionType }
          return { ...a, [field]: value }
        }),
      )
    },
    [],
  )

  const handleToggleDay = useCallback((day: number) => {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
  }, [])

  const handleSave = useCallback(async () => {
    if (!formName.trim() || formActions.length === 0) return
    setSaving(true)
    try {
      const payload: ScheduleCreate = {
        name: formName.trim(),
        schedule_type: formType,
        enabled: true,
        actions: formActions,
        ...(formType === 'fixed' && { time: formTime, days: formDays }),
        ...(formType === 'random_window' && {
          window_start: formWindowStart,
          window_end: formWindowEnd,
          days: formDays,
        }),
        ...(formType === 'interval' && { interval_minutes: formInterval }),
      }
      await apiClient.post('/api/v1/scheduler', payload)
      await loadData()
      setView('list')
      setFormName('')
      setFormActions([])
      showToast('Horario creado correctamente', 'success')
    } catch {
      showToast('Error al crear el horario', 'error')
    } finally {
      setSaving(false)
    }
  }, [formName, formType, formTime, formDays, formWindowStart, formWindowEnd, formInterval, formActions, loadData, showToast])

  if (view === 'create') {
    return (
      <div className="flex flex-col gap-4 p-4 pb-8 max-w-lg mx-auto">
        <div className="flex items-center gap-3 pt-2">
          <Tooltip text="Volver a la lista de horarios" position="right">
            <button
              onClick={() => setView('list')}
              className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
              aria-label="Cancelar"
            >
              <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </Tooltip>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Nuevo horario</h1>
            <p className="text-slate-400 text-xs mt-0.5">Programa clips o sesiones automaticamente</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1">Nombre</label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Clips matutinos"
            className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1">Tipo de horario</label>
          <div className="flex gap-2">
            {([
              { val: 'fixed', label: 'Hora fija', tip: 'Suena exactamente a la hora que elijas' },
              { val: 'random_window', label: 'Ventana', tip: 'Suena en un momento aleatorio dentro del rango horario' },
              { val: 'interval', label: 'Intervalo', tip: 'Suena cada X minutos repetidamente' },
            ] as { val: ScheduleType; label: string; tip: string }[]).map((t) => (
              <Tooltip key={t.val} text={t.tip} position="top">
                <button
                  onClick={() => setFormType(t.val)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    formType === t.val ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>

        {formType === 'fixed' && (
          <>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1">Hora exacta</label>
              <input
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
                className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <DayPicker days={formDays} onToggle={handleToggleDay} />
          </>
        )}

        {formType === 'random_window' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1">Desde</label>
                <input
                  type="time"
                  value={formWindowStart}
                  onChange={(e) => setFormWindowStart(e.target.value)}
                  className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1">Hasta</label>
                <input
                  type="time"
                  value={formWindowEnd}
                  onChange={(e) => setFormWindowEnd(e.target.value)}
                  className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none"
                />
              </div>
            </div>
            <DayPicker days={formDays} onToggle={handleToggleDay} />
          </>
        )}

        {formType === 'interval' && (
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">
              Repetir cada (minutos)
            </label>
            <input
              type="number"
              min={1}
              value={formInterval}
              onChange={(e) => setFormInterval(Number(e.target.value))}
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        )}

        {/* Actions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-300">Acciones</label>
            <Tooltip text="Agregar una accion que se ejecutara segun el horario" position="left">
              <button onClick={handleAddAction} className="text-brand-400 text-sm font-medium hover:text-brand-300">
                + Agregar
              </button>
            </Tooltip>
          </div>
          <div className="flex flex-col gap-3">
            {formActions.map((action, i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Accion {i + 1}</span>
                  <Tooltip text="Eliminar esta accion del horario" position="left">
                    <button onClick={() => handleRemoveAction(i)} className="text-red-400 text-sm hover:text-red-300">
                      Quitar
                    </button>
                  </Tooltip>
                </div>
                <select
                  value={action.type}
                  onChange={(e) => handleUpdateAction(i, 'type', e.target.value)}
                  className="w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm"
                >
                  <option value="play_clip">Reproducir clip especifico</option>
                  <option value="play_random">Reproducir clip aleatorio</option>
                  <option value="start_session">Iniciar sesion de entrenamiento</option>
                  <option value="start_recording">Iniciar grabacion</option>
                </select>
                {action.type === 'play_clip' && (
                  <select
                    value={action.clip_id ?? ''}
                    onChange={(e) => handleUpdateAction(i, 'clip_id', Number(e.target.value))}
                    className="w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm"
                  >
                    {clips.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                {action.type === 'start_session' && (
                  <select
                    value={action.session_id ?? ''}
                    onChange={(e) => handleUpdateAction(i, 'session_id', Number(e.target.value))}
                    className="w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm"
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
            {formActions.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-3">
                Agrega al menos una accion al horario
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={!formName.trim() || formActions.length === 0 || saving}
          className="w-full py-3 bg-brand-500 rounded-xl text-white font-semibold text-sm disabled:opacity-50 hover:bg-brand-600 transition-colors min-h-[48px]"
        >
          {saving ? 'Guardando...' : 'Crear horario'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Horarios</h1>
          <p className="text-slate-400 text-xs mt-0.5">Automatiza clips y sesiones segun el horario</p>
        </div>
        <Tooltip text="Crear un nuevo horario automatico" position="left">
          <button
            onClick={() => setView('create')}
            className="h-10 px-4 bg-brand-500 rounded-lg text-white font-medium text-sm hover:bg-brand-600 transition-colors"
          >
            + Nuevo
          </button>
        </Tooltip>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <svg className="w-14 h-14 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="font-medium text-slate-400">Sin horarios programados</p>
          <p className="text-sm mt-1">Crea un horario para automatizar el entrenamiento</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-100">{schedule.name}</p>
                  <p className="text-slate-400 text-xs capitalize mt-0.5">
                    {schedule.schedule_type === 'fixed' && schedule.time
                      ? `Fijo a las ${schedule.time}`
                      : schedule.schedule_type === 'interval' && schedule.interval_minutes
                        ? `Cada ${schedule.interval_minutes} min`
                        : `Ventana ${schedule.window_start ?? ''} - ${schedule.window_end ?? ''}`}
                  </p>
                </div>
                <Tooltip
                  text="Activa o desactiva este horario sin eliminarlo"
                  position="left"
                >
                  <button
                    onClick={() => void handleToggle(schedule)}
                    className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                      schedule.enabled ? 'bg-brand-500' : 'bg-slate-600'
                    }`}
                    aria-label={schedule.enabled ? 'Desactivar horario' : 'Activar horario'}
                    role="switch"
                    aria-checked={schedule.enabled}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform mx-1 ${
                        schedule.enabled ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </Tooltip>
              </div>
              {schedule.days.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {DAY_LABELS.map((label, i) => (
                    <span
                      key={i}
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        schedule.days.includes(i)
                          ? 'bg-brand-500/20 text-brand-300'
                          : 'text-slate-600'
                      }`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {schedule.actions.map((action, i) => (
                  <span
                    key={i}
                    className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full"
                  >
                    {action.type === 'play_clip' && action.clip_name
                      ? action.clip_name
                      : action.type === 'play_random'
                        ? 'Clip aleatorio'
                        : action.type === 'start_session' && action.session_name
                          ? action.session_name
                          : 'Grabar'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface DayPickerProps {
  days: number[]
  onToggle: (day: number) => void
}

const DayPicker = ({ days, onToggle }: DayPickerProps) => (
  <div>
    <label className="text-sm font-medium text-slate-300 block mb-2">Dias de la semana</label>
    <div className="flex gap-2">
      {DAY_LABELS.map((label, i) => (
        <Tooltip key={i} text={`${days.includes(i) ? 'Quitar' : 'Activar'} el ${label}`} position="top">
          <button
            onClick={() => onToggle(i)}
            className={`flex-1 h-10 rounded-lg text-xs font-semibold transition-colors ${
              days.includes(i)
                ? 'bg-brand-500 text-white'
                : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        </Tooltip>
      ))}
    </div>
  </div>
)

export default SchedulerPage
