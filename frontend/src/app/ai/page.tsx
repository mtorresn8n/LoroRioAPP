import { useCallback, useEffect, useState } from 'react'
import { api } from '@/core/api-client'
import { useToast } from '@/components/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TranscribeResult {
  recording_id: string
  transcription: string
  confidence: number
  similarity_score: number | null
  target_word: string | null
}

interface ProgressInsight {
  summary: string
  best_time_of_day: string | null
  most_effective_clips: string[]
  recommendations: string[]
  progress_trend: string
  weekly_score: number | null
}

interface GenerateSpeechResult {
  clip_id: string
  name: string
  duration: number
}

interface Recording {
  id: string
  file_path: string
  classification: string | null
  duration: number
  recorded_at: string
}

interface Clip {
  id: string
  name: string
  type: string
}

interface AiPlan {
  plan_id: string
  plan_data: Record<string, unknown>
  generated_at: string
}

type ActiveTab = 'transcribe' | 'generate' | 'progress' | 'plan'

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputClass =
  'w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700'

const btnBase =
  'w-full font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98] disabled:bg-slate-600 disabled:text-slate-400 text-white'

// ── Component ─────────────────────────────────────────────────────────────────

const AiPage = () => {
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<ActiveTab>('transcribe')
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Transcribe state
  const [selectedRecording, setSelectedRecording] = useState('')
  const [selectedTargetClip, setSelectedTargetClip] = useState('')
  const [transcribeResult, setTranscribeResult] = useState<TranscribeResult | null>(null)

  // Generate speech state
  const [speechText, setSpeechText] = useState('')
  const [speechName, setSpeechName] = useState('')
  const [speechCategory, setSpeechCategory] = useState('')
  const [generateResult, setGenerateResult] = useState<GenerateSpeechResult | null>(null)

  // Progress state
  const [progressDays, setProgressDays] = useState(7)
  const [progressInsight, setProgressInsight] = useState<ProgressInsight | null>(null)

  // Plan state
  const [planGoal, setPlanGoal] = useState('')
  const [planDifficulty, setPlanDifficulty] = useState(2)
  const [planSessions, setPlanSessions] = useState(3)
  const [generatedPlan, setGeneratedPlan] = useState<AiPlan | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [recs, cls] = await Promise.all([
          api.get<Recording[]>('/api/v1/recordings/?limit=100'),
          api.get<Clip[]>('/api/v1/clips/?limit=100'),
        ])
        setRecordings(recs)
        setClips(cls)
      } catch {
        // Non-critical
      }
    }
    void fetchData()
  }, [])

  const handleTranscribe = useCallback(async () => {
    if (!selectedRecording) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.post<TranscribeResult>('/api/v1/ai/transcribe', {
        recording_id: selectedRecording,
        target_clip_id: selectedTargetClip || null,
      })
      setTranscribeResult(result)
      showToast('Transcripcion completada', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al transcribir'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedRecording, selectedTargetClip, showToast])

  const handleGenerateSpeech = useCallback(async () => {
    if (!speechText || !speechName) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.post<GenerateSpeechResult>('/api/v1/ai/generate-speech', {
        text: speechText,
        name: speechName,
        category: speechCategory || null,
      })
      setGenerateResult(result)
      showToast('Voz generada y guardada en la biblioteca', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al generar voz'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [speechText, speechName, speechCategory, showToast])

  const handleAnalyzeProgress = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.post<ProgressInsight>(
        `/api/v1/ai/analyze-progress?days=${progressDays}`,
        {}
      )
      setProgressInsight(result)
      showToast('Analisis completado', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al analizar progreso'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [progressDays, showToast])

  const handleSuggestPlan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.post<AiPlan>('/api/v1/ai/suggest-plan', {
        goal: planGoal || 'general',
        difficulty: planDifficulty,
        sessions_per_day: planSessions,
      })
      setGeneratedPlan(result)
      showToast('Plan generado correctamente', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al generar plan'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [planGoal, planDifficulty, planSessions, showToast])

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'transcribe', label: 'Transcribir' },
    { key: 'generate', label: 'Generar Voz' },
    { key: 'progress', label: 'Progreso' },
    { key: 'plan', label: 'Plan IA' },
  ]

  const Spinner = () => (
    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  )

  return (
    <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Inteligencia Artificial</h1>
        <p className="text-slate-400 text-xs mt-0.5">
          Herramientas de IA para el entrenamiento
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 flex-1 py-2.5 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 p-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* ── Transcribe Tab ─────────────────────────────────────────────── */}
      {activeTab === 'transcribe' && (
        <div className="flex flex-col gap-4">
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Transcribir grabacion
            </h2>
            <div className="bg-slate-800 rounded-xl p-4 space-y-4">
              <p className="text-slate-400 text-sm">
                Whisper analiza lo que dijo el loro y lo compara con el clip objetivo.
              </p>

              <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-3">
                <p className="text-amber-300 text-xs">
                  Configura tus API keys en Configuracion para usar la IA.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="ai-recording">
                  Grabacion a analizar
                </label>
                <select
                  id="ai-recording"
                  value={selectedRecording}
                  onChange={(e) => setSelectedRecording(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Seleccionar grabacion...</option>
                  {recordings.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.recorded_at).toLocaleString('es')}
                      {r.duration !== null ? ` - ${r.duration.toFixed(1)}s` : ''}
                      {r.classification ? ` (${r.classification})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="ai-target-clip">
                  Clip objetivo (opcional)
                </label>
                <select
                  id="ai-target-clip"
                  value={selectedTargetClip}
                  onChange={(e) => setSelectedTargetClip(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Sin comparacion</option>
                  {clips.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => void handleTranscribe()}
                disabled={loading || !selectedRecording}
                className={`${btnBase} bg-emerald-600 hover:bg-emerald-500`}
              >
                {loading ? <><Spinner /> Analizando...</> : 'Transcribir con Whisper'}
              </button>
            </div>
          </section>

          {transcribeResult && (
            <section>
              <h2 className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-2">
                Resultado
              </h2>
              <div className="bg-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400 text-sm">Transcripcion:</span>
                  <span className="text-slate-200 font-medium text-sm text-right">
                    &ldquo;{transcribeResult.transcription}&rdquo;
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">Confianza:</span>
                  <span className="text-slate-200 text-sm tabular-nums">
                    {(transcribeResult.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {transcribeResult.similarity_score !== null && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400 text-sm">Palabra objetivo:</span>
                      <span className="text-slate-200 text-sm">
                        &ldquo;{transcribeResult.target_word}&rdquo;
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Similitud:</span>
                      <span
                        className={`font-bold text-lg tabular-nums ${
                          transcribeResult.similarity_score > 0.7
                            ? 'text-emerald-400'
                            : transcribeResult.similarity_score > 0.4
                            ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}
                      >
                        {(transcribeResult.similarity_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all ${
                          transcribeResult.similarity_score > 0.7
                            ? 'bg-emerald-500'
                            : transcribeResult.similarity_score > 0.4
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${transcribeResult.similarity_score * 100}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Generate Speech Tab ────────────────────────────────────────── */}
      {activeTab === 'generate' && (
        <div className="flex flex-col gap-4">
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Generar voz con ElevenLabs
            </h2>
            <div className="bg-slate-800 rounded-xl p-4 space-y-4">
              <p className="text-slate-400 text-sm">
                Escribe una frase y se genera con tu voz clonada. Se guarda como clip.
              </p>

              <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-3">
                <p className="text-amber-300 text-xs">
                  Configura tus API keys en Configuracion para usar la IA.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="speech-text">
                  Texto a generar *
                </label>
                <input
                  id="speech-text"
                  type="text"
                  value={speechText}
                  onChange={(e) => setSpeechText(e.target.value)}
                  placeholder="Hola Rio, buen loro"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="speech-name">
                  Nombre del clip *
                </label>
                <input
                  id="speech-name"
                  type="text"
                  value={speechName}
                  onChange={(e) => setSpeechName(e.target.value)}
                  placeholder="Saludo matutino"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="speech-category">
                  Categoria
                </label>
                <select
                  id="speech-category"
                  value={speechCategory}
                  onChange={(e) => setSpeechCategory(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Sin categoria</option>
                  <option value="greeting">Saludo</option>
                  <option value="training">Entrenamiento</option>
                  <option value="reward">Recompensa</option>
                  <option value="phrase">Frase</option>
                  <option value="command">Comando</option>
                </select>
              </div>

              <button
                onClick={() => void handleGenerateSpeech()}
                disabled={loading || !speechText || !speechName}
                className={`${btnBase} bg-purple-600 hover:bg-purple-500`}
              >
                {loading ? <><Spinner /> Generando...</> : 'Generar con tu Voz'}
              </button>
            </div>
          </section>

          {generateResult && (
            <section>
              <h2 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                Clip generado
              </h2>
              <div className="bg-slate-800 rounded-xl p-4 space-y-2">
                <p className="text-slate-200 text-sm">
                  <strong>{generateResult.name}</strong> - {generateResult.duration.toFixed(1)}s
                </p>
                <p className="text-slate-400 text-sm">
                  Guardado en la biblioteca. Ya podes agendarlo.
                </p>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Progress Tab ───────────────────────────────────────────────── */}
      {activeTab === 'progress' && (
        <div className="flex flex-col gap-4">
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Analisis de progreso
            </h2>
            <div className="bg-slate-800 rounded-xl p-4 space-y-4">
              <p className="text-slate-400 text-sm">
                Gemini analiza los datos de entrenamiento y te da recomendaciones personalizadas.
              </p>

              <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-3">
                <p className="text-amber-300 text-xs">
                  Configura tus API keys en Configuracion para usar la IA.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="progress-days">
                  Periodo a analizar: {progressDays} dias
                </label>
                <input
                  id="progress-days"
                  type="number"
                  value={progressDays}
                  onChange={(e) => setProgressDays(Number(e.target.value))}
                  min={1}
                  max={90}
                  className={inputClass}
                />
              </div>

              <button
                onClick={() => void handleAnalyzeProgress()}
                disabled={loading}
                className={`${btnBase} bg-blue-600 hover:bg-blue-500`}
              >
                {loading ? <><Spinner /> Analizando...</> : 'Analizar Progreso'}
              </button>
            </div>
          </section>

          {progressInsight && (
            <section>
              <h2 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
                Resultados
              </h2>
              <div className="bg-slate-800 rounded-xl p-4 space-y-4">
                <p className="text-slate-200 text-sm">{progressInsight.summary}</p>

                {progressInsight.weekly_score !== null && (
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm">Score semanal:</span>
                    <span className="text-2xl font-bold text-blue-400 tabular-nums">
                      {progressInsight.weekly_score.toFixed(0)}/100
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">Tendencia:</span>
                  <span
                    className={`font-medium text-sm ${
                      progressInsight.progress_trend === 'improving'
                        ? 'text-emerald-400'
                        : progressInsight.progress_trend === 'declining'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                    }`}
                  >
                    {progressInsight.progress_trend === 'improving'
                      ? 'Mejorando'
                      : progressInsight.progress_trend === 'declining'
                      ? 'Declinando'
                      : 'Estable'}
                  </span>
                </div>

                {progressInsight.best_time_of_day && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">Mejor hora:</span>
                    <span className="text-slate-200 text-sm">{progressInsight.best_time_of_day}</span>
                  </div>
                )}

                {progressInsight.most_effective_clips.length > 0 && (
                  <div>
                    <span className="text-slate-400 text-sm block mb-1.5">Clips mas efectivos:</span>
                    <div className="flex flex-wrap gap-2">
                      {progressInsight.most_effective_clips.map((clip) => (
                        <span
                          key={clip}
                          className="bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg text-xs"
                        >
                          {clip}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {progressInsight.recommendations.length > 0 && (
                  <div>
                    <span className="text-slate-400 text-sm block mb-1.5">Recomendaciones:</span>
                    <ul className="space-y-1.5">
                      {progressInsight.recommendations.map((rec, i) => (
                        <li key={i} className="text-slate-200 text-sm flex gap-2">
                          <span className="text-emerald-400 shrink-0">-</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Plan Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'plan' && (
        <div className="flex flex-col gap-4">
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Plan de entrenamiento
            </h2>
            <div className="bg-slate-800 rounded-xl p-4 space-y-4">
              <p className="text-slate-400 text-sm">
                Gemini genera un plan personalizado basado en tus clips y progreso.
              </p>

              <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-3">
                <p className="text-amber-300 text-xs">
                  Configura tus API keys en Configuracion para usar la IA.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="plan-goal">
                  Objetivo del entrenamiento
                </label>
                <input
                  id="plan-goal"
                  type="text"
                  value={planGoal}
                  onChange={(e) => setPlanGoal(e.target.value)}
                  placeholder="Que aprenda a decir hola y silbar"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Dificultad: {planDifficulty}/5
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={planDifficulty}
                  onChange={(e) => setPlanDifficulty(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 px-0.5">
                  <span>Suave</span>
                  <span>Intenso</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Sesiones por dia: {planSessions}
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={planSessions}
                  onChange={(e) => setPlanSessions(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 px-0.5">
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>

              <button
                onClick={() => void handleSuggestPlan()}
                disabled={loading}
                className={`${btnBase} bg-amber-600 hover:bg-amber-500`}
              >
                {loading ? <><Spinner /> Generando plan...</> : 'Generar Plan con Gemini'}
              </button>
            </div>
          </section>

          {generatedPlan && (
            <section>
              <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                Plan generado
              </h2>
              <div className="bg-slate-800 rounded-xl p-4 space-y-3">
                <p className="text-slate-400 text-xs">
                  {new Date(generatedPlan.generated_at).toLocaleString('es')}
                </p>
                <pre className="bg-slate-900 p-3 rounded-xl text-slate-200 text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(generatedPlan.plan_data, null, 2)}
                </pre>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export default AiPage
