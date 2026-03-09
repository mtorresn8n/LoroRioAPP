import { useCallback, useEffect, useState } from 'react';
import { api } from '@/core/api-client';
import { Tooltip } from '@/components/tooltip';
import { useToast } from '@/components/toast';

interface Setting {
  key: string;
  value: string;
  label: string;
  category: string;
  is_secret: boolean;
  is_configured: boolean;
  updated_at: string;
}

interface TestResult {
  valid: boolean;
  message: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  ai: 'Inteligencia Artificial',
  general: 'General',
  station: 'Estacion',
};

const CATEGORY_ORDER = ['ai', 'general', 'station'];

const SettingsPage = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get<Setting[]>('/api/v1/settings/');
      setSettings(data);
    } catch {
      showToast('Error al cargar la configuracion', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleEdit = (setting: Setting) => {
    setEditingKey(setting.key);
    setEditValue(setting.is_secret ? '' : setting.value);
  };

  const handleSave = async (key: string) => {
    if (!editValue && settings.find((s) => s.key === key)?.is_secret) {
      setEditingKey(null);
      return;
    }

    setSaving(true);
    try {
      await api.put(`/api/v1/settings/${key}`, { value: editValue });
      setEditingKey(null);
      setEditValue('');
      await fetchSettings();
      showToast('Configuracion guardada', 'success');
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch {
      showToast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (key: string) => {
    setTesting(key);
    try {
      const result = await api.post<TestResult>(`/api/v1/settings/test/${key}`, {});
      setTestResults((prev) => ({ ...prev, [key]: result }));
      showToast(result.valid ? 'API Key valida' : 'API Key invalida', result.valid ? 'success' : 'error');
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [key]: { valid: false, message: 'Error al verificar' },
      }));
      showToast('Error al verificar la API key', 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleCancel = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const groupedSettings = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] ?? cat,
      items: settings.filter((s) => s.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  const isTestableKey = (key: string) =>
    ['openai_api_key', 'elevenlabs_api_key', 'gemini_api_key'].includes(key);

  return (
    <div className="p-4 space-y-6 pb-10 max-w-lg mx-auto">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Configuracion</h1>
        <p className="text-slate-400 text-sm mt-1">
          API keys y preferencias de la aplicacion
        </p>
      </div>

      {groupedSettings.map((group) => (
        <div key={group.category} className="space-y-3">
          <h2 className="text-base font-semibold text-slate-300">{group.label}</h2>

          {group.items.map((setting) => (
            <div
              key={setting.key}
              className="bg-slate-800 rounded-lg p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-slate-200 font-medium text-sm">
                    {setting.label}
                  </span>
                  <span className="text-slate-500 text-xs ml-2">{setting.key}</span>
                </div>
                <Tooltip
                  text={setting.is_configured ? 'Esta clave ya esta configurada' : 'Esta clave no esta configurada todavia'}
                  position="left"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${setting.is_configured ? 'bg-emerald-500' : 'bg-red-500'}`}
                  />
                </Tooltip>
              </div>

              {editingKey === setting.key ? (
                <div className="space-y-2">
                  <input
                    type={setting.is_secret ? 'password' : 'text'}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder={
                      setting.is_secret
                        ? 'Ingresa el nuevo valor...'
                        : setting.value || 'Ingresa el valor...'
                    }
                    className="w-full bg-slate-700 text-slate-200 rounded-lg p-3 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSave(setting.key);
                      if (e.key === 'Escape') handleCancel();
                    }}
                  />
                  <div className="flex gap-2">
                    <Tooltip text="Guardar este valor en la configuracion" position="top">
                      <button
                        onClick={() => void handleSave(setting.key)}
                        disabled={saving}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </Tooltip>
                    <Tooltip text="Cancelar la edicion sin guardar cambios" position="top">
                      <button
                        onClick={handleCancel}
                        className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium py-2 rounded-lg transition-colors"
                      >
                        Cancelar
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm font-mono">
                    {setting.is_configured
                      ? setting.is_secret
                        ? setting.value
                        : setting.value || '(vacio)'
                      : 'No configurado'}
                  </span>
                  <div className="flex gap-2">
                    {isTestableKey(setting.key) && setting.is_configured && (
                      <Tooltip text="Verifica que tu clave funcione correctamente" position="left">
                        <button
                          onClick={() => void handleTest(setting.key)}
                          disabled={testing === setting.key}
                          className="px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white text-xs font-medium py-1.5 rounded-lg transition-colors min-h-[36px]"
                        >
                          {testing === setting.key ? 'Verificando...' : 'Verificar'}
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip
                      text={setting.is_configured ? 'Editar el valor de esta configuracion' : 'Configurar esta clave para habilitar la funcionalidad'}
                      position="left"
                    >
                      <button
                        onClick={() => handleEdit(setting)}
                        className="px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium py-1.5 rounded-lg transition-colors min-h-[36px]"
                      >
                        {setting.is_configured ? 'Editar' : 'Configurar'}
                      </button>
                    </Tooltip>
                  </div>
                </div>
              )}

              {testResults[setting.key] && (
                <div
                  className={`text-xs p-2 rounded ${
                    testResults[setting.key].valid
                      ? 'bg-emerald-900/50 text-emerald-300'
                      : 'bg-red-900/50 text-red-300'
                  }`}
                >
                  {testResults[setting.key].valid ? 'API Key valida' : 'API Key invalida'}
                  {' - '}
                  {testResults[setting.key].message}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Info box */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold text-slate-300">Donde obtener las API Keys</h3>
        <ul className="text-xs text-slate-400 space-y-2">
          <li>
            <strong className="text-slate-300">OpenAI (Whisper):</strong>{' '}
            <span className="font-mono">platform.openai.com/api-keys</span>
          </li>
          <li>
            <strong className="text-slate-300">ElevenLabs:</strong>{' '}
            <span className="font-mono">elevenlabs.io/app/settings/api-keys</span>
          </li>
          <li>
            <strong className="text-slate-300">Gemini:</strong>{' '}
            <span className="font-mono">aistudio.google.com/apikey</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default SettingsPage;
