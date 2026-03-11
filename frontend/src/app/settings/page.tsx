import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/core/api-client'
import { useToast } from '@/components/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Setting {
  key: string
  value: string
  label: string
  category: string
  is_secret: boolean
  is_configured: boolean
  updated_at: string
}

interface TestResult {
  valid: boolean
  message: string
}

type SettingsTab = 'general' | 'ai' | 'station'

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    key: 'general',
    label: 'General',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: 'ai',
    label: 'Inteligencia Artificial',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    key: 'station',
    label: 'Estacion',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
]

const API_KEY_SETTINGS = ['openai_api_key', 'elevenlabs_api_key', 'elevenlabs_voice_id', 'gemini_api_key']

const PROVIDER_INFO: Record<string, { name: string; desc: string; url: string; icon: React.ReactNode }> = {
  openai_api_key: {
    name: 'OpenAI (Whisper)',
    desc: 'Transcripcion y analisis de audio del loro',
    url: 'platform.openai.com/api-keys',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.05.32 6.044 6.044 0 005.07 4.2a6.022 6.022 0 00-4.03 2.915 6.045 6.045 0 00.748 7.09 5.983 5.983 0 00.51 4.91 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.2 23.68a6.056 6.056 0 005.98-3.88 6.022 6.022 0 004.03-2.916 6.044 6.044 0 00-.748-7.09h-.18z" />
      </svg>
    ),
  },
  elevenlabs_api_key: {
    name: 'ElevenLabs',
    desc: 'Generacion de voz clonada para clips',
    url: 'elevenlabs.io/app/settings/api-keys',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  elevenlabs_voice_id: {
    name: 'Voice ID',
    desc: 'ID de tu voz clonada en ElevenLabs',
    url: 'elevenlabs.io/app/voice-lab',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4" />
      </svg>
    ),
  },
  gemini_api_key: {
    name: 'Google Gemini',
    desc: 'Planes de entrenamiento y analisis con IA',
    url: 'aistudio.google.com/apikey',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
}

const TIMEZONES = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo (GMT-3)' },
  { value: 'America/Santiago', label: 'Santiago (GMT-4)' },
  { value: 'America/Bogota', label: 'Bogota (GMT-5)' },
  { value: 'America/Lima', label: 'Lima (GMT-5)' },
  { value: 'America/Mexico_City', label: 'Ciudad de Mexico (GMT-6)' },
  { value: 'America/New_York', label: 'New York (GMT-5)' },
  { value: 'America/Chicago', label: 'Chicago (GMT-6)' },
  { value: 'America/Denver', label: 'Denver (GMT-7)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8)' },
  { value: 'Europe/Madrid', label: 'Madrid (GMT+1)' },
  { value: 'Europe/London', label: 'Londres (GMT+0)' },
  { value: 'Europe/Berlin', label: 'Berlin (GMT+1)' },
  { value: 'Europe/Paris', label: 'Paris (GMT+1)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
  { value: 'Australia/Sydney', label: 'Sydney (GMT+11)' },
  { value: 'UTC', label: 'UTC (GMT+0)' },
]

const inputClass =
  'w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700'

// ── Component ─────────────────────────────────────────────────────────────────

const SettingsPage = () => {
  const { showToast } = useToast()
  const [allSettings, setAllSettings] = useState<Setting[]>([])
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [loading, setLoading] = useState(true)

  // Local slider state (prevents API call on every pixel drag)
  const [localThreshold, setLocalThreshold] = useState<number | null>(null)
  const [localVolume, setLocalVolume] = useState<number | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get<Setting[]>('/api/v1/settings/')
      setAllSettings(Array.isArray(data) ? data : [])
    } catch {
      showToast('Error al cargar la configuracion', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  const getSetting = useCallback((key: string): Setting | undefined => {
    return allSettings.find((s) => s.key === key)
  }, [allSettings])

  const getSettingValue = useCallback((key: string): string => {
    return allSettings.find((s) => s.key === key)?.value ?? ''
  }, [allSettings])

  const apiKeySettings = useMemo(
    () => allSettings.filter((s) => API_KEY_SETTINGS.includes(s.key)),
    [allSettings],
  )

  const configuredCount = useMemo(
    () => apiKeySettings.filter((s) => s.is_configured).length,
    [apiKeySettings],
  )

  // ── Save helpers ──────────────────────────────────────────────────

  const saveSetting = useCallback(async (key: string, value: string, silent = false) => {
    setSaving(true)
    try {
      await api.put(`/api/v1/settings/${key}`, { value })
      await fetchSettings()
      if (!silent) showToast('Guardado', 'success')
      setTestResults((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } catch {
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }, [fetchSettings, showToast])

  const handleEditSave = useCallback(async (key: string) => {
    const setting = getSetting(key)
    if (!editValue && setting?.is_secret) {
      setEditingKey(null)
      return
    }
    await saveSetting(key, editValue)
    setEditingKey(null)
    setEditValue('')
  }, [editValue, getSetting, saveSetting])

  const handleTest = useCallback(async (key: string) => {
    setTesting(key)
    try {
      const result = await api.post<TestResult>(`/api/v1/settings/test/${key}`, {})
      setTestResults((prev) => ({ ...prev, [key]: result }))
      showToast(result.valid ? 'Conexion exitosa' : 'Conexion fallida', result.valid ? 'success' : 'error')
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [key]: { valid: false, message: 'Error de conexion' },
      }))
      showToast('Error al verificar', 'error')
    } finally {
      setTesting(null)
    }
  }, [showToast])

  const handleEdit = useCallback((setting: Setting) => {
    setEditingKey(setting.key)
    setEditValue(setting.is_secret ? '' : setting.value)
  }, [])

  const handleCancel = useCallback(() => {
    setEditingKey(null)
    setEditValue('')
  }, [])

  // ── Render: API Key card ──────────────────────────────────────────

  const renderApiKeyCard = (setting: Setting) => {
    const info = PROVIDER_INFO[setting.key]
    const testResult = testResults[setting.key]
    if (!info) return null

    return (
      <div key={setting.key} className="bg-slate-800 rounded-xl overflow-hidden">
        {/* Header row */}
        <div className="p-4 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            setting.is_configured ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-700 text-slate-500'
          }`}>
            {info.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-slate-100 text-sm font-medium">{info.name}</p>
              {setting.is_configured && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              )}
            </div>
            <p className="text-slate-500 text-xs mt-0.5">{info.desc}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pb-4 space-y-2">
          {editingKey === setting.key ? (
            <div className="space-y-2">
              <input
                type={setting.is_secret ? 'password' : 'text'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder={setting.is_secret ? 'Pega tu API key aqui...' : 'Ingresa el valor...'}
                className={`${inputClass} font-mono text-xs`}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleEditSave(setting.key)
                  if (e.key === 'Escape') handleCancel()
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void handleEditSave(setting.key)}
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:bg-slate-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 bg-slate-700 hover:bg-slate-600 active:scale-[0.98] text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 text-xs font-mono truncate">
                  {setting.is_configured
                    ? setting.is_secret ? setting.value : (setting.value || '(vacio)')
                    : 'No configurada'}
                </span>
                <div className="flex gap-1.5 shrink-0">
                  {setting.is_configured && (
                    <button
                      onClick={() => void handleTest(setting.key)}
                      disabled={testing === setting.key}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors active:scale-[0.98] ${
                        testResult?.valid === true
                          ? 'bg-emerald-900/40 text-emerald-300'
                          : testResult?.valid === false
                          ? 'bg-red-900/40 text-red-300'
                          : 'bg-blue-900/40 text-blue-300 hover:bg-blue-900/60'
                      }`}
                    >
                      {testing === setting.key
                        ? 'Verificando...'
                        : testResult?.valid === true
                        ? 'Valida'
                        : testResult?.valid === false
                        ? 'Invalida'
                        : 'Verificar'}
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(setting)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-[0.98] text-slate-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    {setting.is_configured ? 'Cambiar' : 'Configurar'}
                  </button>
                </div>
              </div>

              {/* Test result message */}
              {testResult && (
                <p className={`text-[11px] ${testResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                  {testResult.message}
                </p>
              )}

              {/* URL hint for unconfigured */}
              {!setting.is_configured && (
                <p className="text-[11px] text-slate-600">
                  Obtene tu key en <span className="text-slate-500">{info.url}</span>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Render: General tab ───────────────────────────────────────────

  const renderGeneralTab = () => {
    const stationName = getSettingValue('station_name')
    const timezone = getSettingValue('timezone')

    return (
      <div className="flex flex-col gap-4">
        {/* Station name */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Identificacion
          </h2>
          <div className="bg-slate-800 rounded-xl p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="station-name">
                Nombre de la estacion
              </label>
              <p className="text-slate-500 text-xs mb-2">
                Un nombre para identificar tu setup de LoroApp
              </p>
              {editingKey === 'station_name' ? (
                <div className="space-y-2">
                  <input
                    id="station-name"
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Ej: Estacion Rio, Sala principal..."
                    className={inputClass}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleEditSave('station_name')
                      if (e.key === 'Escape') handleCancel()
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleEditSave('station_name')}
                      disabled={saving}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:bg-slate-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                    >
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="px-4 bg-slate-700 hover:bg-slate-600 active:scale-[0.98] text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-slate-200 text-sm">
                    {stationName || 'Sin nombre'}
                  </span>
                  <button
                    onClick={() => {
                      setEditingKey('station_name')
                      setEditValue(stationName)
                    }}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-[0.98] text-slate-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    Editar
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Timezone */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Zona horaria
          </h2>
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="timezone-select">
                Zona horaria del sistema
              </label>
              <p className="text-slate-500 text-xs mb-2">
                Afecta los horarios del scheduler y las estadisticas diarias
              </p>
              <select
                id="timezone-select"
                value={timezone || 'America/Argentina/Buenos_Aires'}
                onChange={(e) => void saveSetting('timezone', e.target.value)}
                disabled={saving}
                className={inputClass}
              >
                <option value="">Seleccionar zona horaria...</option>
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-emerald-400 text-xs font-medium">
                {TIMEZONES.find((tz) => tz.value === (timezone || 'America/Argentina/Buenos_Aires'))?.label ?? timezone ?? 'Buenos Aires (GMT-3)'}
              </span>
            </div>
          </div>
        </section>
      </div>
    )
  }

  // ── Render: AI tab ────────────────────────────────────────────────

  const renderAiTab = () => (
    <div className="flex flex-col gap-4">
      {/* Progress summary */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-slate-200 text-sm font-medium">Estado de conexiones</p>
            <p className="text-slate-500 text-xs mt-0.5">
              {configuredCount === apiKeySettings.length && apiKeySettings.length > 0
                ? 'Todas las integraciones estan configuradas'
                : `${configuredCount} de ${apiKeySettings.length} API keys configuradas`}
            </p>
          </div>
          {configuredCount === apiKeySettings.length && apiKeySettings.length > 0 && (
            <div className="w-8 h-8 rounded-lg bg-emerald-900/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>
        <div className="w-full bg-slate-700 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              configuredCount === apiKeySettings.length ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: apiKeySettings.length > 0 ? `${(configuredCount / apiKeySettings.length) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* API Key cards */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Servicios de IA
        </h2>
        <div className="flex flex-col gap-3">
          {loading ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-800 rounded-xl h-24 animate-pulse" />
            ))
          ) : (
            apiKeySettings.map(renderApiKeyCard)
          )}
        </div>
      </section>

      {/* Help box */}
      {configuredCount < apiKeySettings.length && (
        <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl p-4">
          <p className="text-blue-300 text-xs font-medium mb-2">Como funciona</p>
          <ul className="space-y-1.5">
            <li className="text-blue-200/70 text-xs flex gap-2">
              <span className="text-blue-400 shrink-0">1.</span>
              Crea una cuenta gratuita en el servicio
            </li>
            <li className="text-blue-200/70 text-xs flex gap-2">
              <span className="text-blue-400 shrink-0">2.</span>
              Genera una API key en su panel
            </li>
            <li className="text-blue-200/70 text-xs flex gap-2">
              <span className="text-blue-400 shrink-0">3.</span>
              Pega la key aca y presiona &quot;Verificar&quot;
            </li>
          </ul>
        </div>
      )}
    </div>
  )

  // ── Render: Station tab ───────────────────────────────────────────

  const renderStationTab = () => {
    const thresholdSetting = getSetting('detection_threshold')
    const volumeSetting = getSetting('default_volume')
    const serverThreshold = thresholdSetting?.value ? parseFloat(thresholdSetting.value) : 0.3
    const serverVolume = volumeSetting?.value ? parseFloat(volumeSetting.value) : 0.7

    const thresholdPercent = localThreshold ?? Math.round(serverThreshold * 100)
    const volumePercent = localVolume ?? Math.round(serverVolume * 100)

    const thresholdLabel =
      thresholdPercent < 20 ? 'Detecta cualquier sonido'
        : thresholdPercent < 40 ? 'Detecta sonidos suaves'
        : thresholdPercent < 60 ? 'Detecta sonidos normales'
        : thresholdPercent < 80 ? 'Solo sonidos fuertes'
        : 'Solo sonidos muy fuertes'

    return (
      <div className="flex flex-col gap-4">
        {/* Detection threshold */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Deteccion de sonido
          </h2>
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">
                Sensibilidad del microfono
              </label>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">
                {thresholdPercent}%
              </span>
            </div>
            <p className="text-slate-500 text-xs">
              Nivel minimo de sonido para que la estacion reaccione
            </p>
            <input
              type="range"
              min={1}
              max={100}
              value={thresholdPercent}
              onChange={(e) => setLocalThreshold(Number(e.target.value))}
              onMouseUp={() => {
                if (localThreshold !== null) {
                  void saveSetting('detection_threshold', (localThreshold / 100).toFixed(2), true)
                  setLocalThreshold(null)
                }
              }}
              onTouchEnd={() => {
                if (localThreshold !== null) {
                  void saveSetting('detection_threshold', (localThreshold / 100).toFixed(2), true)
                  setLocalThreshold(null)
                }
              }}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 px-0.5">
              <span>Muy sensible</span>
              <span>Solo gritos</span>
            </div>
            <p className="text-xs text-slate-400">{thresholdLabel}</p>
          </div>
        </section>

        {/* Volume */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Audio
          </h2>
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">
                Volumen de reproduccion
              </label>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">
                {volumePercent}%
              </span>
            </div>
            <p className="text-slate-500 text-xs">
              Volumen por defecto al reproducir clips y respuestas
            </p>
            <input
              type="range"
              min={0}
              max={100}
              value={volumePercent}
              onChange={(e) => setLocalVolume(Number(e.target.value))}
              onMouseUp={() => {
                if (localVolume !== null) {
                  void saveSetting('default_volume', (localVolume / 100).toFixed(2), true)
                  setLocalVolume(null)
                }
              }}
              onTouchEnd={() => {
                if (localVolume !== null) {
                  void saveSetting('default_volume', (localVolume / 100).toFixed(2), true)
                  setLocalVolume(null)
                }
              }}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 px-0.5">
              <span>Silencio</span>
              <span>Maximo</span>
            </div>
          </div>
        </section>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Configuracion</h1>
        <p className="text-slate-400 text-xs mt-0.5">
          Preferencias, integraciones y ajustes de la estacion
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); handleCancel() }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="shrink-0">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">
              {tab.key === 'general' ? 'General' : tab.key === 'ai' ? 'IA' : 'Estacion'}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'general' && renderGeneralTab()}
      {activeTab === 'ai' && renderAiTab()}
      {activeTab === 'station' && renderStationTab()}
    </div>
  )
}

export default SettingsPage
