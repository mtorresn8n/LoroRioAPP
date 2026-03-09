import { useCallback, useEffect, useState } from 'react';
import { api } from '@/core/api-client';
import { Tooltip } from '@/components/tooltip';
import { useToast } from '@/components/toast';

interface TranscribeResult {
  recording_id: string;
  transcription: string;
  confidence: number;
  similarity_score: number | null;
  target_word: string | null;
}

interface ProgressInsight {
  summary: string;
  best_time_of_day: string | null;
  most_effective_clips: string[];
  recommendations: string[];
  progress_trend: string;
  weekly_score: number | null;
}

interface GenerateSpeechResult {
  clip_id: string;
  name: string;
  duration: number;
}

interface Recording {
  id: string;
  file_path: string;
  classification: string | null;
  duration: number;
  recorded_at: string;
}

interface Clip {
  id: string;
  name: string;
  type: string;
}

interface AiPlan {
  plan_id: string;
  plan_data: Record<string, unknown>;
  generated_at: string;
}

type ActiveTab = 'transcribe' | 'generate' | 'progress' | 'plan';

const AiPage = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>('transcribe');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transcribe state
  const [selectedRecording, setSelectedRecording] = useState('');
  const [selectedTargetClip, setSelectedTargetClip] = useState('');
  const [transcribeResult, setTranscribeResult] = useState<TranscribeResult | null>(null);

  // Generate speech state
  const [speechText, setSpeechText] = useState('');
  const [speechName, setSpeechName] = useState('');
  const [speechCategory, setSpeechCategory] = useState('');
  const [generateResult, setGenerateResult] = useState<GenerateSpeechResult | null>(null);

  // Progress state
  const [progressDays, setProgressDays] = useState(7);
  const [progressInsight, setProgressInsight] = useState<ProgressInsight | null>(null);

  // Plan state
  const [planGoal, setPlanGoal] = useState('');
  const [planDifficulty, setPlanDifficulty] = useState(2);
  const [planSessions, setPlanSessions] = useState(3);
  const [generatedPlan, setGeneratedPlan] = useState<AiPlan | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [recs, cls] = await Promise.all([
          api.get<Recording[]>('/api/v1/recordings/?limit=100'),
          api.get<Clip[]>('/api/v1/clips/?limit=100'),
        ]);
        setRecordings(recs);
        setClips(cls);
      } catch {
        // Non-critical
      }
    };
    fetchData();
  }, []);

  const handleTranscribe = useCallback(async () => {
    if (!selectedRecording) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<TranscribeResult>('/api/v1/ai/transcribe', {
        recording_id: selectedRecording,
        target_clip_id: selectedTargetClip || null,
      });
      setTranscribeResult(result);
      showToast('Transcripcion completada', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al transcribir';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedRecording, selectedTargetClip, showToast]);

  const handleGenerateSpeech = useCallback(async () => {
    if (!speechText || !speechName) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<GenerateSpeechResult>('/api/v1/ai/generate-speech', {
        text: speechText,
        name: speechName,
        category: speechCategory || null,
      });
      setGenerateResult(result);
      showToast('Voz generada y guardada en la biblioteca', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al generar voz';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [speechText, speechName, speechCategory, showToast]);

  const handleAnalyzeProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<ProgressInsight>(
        `/api/v1/ai/analyze-progress?days=${progressDays}`,
        {}
      );
      setProgressInsight(result);
      showToast('Analisis completado', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al analizar progreso';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [progressDays, showToast]);

  const handleSuggestPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<AiPlan>('/api/v1/ai/suggest-plan', {
        goal: planGoal || 'general',
        difficulty: planDifficulty,
        sessions_per_day: planSessions,
      });
      setGeneratedPlan(result);
      showToast('Plan generado correctamente', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al generar plan';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [planGoal, planDifficulty, planSessions, showToast]);

  const tabs: { key: ActiveTab; label: string; tooltip: string }[] = [
    { key: 'transcribe', label: 'Transcribir', tooltip: 'La IA analiza lo que dijo tu loro' },
    { key: 'generate', label: 'Generar Voz', tooltip: 'Genera clips de audio con tu voz clonada' },
    { key: 'progress', label: 'Progreso', tooltip: 'Analisis del progreso de entrenamiento' },
    { key: 'plan', label: 'Plan IA', tooltip: 'Plan personalizado de entrenamiento con Gemini' },
  ];

  const noApiKeyWarning = (
    <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3">
      <p className="text-amber-300 text-xs">
        Configura tus API keys en Configuracion para usar la IA.
      </p>
    </div>
  );

  return (
    <div className="p-4 space-y-4 pb-8 max-w-lg mx-auto">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Inteligencia Artificial</h1>
        <p className="text-slate-400 text-xs mt-0.5">Analisis y herramientas con IA para el entrenamiento</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <Tooltip key={tab.key} text={tab.tooltip} position="bottom">
            <button
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          </Tooltip>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Transcribe Tab */}
      {activeTab === 'transcribe' && (
        <div className="space-y-4">
          <div className="bg-slate-800 p-4 rounded-lg space-y-3">
            <div>
              <h2 className="text-base font-semibold text-slate-200">
                Transcribir grabacion del loro
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Whisper analiza lo que dijo el loro y lo compara con el clip objetivo
              </p>
            </div>

            {noApiKeyWarning}

            <label className="block">
              <span className="text-slate-300 text-sm">Grabacion a analizar</span>
              <Tooltip text="Selecciona la grabacion del loro que queres analizar" position="top">
                <select
                  value={selectedRecording}
                  onChange={(e) => setSelectedRecording(e.target.value)}
                  className="mt-1 block w-full bg-slate-700 text-slate-200 rounded-lg p-3 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Seleccionar grabacion...</option>
                  {recordings.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.recorded_at).toLocaleString('es')} - {r.duration.toFixed(1)}s
                      {r.classification ? ` (${r.classification})` : ''}
                    </option>
                  ))}
                </select>
              </Tooltip>
            </label>

            <label className="block">
              <span className="text-slate-300 text-sm">Clip objetivo para comparar (opcional)</span>
              <Tooltip text="Si seleccionas un clip, la IA compara que tan parecido es lo que dijo el loro" position="top">
                <select
                  value={selectedTargetClip}
                  onChange={(e) => setSelectedTargetClip(e.target.value)}
                  className="mt-1 block w-full bg-slate-700 text-slate-200 rounded-lg p-3 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Sin comparacion</option>
                  {clips.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </Tooltip>
            </label>

            <Tooltip text="La IA analiza lo que dijo tu loro usando Whisper de OpenAI" position="top">
              <button
                onClick={() => void handleTranscribe()}
                disabled={loading || !selectedRecording}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[48px]"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analizando...
                  </>
                ) : 'Transcribir con Whisper'}
              </button>
            </Tooltip>
          </div>

          {transcribeResult && (
            <div className="bg-slate-800 p-4 rounded-lg space-y-3">
              <h3 className="text-base font-semibold text-emerald-400">Resultado</h3>

              <div className="space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400 text-sm">Transcripcion:</span>
                  <span className="text-slate-200 font-medium text-sm text-right">
                    &ldquo;{transcribeResult.transcription}&rdquo;
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">Confianza:</span>
                  <span className="text-slate-200 text-sm">
                    {(transcribeResult.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {transcribeResult.similarity_score !== null && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400 text-sm">Palabra objetivo:</span>
                      <span className="text-slate-200 text-sm">&ldquo;{transcribeResult.target_word}&rdquo;</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <Tooltip text="Que tan parecido es el sonido del loro al original" position="top">
                        <span className="text-slate-400 text-sm cursor-help">Similitud:</span>
                      </Tooltip>
                      <span
                        className={`font-bold text-lg ${
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
                    <div className="w-full bg-slate-700 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
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
            </div>
          )}
        </div>
      )}

      {/* Generate Speech Tab */}
      {activeTab === 'generate' && (
        <div className="space-y-4">
          <div className="bg-slate-800 p-4 rounded-lg space-y-3">
            <div>
              <h2 className="text-base font-semibold text-slate-200">
                Generar voz con ElevenLabs
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Escribe una frase y se genera con tu voz clonada. Se guarda como clip
              </p>
            </div>

            {noApiKeyWarning}

            <label className="block">
              <span className="text-slate-300 text-sm">Texto a generar</span>
              <Tooltip text="Escribe exactamente lo que queres que el loro aprenda a decir" position="top">
                <input
                  type="text"
                  value={speechText}
                  onChange={(e) => setSpeechText(e.target.value)}
                  placeholder="Hola Rio, buen loro"
                  className="mt-1 block w-full bg-slate-700 text-slate-200 rounded-lg p-3 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </Tooltip>
            </label>

            <label className="block">
              <span className="text-slate-300 text-sm">Nombre del clip</span>
              <Tooltip text="Como se va a llamar este clip en la biblioteca" position="top">
                <input
                  type="text"
                  value={speechName}
                  onChange={(e) => setSpeechName(e.target.value)}
                  placeholder="Saludo matutino"
                  className="mt-1 block w-full bg-slate-700 text-slate-200 rounded-lg p-3 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </Tooltip>
            </label>

            <label className="block">
              <span className="text-slate-300 text-sm">Categoria</span>
              <select
                value={speechCategory}
                onChange={(e) => setSpeechCategory(e.target.value)}
                className="mt-1 block w-full bg-slate-700 text-slate-200 rounded-lg p-3 border border-slate-600 text-sm"
              >
                <option value="">Sin categoria</option>
                <option value="greeting">Saludo</option>
                <option value="training">Entrenamiento</option>
                <option value="reward">Recompensa</option>
                <option value="phrase">Frase</option>
                <option value="command">Comando</option>
              </select>
            </label>

            <Tooltip text="ElevenLabs genera el audio con tu voz clonada y lo guarda en la biblioteca" position="top">
              <button
                onClick={() => void handleGenerateSpeech()}
                disabled={loading || !speechText || !speechName}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[48px]"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generando...
                  </>
                ) : 'Generar con tu Voz'}
              </button>
            </Tooltip>
          </div>

          {generateResult && (
            <div className="bg-slate-800 p-4 rounded-lg space-y-2">
              <h3 className="text-base font-semibold text-purple-400">Clip Generado</h3>
              <p className="text-slate-200 text-sm">
                <strong>{generateResult.name}</strong> - {generateResult.duration.toFixed(1)}s
              </p>
              <p className="text-slate-400 text-sm">
                Guardado en la biblioteca. Ya podes agendarlo.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Progress Tab */}
      {activeTab === 'progress' && (
        <div className="space-y-4">
          <div className="bg-slate-800 p-4 rounded-lg space-y-3">
            <div>
              <h2 className="text-base font-semibold text-slate-200">
                Analisis de progreso con Gemini
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Gemini analiza los datos de entrenamiento y te da recomendaciones personalizadas
              </p>
            </div>

            {noApiKeyWarning}

            <label className="block">
              <span className="text-slate-300 text-sm">Periodo a analizar: {progressDays} dias</span>
              <Tooltip text="Cuantos dias hacia atras analiza el progreso" position="top">
                <input
                  type="number"
                  value={progressDays}
                  onChange={(e) => setProgressDays(Number(e.target.value))}
                  min={1}
                  max={90}
                  className="mt-1 block w-full bg-slate-700 text-slate-200 rounded-lg p-3 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </Tooltip>
            </label>

            <Tooltip text="Gemini analiza el historial de entrenamiento y recomienda mejoras" position="top">
              <button
                onClick={() => void handleAnalyzeProgress()}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[48px]"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analizando...
                  </>
                ) : 'Analizar Progreso'}
              </button>
            </Tooltip>
          </div>

          {progressInsight && (
            <div className="bg-slate-800 p-4 rounded-lg space-y-4">
              <h3 className="text-base font-semibold text-blue-400">Resultados</h3>

              <p className="text-slate-200 text-sm">{progressInsight.summary}</p>

              {progressInsight.weekly_score !== null && (
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-sm">Score semanal:</span>
                  <span className="text-2xl font-bold text-blue-400">
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
                <div>
                  <span className="text-slate-400 text-sm">Mejor hora del dia: </span>
                  <span className="text-slate-200 text-sm">{progressInsight.best_time_of_day}</span>
                </div>
              )}

              {progressInsight.most_effective_clips.length > 0 && (
                <div>
                  <span className="text-slate-400 text-sm block mb-1">Clips mas efectivos:</span>
                  <div className="flex flex-wrap gap-2">
                    {progressInsight.most_effective_clips.map((clip) => (
                      <span
                        key={clip}
                        className="bg-slate-700 text-slate-200 px-2 py-1 rounded text-xs"
                      >
                        {clip}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {progressInsight.recommendations.length > 0 && (
                <div>
                  <span className="text-slate-400 text-sm block mb-1">Recomendaciones:</span>
                  <ul className="space-y-1">
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
          )}
        </div>
      )}

      {/* Plan Tab */}
      {activeTab === 'plan' && (
        <div className="space-y-4">
          <div className="bg-slate-800 p-4 rounded-lg space-y-3">
            <div>
              <h2 className="text-base font-semibold text-slate-200">
                Plan de entrenamiento con IA
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Gemini genera un plan personalizado basado en tus clips y progreso
              </p>
            </div>

            {noApiKeyWarning}

            <label className="block">
              <span className="text-slate-300 text-sm">Objetivo del entrenamiento</span>
              <Tooltip text="Que queres que aprenda tu loro. Sé especifico para mejores resultados" position="top">
                <input
                  type="text"
                  value={planGoal}
                  onChange={(e) => setPlanGoal(e.target.value)}
                  placeholder="Que aprenda a decir hola y silbar"
                  className="mt-1 block w-full bg-slate-700 text-slate-200 rounded-lg p-3 border border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </Tooltip>
            </label>

            <label className="block">
              <Tooltip text="Que tan intensivo es el entrenamiento. 1 es muy suave, 5 es muy intenso" position="top">
                <span className="text-slate-300 text-sm cursor-help">
                  Dificultad: {planDifficulty}/5
                </span>
              </Tooltip>
              <input
                type="range"
                min={1}
                max={5}
                value={planDifficulty}
                onChange={(e) => setPlanDifficulty(Number(e.target.value))}
                className="mt-1 block w-full accent-amber-500"
              />
            </label>

            <label className="block">
              <Tooltip text="Cuantas veces por dia se va a entrenar al loro" position="top">
                <span className="text-slate-300 text-sm cursor-help">
                  Sesiones por dia: {planSessions}
                </span>
              </Tooltip>
              <input
                type="range"
                min={1}
                max={10}
                value={planSessions}
                onChange={(e) => setPlanSessions(Number(e.target.value))}
                className="mt-1 block w-full accent-amber-500"
              />
            </label>

            <Tooltip text="Gemini genera un plan personalizado segun la edad y dieta de tu loro" position="top">
              <button
                onClick={() => void handleSuggestPlan()}
                disabled={loading}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-600 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[48px]"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generando plan...
                  </>
                ) : 'Generar Plan con Gemini'}
              </button>
            </Tooltip>
          </div>

          {generatedPlan && (
            <div className="bg-slate-800 p-4 rounded-lg space-y-3">
              <h3 className="text-base font-semibold text-amber-400">Plan Generado</h3>
              <p className="text-slate-400 text-xs">
                {new Date(generatedPlan.generated_at).toLocaleString('es')}
              </p>

              <pre className="bg-slate-900 p-3 rounded-lg text-slate-200 text-xs overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(generatedPlan.plan_data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AiPage;
