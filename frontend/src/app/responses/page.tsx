import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/core/api-client'
import { useToast } from '@/components/toast'
import type { ActionType, Clip, ResponseRule, ResponseRuleCreate, TriggerType } from '@/types'

// ── Types & Constants ─────────────────────────────────────────────────────────

type View = 'list' | 'create' | 'edit'

const TRIGGER_OPTIONS: { value: TriggerType; label: string; desc: string }[] = [
  { value: 'sound_detected', label: 'Sonido detectado', desc: 'Cuando el mic detecta un sonido fuerte' },
  { value: 'keyword', label: 'Palabra clave', desc: 'Cuando el loro dice una palabra' },
  { value: 'volume_threshold', label: 'Umbral de volumen', desc: 'Cuando el volumen supera un nivel' },
  { value: 'time_of_day', label: 'Hora del dia', desc: 'A una hora especifica' },
]

const ACTION_OPTIONS: { value: ActionType; label: string }[] = [
  { value: 'play_clip', label: 'Reproducir clip' },
  { value: 'start_session', label: 'Iniciar sesion' },
  { value: 'record', label: 'Grabar audio' },
  { value: 'log', label: 'Registrar evento' },
]

const TRIGGER_LABELS: Record<TriggerType, string> = {
  sound_detected: 'Sonido detectado',
  keyword: 'Palabra clave',
  volume_threshold: 'Umbral volumen',
  time_of_day: 'Hora del dia',
}

const ACTION_LABELS: Record<ActionType, string> = {
  play_clip: 'Reproducir clip',
  start_session: 'Iniciar sesion',
  record: 'Grabar audio',
  log: 'Registrar evento',
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputClass =
  'w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 border border-slate-700'

// ── Component ─────────────────────────────────────────────────────────────────

const ResponsesPage = () => {
  const { showToast } = useToast()
  const [view, setView] = useState<View>('list')
  const [rules, setRules] = useState<ResponseRule[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRule, setSelectedRule] = useState<ResponseRule | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formTrigger, setFormTrigger] = useState<TriggerType>('sound_detected')
  const [formAction, setFormAction] = useState<ActionType>('play_clip')
  const [formClipId, setFormClipId] = useState('')
  const [formThreshold, setFormThreshold] = useState(0.3)
  const [formMinDuration, setFormMinDuration] = useState(300)
  const [formCooldown, setFormCooldown] = useState(10)
  const [formKeyword, setFormKeyword] = useState('')
  const [formTime, setFormTime] = useState('09:00')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [rulesData, clipData] = await Promise.all([
        apiClient.get<ResponseRule[]>('/api/v1/responses'),
        apiClient.get<Clip[]>('/api/v1/clips'),
      ])
      setRules(Array.isArray(rulesData) ? rulesData : [])
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

  const handleToggle = useCallback(async (rule: ResponseRule) => {
    try {
      await apiClient.put<ResponseRule>(`/api/v1/responses/${rule.id}`, { is_active: !rule.is_active })
      setRules((prev) =>
        prev.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r),
      )
      showToast(rule.is_active ? 'Regla desactivada' : 'Regla activada', 'info')
    } catch {
      showToast('Error al actualizar la regla', 'error')
    }
  }, [showToast])

  const handleDelete = useCallback(async (ruleId: string) => {
    try {
      await apiClient.del(`/api/v1/responses/${ruleId}`)
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
      showToast('Regla eliminada', 'info')
    } catch {
      showToast('Error al eliminar la regla', 'error')
    }
  }, [showToast])

  const resetForm = useCallback(() => {
    setFormName('')
    setFormTrigger('sound_detected')
    setFormAction('play_clip')
    setFormClipId('')
    setFormThreshold(0.3)
    setFormMinDuration(300)
    setFormCooldown(10)
    setFormKeyword('')
    setFormTime('09:00')
  }, [])

  const populateFormFromRule = useCallback((rule: ResponseRule) => {
    setFormName(rule.name)
    setFormTrigger(rule.trigger_type)
    setFormAction(rule.action_type)
    setFormCooldown(rule.cooldown_secs)
    setFormClipId(typeof rule.action_config.clip_id === 'string' ? rule.action_config.clip_id : '')
    setFormThreshold(typeof rule.trigger_config.threshold === 'number' ? rule.trigger_config.threshold : 0.3)
    setFormMinDuration(typeof rule.trigger_config.min_duration === 'number' ? rule.trigger_config.min_duration : 300)
    setFormKeyword(typeof rule.trigger_config.keyword === 'string' ? rule.trigger_config.keyword : '')
    setFormTime(typeof rule.trigger_config.time === 'string' ? rule.trigger_config.time : '09:00')
  }, [])

  const handleOpenEdit = useCallback((rule: ResponseRule) => {
    setSelectedRule(rule)
    populateFormFromRule(rule)
    setView('edit')
  }, [populateFormFromRule])

  const handleSave = useCallback(async () => {
    if (!formName.trim()) return
    setSaving(true)
    try {
      const triggerConfig = (() => {
        if (formTrigger === 'sound_detected')
          return { threshold: formThreshold, min_duration: formMinDuration }
        if (formTrigger === 'keyword') return { keyword: formKeyword }
        if (formTrigger === 'time_of_day') return { time: formTime }
        return {}
      })()

      const actionConfig = (() => {
        if (formAction === 'play_clip' && formClipId !== '')
          return { clip_id: formClipId }
        return {}
      })()

      const payload: ResponseRuleCreate = {
        name: formName.trim(),
        trigger_type: formTrigger,
        trigger_config: triggerConfig,
        action_type: formAction,
        action_config: actionConfig,
        cooldown_secs: formCooldown,
      }
      await apiClient.post('/api/v1/responses', payload)
      await loadData()
      setView('list')
      resetForm()
      showToast('Regla creada correctamente', 'success')
    } catch {
      showToast('Error al crear la regla', 'error')
    } finally {
      setSaving(false)
    }
  }, [
    formName, formTrigger, formAction, formClipId, formThreshold,
    formMinDuration, formCooldown, formKeyword, formTime, loadData, resetForm, showToast,
  ])

  const handleUpdateRule = useCallback(async () => {
    if (!formName.trim() || selectedRule === null) return
    setSaving(true)
    try {
      const triggerConfig = (() => {
        if (formTrigger === 'sound_detected')
          return { threshold: formThreshold, min_duration: formMinDuration }
        if (formTrigger === 'keyword') return { keyword: formKeyword }
        if (formTrigger === 'time_of_day') return { time: formTime }
        return {}
      })()

      const actionConfig = (() => {
        if (formAction === 'play_clip' && formClipId !== '')
          return { clip_id: formClipId }
        return {}
      })()

      const payload = {
        name: formName.trim(),
        trigger_type: formTrigger,
        trigger_config: triggerConfig,
        action_type: formAction,
        action_config: actionConfig,
        cooldown_secs: formCooldown,
      }

      const updated = await apiClient.put<ResponseRule>(`/api/v1/responses/${selectedRule.id}`, payload)
      setRules((prev) => prev.map((r) => r.id === selectedRule.id ? updated : r))
      setView('list')
      resetForm()
      setSelectedRule(null)
      showToast('Regla actualizada correctamente', 'success')
    } catch {
      showToast('Error al actualizar la regla', 'error')
    } finally {
      setSaving(false)
    }
  }, [
    formName, formTrigger, formAction, formClipId, formThreshold,
    formMinDuration, formCooldown, formKeyword, formTime, selectedRule, resetForm, showToast,
  ])

  // ── Shared form body (used in create and edit views) ──────────────────────

  const renderFormBody = () => (
    <>
      {/* Name */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Nombre
        </h2>
        <div className="bg-slate-800 rounded-xl p-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="rule-name">
              Nombre de la regla *
            </label>
            <input
              id="rule-name"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Respuesta a vocalizacion"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* Trigger */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Disparador
        </h2>
        <div className="bg-slate-800 rounded-xl p-4 space-y-4">
          <p className="text-slate-400 text-xs">Que lo activa</p>
          <div className="grid grid-cols-2 gap-2">
            {TRIGGER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormTrigger(opt.value)}
                className={`py-3 px-3 rounded-xl text-left transition-colors border ${
                  formTrigger === opt.value
                    ? 'bg-brand-600/20 border-brand-500 text-white'
                    : 'bg-slate-700/50 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="block text-xs font-medium">{opt.label}</span>
                <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</span>
              </button>
            ))}
          </div>

          {/* Trigger-specific config */}
          {formTrigger === 'sound_detected' && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Umbral de volumen: {Math.round(formThreshold * 100)}%
                </label>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={Math.round(formThreshold * 100)}
                  onChange={(e) => setFormThreshold(Number(e.target.value) / 100)}
                  className="w-full accent-brand-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 px-0.5">
                  <span>Bajo</span>
                  <span>Alto</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Duracion minima: {formMinDuration}ms
                </label>
                <input
                  type="range"
                  min={100}
                  max={2000}
                  step={100}
                  value={formMinDuration}
                  onChange={(e) => setFormMinDuration(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 px-0.5">
                  <span>100ms</span>
                  <span>2000ms</span>
                </div>
              </div>
            </div>
          )}

          {formTrigger === 'keyword' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="rule-keyword">
                Palabra clave a detectar
              </label>
              <input
                id="rule-keyword"
                type="text"
                value={formKeyword}
                onChange={(e) => setFormKeyword(e.target.value)}
                placeholder="hola"
                className={inputClass}
              />
            </div>
          )}

          {formTrigger === 'time_of_day' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="rule-time">
                Hora de activacion
              </label>
              <input
                id="rule-time"
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>
      </section>

      {/* Action */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Accion
        </h2>
        <div className="bg-slate-800 rounded-xl p-4 space-y-4">
          <p className="text-slate-400 text-xs">Que hace cuando se activa</p>
          <div className="grid grid-cols-2 gap-2">
            {ACTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormAction(opt.value)}
                className={`py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                  formAction === opt.value
                    ? 'bg-purple-600/20 border-purple-500 text-white'
                    : 'bg-slate-700/50 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {formAction === 'play_clip' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="rule-clip">
                Clip a reproducir
              </label>
              <select
                id="rule-clip"
                value={formClipId}
                onChange={(e) => setFormClipId(e.target.value)}
                className={inputClass}
              >
                <option value="">Seleccionar clip...</option>
                {clips.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* Cooldown */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Configuracion
        </h2>
        <div className="bg-slate-800 rounded-xl p-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Tiempo de espera entre activaciones: {formCooldown}s
            </label>
            <input
              type="range"
              min={1}
              max={300}
              value={formCooldown}
              onChange={(e) => setFormCooldown(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 px-0.5">
              <span>1s</span>
              <span>5min</span>
            </div>
          </div>
        </div>
      </section>
    </>
  )

  // ── Create view ─────────────────────────────────────────────────────────────

  if (view === 'create') {
    return (
      <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => { setView('list'); resetForm() }}
            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
            aria-label="Volver"
          >
            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Nueva regla</h1>
            <p className="text-slate-400 text-xs mt-0.5">Define cuando y como responde la app</p>
          </div>
        </div>

        {renderFormBody()}

        {/* Save button */}
        <button
          onClick={() => void handleSave()}
          disabled={!formName.trim() || saving}
          className="w-full py-3 bg-brand-500 rounded-xl text-white font-semibold text-sm disabled:opacity-50 hover:bg-brand-600 active:scale-[0.98] transition-colors min-h-[48px]"
        >
          {saving ? 'Guardando...' : 'Crear regla'}
        </button>
      </div>
    )
  }

  // ── Edit view ────────────────────────────────────────────────────────────────

  if (view === 'edit') {
    return (
      <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => { setView('list'); resetForm(); setSelectedRule(null) }}
            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
            aria-label="Volver"
          >
            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Editar regla</h1>
            <p className="text-slate-400 text-xs mt-0.5">Modifica cuando y como responde la app</p>
          </div>
        </div>

        {renderFormBody()}

        {/* Save button */}
        <button
          onClick={() => void handleUpdateRule()}
          disabled={!formName.trim() || saving}
          className="w-full py-3 bg-brand-500 rounded-xl text-white font-semibold text-sm disabled:opacity-50 hover:bg-brand-600 active:scale-[0.98] transition-colors min-h-[48px]"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    )
  }

  // ── List view ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Respuestas automaticas</h1>
          <p className="text-slate-400 text-xs mt-0.5">Reglas que responden a sonidos o eventos</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="h-10 px-4 bg-brand-500 rounded-xl text-white font-medium text-sm hover:bg-brand-600 active:scale-[0.98] transition-colors"
        >
          + Nueva
        </button>
      </div>

      {/* Rules list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-8 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm text-slate-500 font-medium">Sin reglas de respuesta</p>
          <p className="text-xs text-slate-600 mt-1">Crea reglas para que la app responda automaticamente</p>
          <button
            onClick={() => setView('create')}
            className="mt-4 px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 active:scale-[0.98] transition-colors"
          >
            Crear primera regla
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`bg-slate-800 rounded-xl p-4 border transition-colors ${
                rule.is_active ? 'border-slate-700/50' : 'border-slate-700/30 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEdit(rule)}
                      className="font-medium text-slate-100 text-sm truncate hover:text-brand-400 transition-colors text-left"
                    >
                      {rule.name}
                    </button>
                    {!rule.is_active && (
                      <span className="text-[10px] text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded-md shrink-0">
                        OFF
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-lg font-medium">
                      {TRIGGER_LABELS[rule.trigger_type]}
                    </span>
                    <svg className="w-3 h-3 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-[11px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-lg font-medium">
                      {ACTION_LABELS[rule.action_type]}
                    </span>
                  </div>

                  <p className="text-slate-500 text-xs mt-2 tabular-nums">
                    Activado {rule.times_triggered} {rule.times_triggered === 1 ? 'vez' : 'veces'}
                    {rule.cooldown_secs > 0 && ` · espera ${rule.cooldown_secs}s`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Edit button */}
                  <button
                    onClick={() => handleOpenEdit(rule)}
                    className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center hover:bg-slate-600/70 hover:text-slate-200 text-slate-500 transition-colors"
                    aria-label="Editar regla"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => void handleDelete(rule.id)}
                    className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center hover:bg-red-900/50 hover:text-red-400 text-slate-500 transition-colors"
                    aria-label="Eliminar regla"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  {/* Toggle switch */}
                  <button
                    onClick={() => void handleToggle(rule)}
                    className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                      rule.is_active ? 'bg-brand-500' : 'bg-slate-600'
                    }`}
                    aria-label={rule.is_active ? 'Desactivar regla' : 'Activar regla'}
                    role="switch"
                    aria-checked={rule.is_active}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform mx-1 ${
                        rule.is_active ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ResponsesPage
