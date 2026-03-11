import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/core/api-client'
import { useToast } from '@/components/toast'
import type {
  Clip,
  Schedule,
  ScheduleActionCreate,
  ScheduleActionType,
  ScheduleCreate,
  ScheduleType,
  Session,
} from '@/types'

const DAY_LABELS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

const inputClass =
  'w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 border border-slate-700'

const selectInnerClass =
  'w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

type View = 'list' | 'create' | 'edit'

/** Pad time string to HH:MM:SS */
const toHMS = (t: string) => (t.length === 5 ? `${t}:00` : t)
/** Display HH:MM:SS as HH:MM */
const toHM = (t: string | null) => (t ? t.slice(0, 5) : '')

const ACTION_LABELS: Record<ScheduleActionType, string> = {
  play_clip: 'Reproducir clip',
  start_session: 'Iniciar sesion',
  record: 'Grabar audio',
  detect: 'Detectar sonidos',
}

const SchedulerPage = () => {
  const { showToast } = useToast()
  const [view, setView] = useState<View>('list')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<ScheduleType>('daily')
  const [formTimeStart, setFormTimeStart] = useState('09:00')
  const [formTimeEnd, setFormTimeEnd] = useState('18:00')
  const [formDays, setFormDays] = useState<number[]>([0, 1, 2, 3, 4]) // Mon-Fri
  const [formActions, setFormActions] = useState<ScheduleActionCreate[]>([])
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [schedData, clipData, sessionData] = await Promise.all([
        apiClient.get<Schedule[]>('/api/v1/scheduler'),
        apiClient.get<Clip[]>('/api/v1/clips/'),
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

  const handleDelete = useCallback(async (schedule: Schedule) => {
    if (!confirm(`Eliminar horario "${schedule.name}"?`)) return
    try {
      await apiClient.del(`/api/v1/scheduler/${schedule.id}`)
      setSchedules((prev) => prev.filter((s) => s.id !== schedule.id))
      showToast('Horario eliminado', 'success')
    } catch {
      showToast('Error al eliminar el horario', 'error')
    }
  }, [showToast])

  const handleToggle = useCallback(async (schedule: Schedule) => {
    try {
      await apiClient.put<Schedule>(`/api/v1/scheduler/${schedule.id}`, {
        is_active: !schedule.is_active,
      })
      setSchedules((prev) =>
        prev.map((s) => s.id === schedule.id ? { ...s, is_active: !s.is_active } : s),
      )
      showToast(schedule.is_active ? 'Horario desactivado' : 'Horario activado', 'info')
    } catch {
      showToast('Error al actualizar el horario', 'error')
    }
  }, [showToast])

  const handleAddAction = useCallback(() => {
    const firstClip = clips[0]
    setFormActions((prev) => [
      ...prev,
      { action_type: 'play_clip', clip_id: firstClip?.id ?? null, order_index: prev.length },
    ])
  }, [clips])

  const handleRemoveAction = useCallback((i: number) => {
    setFormActions((prev) => prev.filter((_, idx) => idx !== i))
  }, [])

  const handleUpdateAction = useCallback(
    (i: number, field: keyof ScheduleActionCreate, value: string | number | null) => {
      setFormActions((prev) =>
        prev.map((a, idx) => {
          if (idx !== i) return a
          if (field === 'action_type') {
            // Reset related fields when type changes
            const newType = value as ScheduleActionType
            return { action_type: newType, order_index: a.order_index }
          }
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

  const resetForm = useCallback(() => {
    setFormName('')
    setFormType('daily')
    setFormTimeStart('09:00')
    setFormTimeEnd('18:00')
    setFormDays([0, 1, 2, 3, 4])
    setFormActions([])
    setEditingSchedule(null)
  }, [])

  const populateForm = useCallback((schedule: Schedule) => {
    setFormName(schedule.name)
    setFormType(schedule.schedule_type)
    setFormTimeStart(toHM(schedule.time_start) || '09:00')
    setFormTimeEnd(toHM(schedule.time_end) || '18:00')
    setFormDays(schedule.days_of_week ?? [])
    setFormActions(
      schedule.actions.map((a, idx) => ({
        action_type: a.action_type,
        clip_id: a.clip_id ?? null,
        session_id: a.session_id ?? null,
        volume: a.volume,
        repetitions: a.repetitions,
        pause_between: a.pause_between,
        order_index: a.order_index ?? idx,
      })),
    )
  }, [])

  const handleOpenEdit = useCallback((schedule: Schedule) => {
    setEditingSchedule(schedule)
    populateForm(schedule)
    setView('edit')
  }, [populateForm])

  const buildPayload = useCallback((): ScheduleCreate => {
    const base = {
      name: formName.trim(),
      schedule_type: formType,
      actions: formActions,
    }

    if (formType === 'daily') {
      return { ...base, time_start: toHMS(formTimeStart), days_of_week: formDays }
    }
    if (formType === 'weekly') {
      return {
        ...base,
        time_start: toHMS(formTimeStart),
        time_end: toHMS(formTimeEnd),
        days_of_week: formDays,
      }
    }
    if (formType === 'interval') {
      return { ...base, time_start: toHMS(formTimeStart), time_end: toHMS(formTimeEnd) }
    }
    // once
    return { ...base, time_start: toHMS(formTimeStart) }
  }, [formName, formType, formTimeStart, formTimeEnd, formDays, formActions])

  const handleSave = useCallback(async () => {
    if (!formName.trim() || formActions.length === 0) return
    setSaving(true)
    try {
      const payload = buildPayload()
      const created = await apiClient.post<Schedule>('/api/v1/scheduler', payload)
      setSchedules((prev) => [...prev, created])
      setView('list')
      resetForm()
      showToast('Horario creado correctamente', 'success')
    } catch {
      showToast('Error al crear el horario', 'error')
    } finally {
      setSaving(false)
    }
  }, [formName, formActions.length, buildPayload, resetForm, showToast])

  const handleUpdate = useCallback(async () => {
    if (!editingSchedule || !formName.trim() || formActions.length === 0) return
    setSaving(true)
    try {
      const payload = buildPayload()
      const updated = await apiClient.put<Schedule>(
        `/api/v1/scheduler/${editingSchedule.id}`,
        payload,
      )
      setSchedules((prev) =>
        prev.map((s) => s.id === editingSchedule.id ? updated : s),
      )
      setView('list')
      resetForm()
      showToast('Horario actualizado correctamente', 'success')
    } catch {
      showToast('Error al guardar los cambios', 'error')
    } finally {
      setSaving(false)
    }
  }, [editingSchedule, formName, formActions.length, buildPayload, resetForm, showToast])

  // Helper to get clip/session name for display
  const getActionLabel = useCallback((action: Schedule['actions'][number]) => {
    if (action.action_type === 'play_clip') {
      const clip = clips.find((c) => c.id === action.clip_id)
      return clip?.name ?? 'Clip'
    }
    if (action.action_type === 'start_session') {
      const sess = sessions.find((s) => s.id === action.session_id)
      return sess?.name ?? 'Sesion'
    }
    return ACTION_LABELS[action.action_type as ScheduleActionType] ?? action.action_type
  }, [clips, sessions])

  // ── Create / Edit form view ────────────────────────────────────────────────
  if (view === 'create' || view === 'edit') {
    const isEditing = view === 'edit'
    const handleSubmit = isEditing ? handleUpdate : handleSave

    return (
      <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => { setView('list'); resetForm() }}
            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
            aria-label="Cancelar"
          >
            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              {isEditing ? 'Editar horario' : 'Nuevo horario'}
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">Programa clips o sesiones automaticamente</p>
          </div>
        </div>

        {/* Name + Type section */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Configuracion
          </h2>
          <div className="bg-slate-800 rounded-xl p-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1.5">Nombre</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Clips matutinos"
                className={inputClass}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1.5">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { val: 'daily', label: 'Diario' },
                  { val: 'weekly', label: 'Semanal' },
                  { val: 'interval', label: 'Intervalo' },
                  { val: 'once', label: 'Una vez' },
                ] as { val: ScheduleType; label: string }[]).map((t) => (
                  <button
                    key={t.val}
                    onClick={() => setFormType(t.val)}
                    className={`py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                      formType === t.val
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-slate-700 text-slate-400 border-slate-600 hover:text-slate-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Schedule details section */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Horario
          </h2>
          <div className="bg-slate-800 rounded-xl p-4 space-y-4">
            {(formType === 'daily' || formType === 'once') && (
              <>
                <div>
                  <label className="text-sm font-medium text-slate-300 block mb-1.5">Hora</label>
                  <input
                    type="time"
                    value={formTimeStart}
                    onChange={(e) => setFormTimeStart(e.target.value)}
                    className={inputClass}
                  />
                </div>
                {formType === 'daily' && (
                  <DayPicker days={formDays} onToggle={handleToggleDay} />
                )}
              </>
            )}

            {formType === 'weekly' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-300 block mb-1.5">Desde</label>
                    <input
                      type="time"
                      value={formTimeStart}
                      onChange={(e) => setFormTimeStart(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-300 block mb-1.5">Hasta</label>
                    <input
                      type="time"
                      value={formTimeEnd}
                      onChange={(e) => setFormTimeEnd(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <DayPicker days={formDays} onToggle={handleToggleDay} />
              </>
            )}

            {formType === 'interval' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-300 block mb-1.5">Desde</label>
                    <input
                      type="time"
                      value={formTimeStart}
                      onChange={(e) => setFormTimeStart(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-300 block mb-1.5">Hasta</label>
                    <input
                      type="time"
                      value={formTimeEnd}
                      onChange={(e) => setFormTimeEnd(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Se ejecutara repetidamente dentro de esta ventana horaria
                </p>
              </>
            )}
          </div>
        </section>

        {/* Actions section */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</h2>
            <button onClick={handleAddAction} className="text-brand-400 text-sm font-medium hover:text-brand-300">
              + Agregar
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {formActions.map((action, i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">Accion {i + 1}</span>
                  <button onClick={() => handleRemoveAction(i)} className="text-red-400 text-xs hover:text-red-300">
                    Quitar
                  </button>
                </div>
                <select
                  value={action.action_type}
                  onChange={(e) => handleUpdateAction(i, 'action_type', e.target.value)}
                  className={selectInnerClass}
                >
                  <option value="play_clip">Reproducir clip</option>
                  <option value="start_session">Iniciar sesion de entrenamiento</option>
                  <option value="record">Grabar audio</option>
                  <option value="detect">Detectar sonidos</option>
                </select>
                {action.action_type === 'play_clip' && (
                  <select
                    value={action.clip_id ?? ''}
                    onChange={(e) => handleUpdateAction(i, 'clip_id', e.target.value || null)}
                    className={selectInnerClass}
                  >
                    <option value="">Seleccionar clip...</option>
                    {clips.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                {action.action_type === 'start_session' && (
                  <select
                    value={action.session_id ?? ''}
                    onChange={(e) => handleUpdateAction(i, 'session_id', e.target.value || null)}
                    className={selectInnerClass}
                  >
                    <option value="">Seleccionar sesion...</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
            {formActions.length === 0 && (
              <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-6 text-center">
                <p className="text-sm text-slate-500">Agrega al menos una accion</p>
              </div>
            )}
          </div>
        </section>

        {/* Save button */}
        <button
          onClick={() => void handleSubmit()}
          disabled={!formName.trim() || formActions.length === 0 || saving}
          className="w-full py-3 bg-brand-500 rounded-xl text-white font-semibold text-sm disabled:opacity-50 hover:bg-brand-600 active:scale-[0.98] transition-colors min-h-[48px]"
        >
          {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear horario'}
        </button>
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 p-4 pb-8 max-w-lg md:max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Horarios</h1>
          <p className="text-slate-400 text-sm mt-0.5">Automatiza clips y sesiones</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="h-10 px-4 bg-brand-500 rounded-xl text-white font-medium text-sm hover:bg-brand-600 active:scale-[0.98] transition-colors"
        >
          + Nuevo
        </button>
      </div>

      {/* Schedule list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-8 text-center">
          <svg className="w-10 h-10 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-slate-500">Sin horarios programados</p>
          <p className="text-xs text-slate-600 mt-1">Crea un horario para automatizar el entrenamiento</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="bg-slate-800 rounded-xl p-4 cursor-pointer hover:bg-slate-750 transition-colors"
              onClick={() => handleOpenEdit(schedule)}
              role="button"
              tabIndex={0}
              aria-label={`Editar horario ${schedule.name}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleOpenEdit(schedule)
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-100 text-sm">{schedule.name}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {schedule.schedule_type === 'daily' && schedule.time_start
                      ? `Diario a las ${toHM(schedule.time_start)}`
                      : schedule.schedule_type === 'weekly'
                        ? `Semanal ${toHM(schedule.time_start)} - ${toHM(schedule.time_end)}`
                        : schedule.schedule_type === 'interval'
                          ? `Intervalo ${toHM(schedule.time_start)} - ${toHM(schedule.time_end)}`
                          : schedule.schedule_type === 'once' && schedule.time_start
                            ? `Una vez a las ${toHM(schedule.time_start)}`
                            : schedule.schedule_type}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleToggle(schedule) }}
                    className={`w-12 h-7 rounded-full transition-colors ${
                      schedule.is_active ? 'bg-brand-500' : 'bg-slate-600'
                    }`}
                    aria-label={schedule.is_active ? 'Desactivar horario' : 'Activar horario'}
                    role="switch"
                    aria-checked={schedule.is_active}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform mx-1 ${
                        schedule.is_active ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleDelete(schedule) }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-600/20 transition-colors"
                    aria-label="Eliminar horario"
                  >
                    <svg className="w-4 h-4 text-slate-500 hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Day pills + action tags */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {schedule.days_of_week && schedule.days_of_week.length > 0 && (
                  <>
                    <div className="flex gap-1">
                      {DAY_LABELS.map((label, i) => (
                        <span
                          key={i}
                          className={`text-[10px] w-7 h-7 rounded-lg flex items-center justify-center font-medium ${
                            schedule.days_of_week?.includes(i)
                              ? 'bg-brand-500/20 text-brand-300'
                              : 'bg-slate-700/50 text-slate-600'
                          }`}
                        >
                          {label.charAt(0)}
                        </span>
                      ))}
                    </div>
                    <div className="h-4 w-px bg-slate-700" />
                  </>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {schedule.actions.map((action, i) => (
                    <span
                      key={i}
                      className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full"
                    >
                      {getActionLabel(action)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── DayPicker component ──────────────────────────────────────────────────────

interface DayPickerProps {
  days: number[]
  onToggle: (day: number) => void
}

const DayPicker = ({ days, onToggle }: DayPickerProps) => (
  <div>
    <label className="text-sm font-medium text-slate-300 block mb-1.5">Dias</label>
    <div className="grid grid-cols-7 gap-1.5">
      {DAY_LABELS.map((label, i) => (
        <button
          key={i}
          onClick={() => onToggle(i)}
          className={`h-10 rounded-xl text-xs font-semibold transition-colors border ${
            days.includes(i)
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-slate-700 text-slate-500 border-slate-600 hover:text-slate-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  </div>
)

export default SchedulerPage
