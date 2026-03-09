import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/core/api-client'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'
import type { ActionType, Clip, ResponseRule, ResponseRuleCreate, TriggerType } from '@/types'

type View = 'list' | 'create'

const TRIGGER_LABELS: Record<TriggerType, string> = {
  sound_detected: 'Sonido detectado',
  keyword: 'Palabra clave',
  time_of_day: 'Hora del dia',
  manual: 'Manual',
}

const TRIGGER_TOOLTIPS: Record<TriggerType, string> = {
  sound_detected: 'Se activa cuando el microfono detecta un sonido fuerte',
  keyword: 'Se activa cuando el loro dice una palabra especifica',
  time_of_day: 'Se activa a una hora especifica del dia',
  manual: 'Se activa solo cuando vos lo iniciates manualmente',
}

const ACTION_LABELS: Record<ActionType, string> = {
  play_clip: 'Reproducir clip',
  play_random: 'Reproducir aleatorio',
  start_recording: 'Grabar',
  start_session: 'Iniciar sesion',
}

const ResponsesPage = () => {
  const { showToast } = useToast()
  const [view, setView] = useState<View>('list')
  const [rules, setRules] = useState<ResponseRule[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [formName, setFormName] = useState('')
  const [formTrigger, setFormTrigger] = useState<TriggerType>('sound_detected')
  const [formAction, setFormAction] = useState<ActionType>('play_clip')
  const [formClipId, setFormClipId] = useState<number | ''>('')
  const [formThreshold, setFormThreshold] = useState(0.3)
  const [formMinDuration, setFormMinDuration] = useState(300)
  const [formCooldown, setFormCooldown] = useState(10)
  const [formKeyword, setFormKeyword] = useState('')
  const [formTime, setFormTime] = useState('09:00')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [rulesData, clipData] = await Promise.all([
        apiClient.get<ResponseRule[]>('/api/responses'),
        apiClient.get<Clip[]>('/api/clips'),
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
      await apiClient.put<ResponseRule>(`/api/responses/${rule.id}`, { enabled: !rule.enabled })
      setRules((prev) =>
        prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r),
      )
      showToast(rule.enabled ? 'Regla desactivada' : 'Regla activada', 'info')
    } catch {
      showToast('Error al actualizar la regla', 'error')
    }
  }, [showToast])

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
          return { clip_id: Number(formClipId) }
        return {}
      })()

      const payload: ResponseRuleCreate = {
        name: formName.trim(),
        trigger_type: formTrigger,
        trigger_config: triggerConfig,
        action_type: formAction,
        action_config: actionConfig,
        cooldown_seconds: formCooldown,
      }
      await apiClient.post('/api/responses', payload)
      await loadData()
      setView('list')
      setFormName('')
      showToast('Regla creada correctamente', 'success')
    } catch {
      showToast('Error al crear la regla', 'error')
    } finally {
      setSaving(false)
    }
  }, [
    formName, formTrigger, formAction, formClipId, formThreshold,
    formMinDuration, formCooldown, formKeyword, formTime, loadData, showToast,
  ])

  if (view === 'create') {
    return (
      <div className="flex flex-col gap-4 p-4 pb-8 max-w-lg mx-auto">
        <div className="flex items-center gap-3 pt-2">
          <Tooltip text="Volver a la lista de reglas" position="right">
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
            <h1 className="text-xl font-bold text-slate-100">Nueva regla</h1>
            <p className="text-slate-400 text-xs mt-0.5">Define cuando y como responde la app</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1">Nombre de la regla</label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Respuesta a vocalizacion"
            className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Trigger */}
        <div>
          <label className="text-sm font-medium text-slate-300 block mb-2">
            Disparador (que lo activa)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(TRIGGER_LABELS) as [TriggerType, string][]).map(([val, label]) => (
              <Tooltip key={val} text={TRIGGER_TOOLTIPS[val]} position="top">
                <button
                  onClick={() => setFormTrigger(val)}
                  className={`py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    formTrigger === val ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Trigger config */}
        {formTrigger === 'sound_detected' && (
          <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div>
              <Tooltip text="Nivel de volumen minimo para que se active la regla (mas alto = necesita mas volumen)" position="top">
                <label className="text-sm text-slate-300 block mb-1 cursor-help">
                  Umbral de volumen: {Math.round(formThreshold * 100)}%
                </label>
              </Tooltip>
              <input
                type="range"
                min={1}
                max={100}
                value={Math.round(formThreshold * 100)}
                onChange={(e) => setFormThreshold(Number(e.target.value) / 100)}
                className="w-full accent-brand-500"
              />
            </div>
            <div>
              <Tooltip text="Cuanto tiempo tiene que durar el sonido para activarse (en milisegundos)" position="top">
                <label className="text-sm text-slate-300 block mb-1 cursor-help">
                  Duracion minima: {formMinDuration}ms
                </label>
              </Tooltip>
              <input
                type="range"
                min={100}
                max={2000}
                step={100}
                value={formMinDuration}
                onChange={(e) => setFormMinDuration(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
            </div>
          </div>
        )}

        {formTrigger === 'keyword' && (
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">Palabra clave a detectar</label>
            <input
              type="text"
              value={formKeyword}
              onChange={(e) => setFormKeyword(e.target.value)}
              placeholder="hola"
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        )}

        {formTrigger === 'time_of_day' && (
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">Hora de activacion</label>
            <input
              type="time"
              value={formTime}
              onChange={(e) => setFormTime(e.target.value)}
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        )}

        {/* Action */}
        <div>
          <label className="text-sm font-medium text-slate-300 block mb-2">
            Accion (que hace cuando se activa)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(ACTION_LABELS) as [ActionType, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFormAction(val)}
                className={`py-2.5 rounded-xl text-xs font-medium transition-colors ${
                  formAction === val ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {formAction === 'play_clip' && (
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">
              Clip a reproducir
            </label>
            <select
              value={formClipId}
              onChange={(e) => setFormClipId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Seleccionar clip...</option>
              {clips.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <Tooltip text="Cuanto tiempo tiene que pasar antes de que la regla pueda activarse de nuevo" position="top">
            <label className="text-sm font-medium text-slate-300 block mb-1 cursor-help">
              Tiempo de espera entre activaciones: {formCooldown}s
            </label>
          </Tooltip>
          <input
            type="range"
            min={1}
            max={300}
            value={formCooldown}
            onChange={(e) => setFormCooldown(Number(e.target.value))}
            className="w-full accent-brand-500"
          />
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={!formName.trim() || saving}
          className="w-full py-3 bg-brand-500 rounded-xl text-white font-semibold text-sm disabled:opacity-50 hover:bg-brand-600 transition-colors min-h-[48px]"
        >
          {saving ? 'Guardando...' : 'Crear regla'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Respuestas automaticas</h1>
          <p className="text-slate-400 text-sm mt-0.5">Reglas que responden a sonidos o eventos</p>
        </div>
        <Tooltip text="Crear una nueva regla de respuesta automatica" position="left">
          <button
            onClick={() => setView('create')}
            className="h-10 px-4 bg-brand-500 rounded-lg text-white font-medium text-sm hover:bg-brand-600 transition-colors"
          >
            + Nueva
          </button>
        </Tooltip>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <svg className="w-14 h-14 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="font-medium text-slate-400">Sin reglas de respuesta</p>
          <p className="text-sm mt-1">Crea reglas para que la app responda automaticamente</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-100">{rule.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
                      {TRIGGER_LABELS[rule.trigger_type]}
                    </span>
                    <span className="text-slate-500 text-xs">→</span>
                    <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
                      {ACTION_LABELS[rule.action_type]}
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    Activado {rule.times_triggered} veces
                    {rule.cooldown_seconds > 0 && ` · espera ${rule.cooldown_seconds}s`}
                  </p>
                </div>
                <Tooltip
                  text="Activa o desactiva esta regla sin eliminarla"
                  position="left"
                >
                  <button
                    onClick={() => void handleToggle(rule)}
                    className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                      rule.enabled ? 'bg-brand-500' : 'bg-slate-600'
                    }`}
                    aria-label={rule.enabled ? 'Desactivar regla' : 'Activar regla'}
                    role="switch"
                    aria-checked={rule.enabled}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform mx-1 ${
                        rule.enabled ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ResponsesPage
