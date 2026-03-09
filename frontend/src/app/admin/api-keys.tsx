import { useCallback, useEffect, useState } from 'react'
import { api } from '@/core/api-client'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'

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

const API_KEY_SETTINGS = ['openai_api_key', 'elevenlabs_api_key', 'elevenlabs_voice_id', 'gemini_api_key']

const PROVIDER_INFO: Record<string, { name: string; description: string; url: string; color: string }> = {
  openai_api_key: {
    name: 'OpenAI (Whisper)',
    description: 'Transcripcion de audio y analisis de lo que dice tu loro',
    url: 'platform.openai.com/api-keys',
    color: 'emerald',
  },
  elevenlabs_api_key: {
    name: 'ElevenLabs',
    description: 'Generacion de voz y clonacion para crear clips de entrenamiento',
    url: 'elevenlabs.io/app/settings/api-keys',
    color: 'purple',
  },
  elevenlabs_voice_id: {
    name: 'ElevenLabs Voice ID',
    description: 'ID de la voz clonada que se usara para generar clips',
    url: 'elevenlabs.io/app/voice-lab',
    color: 'purple',
  },
  gemini_api_key: {
    name: 'Google Gemini',
    description: 'Analisis de progreso, planes de entrenamiento y alimentacion con IA',
    url: 'aistudio.google.com/apikey',
    color: 'blue',
  },
}

const ApiKeysPage = () => {
  const { showToast } = useToast()
  const [settings, setSettings] = useState<Setting[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [loading, setLoading] = useState(true)

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get<Setting[]>('/api/v1/settings/')
      setSettings(data.filter((s) => API_KEY_SETTINGS.includes(s.key)))
    } catch {
      showToast('Error al cargar las API keys', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  const handleEdit = (setting: Setting) => {
    setEditingKey(setting.key)
    setEditValue(setting.is_secret ? '' : setting.value)
  }

  const handleSave = async (key: string) => {
    if (!editValue && settings.find((s) => s.key === key)?.is_secret) {
      setEditingKey(null)
      return
    }
    setSaving(true)
    try {
      await api.put(`/api/v1/settings/${key}`, { value: editValue })
      setEditingKey(null)
      setEditValue('')
      await fetchSettings()
      showToast('API Key guardada', 'success')
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
  }

  const handleTest = async (key: string) => {
    setTesting(key)
    try {
      const result = await api.post<TestResult>(`/api/v1/settings/test/${key}`, {})
      setTestResults((prev) => ({ ...prev, [key]: result }))
      showToast(result.valid ? 'API Key valida' : 'API Key invalida', result.valid ? 'success' : 'error')
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [key]: { valid: false, message: 'Error al verificar' },
      }))
      showToast('Error al verificar la API key', 'error')
    } finally {
      setTesting(null)
    }
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const isTestableKey = (key: string) =>
    ['openai_api_key', 'elevenlabs_api_key', 'gemini_api_key'].includes(key)

  const configuredCount = settings.filter((s) => s.is_configured).length

  return (
    <div className="p-4 space-y-5 pb-10 max-w-lg mx-auto">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">API Keys & Integraciones</h1>
        <p className="text-slate-400 text-sm mt-1">
          Conecta los servicios de IA para habilitar funciones avanzadas
        </p>
      </div>

      {/* Status summary */}
      <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-slate-200 text-sm font-medium">
            {configuredCount} de {settings.length} configuradas
          </p>
          <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all"
              style={{ width: settings.length > 0 ? `${(configuredCount / settings.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* API Keys list */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {settings.map((setting) => {
            const info = PROVIDER_INFO[setting.key]
            return (
              <div key={setting.key} className="bg-slate-800 rounded-xl p-4 space-y-3">
                {/* Provider header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      setting.is_configured ? 'bg-emerald-500' : 'bg-slate-600'
                    }`} />
                    <div>
                      <p className="text-slate-100 text-sm font-semibold">
                        {info?.name ?? setting.label}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {info?.description ?? ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Edit mode */}
                {editingKey === setting.key ? (
                  <div className="space-y-2">
                    <input
                      type={setting.is_secret ? 'password' : 'text'}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder={
                        setting.is_secret
                          ? 'Pega tu API key aqui...'
                          : setting.value || 'Ingresa el valor...'
                      }
                      className="w-full bg-slate-700 text-slate-200 rounded-xl p-3 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSave(setting.key)
                        if (e.key === 'Escape') handleCancel()
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleSave(setting.key)}
                        disabled={saving}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors min-h-[40px]"
                      >
                        {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors min-h-[40px]"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 text-sm font-mono truncate">
                      {setting.is_configured
                        ? setting.is_secret
                          ? setting.value
                          : setting.value || '(vacio)'
                        : 'No configurada'}
                    </span>
                    <div className="flex gap-2 shrink-0">
                      {isTestableKey(setting.key) && setting.is_configured && (
                        <Tooltip text="Verifica que tu clave funcione correctamente" position="left">
                          <button
                            onClick={() => void handleTest(setting.key)}
                            disabled={testing === setting.key}
                            className="px-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-xs font-medium py-2 rounded-lg transition-colors min-h-[36px]"
                          >
                            {testing === setting.key ? '...' : 'Verificar'}
                          </button>
                        </Tooltip>
                      )}
                      <button
                        onClick={() => handleEdit(setting)}
                        className="px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium py-2 rounded-lg transition-colors min-h-[36px]"
                      >
                        {setting.is_configured ? 'Editar' : 'Configurar'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Test result */}
                {testResults[setting.key] && (
                  <div
                    className={`text-xs p-2.5 rounded-lg flex items-center gap-2 ${
                      testResults[setting.key].valid
                        ? 'bg-emerald-900/50 text-emerald-300'
                        : 'bg-red-900/50 text-red-300'
                    }`}
                  >
                    <span>{testResults[setting.key].valid ? 'Valida' : 'Invalida'}</span>
                    <span className="opacity-60">-</span>
                    <span>{testResults[setting.key].message}</span>
                  </div>
                )}

                {/* Provider URL */}
                {info && !setting.is_configured && (
                  <p className="text-xs text-slate-500">
                    Obtener en: <span className="text-slate-400 font-mono">{info.url}</span>
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Help box */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Como obtener las API Keys</h3>
        <div className="space-y-2">
          {Object.values(PROVIDER_INFO).filter((p) => p.name !== 'ElevenLabs Voice ID').map((provider) => (
            <div key={provider.name} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-1.5 shrink-0" />
              <div>
                <p className="text-xs text-slate-300 font-medium">{provider.name}</p>
                <p className="text-xs text-slate-500 font-mono">{provider.url}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ApiKeysPage
