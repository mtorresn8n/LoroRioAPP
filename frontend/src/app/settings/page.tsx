import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

const API_KEY_SETTINGS = ['openai_api_key', 'elevenlabs_api_key', 'elevenlabs_voice_id', 'gemini_api_key']

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  station: 'Estacion',
}

const CATEGORY_ORDER = ['general', 'station']

const SettingsPage = () => {
  const { showToast } = useToast()
  const [settings, setSettings] = useState<Setting[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get<Setting[]>('/api/v1/settings/')
      const items = Array.isArray(data) ? data : []
      // Filter out API key settings - those are managed in /admin/api-keys
      setSettings(items.filter((s) => !API_KEY_SETTINGS.includes(s.key)))
    } catch {
      showToast('Error al cargar la configuracion', 'error')
    }
  }, [showToast])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  const handleEdit = (setting: Setting) => {
    setEditingKey(setting.key)
    setEditValue(setting.value)
  }

  const handleSave = async (key: string) => {
    setSaving(true)
    try {
      await api.put(`/api/v1/settings/${key}`, { value: editValue })
      setEditingKey(null)
      setEditValue('')
      await fetchSettings()
      showToast('Configuracion guardada', 'success')
    } catch {
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const groupedSettings = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] ?? cat,
      items: settings.filter((s) => s.category === cat),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="p-4 space-y-5 pb-10 max-w-lg mx-auto">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Configuracion</h1>
        <p className="text-slate-400 text-sm mt-1">
          Preferencias generales y ajustes de la estacion
        </p>
      </div>

      {/* Link to API Keys */}
      <Link
        to="/admin/api-keys"
        className="bg-slate-800 rounded-xl p-4 flex items-center gap-3 hover:bg-slate-700 transition-colors group"
      >
        <div className="w-10 h-10 rounded-lg bg-emerald-900/40 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-slate-100 text-sm font-medium group-hover:text-white">API Keys & Integraciones</p>
          <p className="text-slate-500 text-xs">OpenAI, ElevenLabs, Gemini</p>
        </div>
        <svg className="w-5 h-5 text-slate-500 group-hover:text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* General settings */}
      {groupedSettings.map((group) => (
        <div key={group.category} className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            {group.label}
          </h2>

          {group.items.map((setting) => (
            <div
              key={setting.key}
              className="bg-slate-800 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-200 font-medium text-sm">{setting.label}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{setting.key}</p>
                </div>
              </div>

              {editingKey === setting.key ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder={setting.value || 'Ingresa el valor...'}
                    className="w-full bg-slate-700 text-slate-200 rounded-xl p-3 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm font-mono">
                    {setting.value || '(por defecto)'}
                  </span>
                  <Tooltip text="Editar este valor" position="left">
                    <button
                      onClick={() => handleEdit(setting)}
                      className="px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium py-2 rounded-lg transition-colors min-h-[36px]"
                    >
                      Editar
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {settings.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-sm">Cargando configuracion...</p>
        </div>
      )}
    </div>
  )
}

export default SettingsPage
