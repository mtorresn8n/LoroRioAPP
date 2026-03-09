import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/core/api-client'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'
import type { DailyStats, Recording, RecordingClassification, RecordingUpdate } from '@/types'

const CLASSIFICATIONS: { value: RecordingClassification | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'imitation', label: 'Imitacion' },
  { value: 'spontaneous', label: 'Espontaneo' },
  { value: 'noise', label: 'Ruido' },
  { value: 'unclassified', label: 'Sin clasificar' },
]

const BASE_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:8000'

const RecordingsPage = () => {
  const { showToast } = useToast()
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<RecordingClassification | 'all'>('all')
  const [playingId, setPlayingId] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const loadData = useCallback(async () => {
    try {
      const params: Record<string, string> = {}
      if (filter !== 'all') params['classification'] = filter
      const [recs, statsData] = await Promise.all([
        apiClient.get<Recording[]>('/api/v1/recordings', params),
        apiClient.get<DailyStats>('/api/v1/recordings/stats'),
      ])
      setRecordings(Array.isArray(recs) ? recs : [])
      setStats(statsData)
    } catch {
      setRecordings([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handlePlay = useCallback((rec: Recording) => {
    if (playingId === rec.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(`${BASE_URL}/api/v1/recordings/${rec.id}/file`)
    audioRef.current = audio
    audio.play().catch(() => {})
    setPlayingId(rec.id)
    audio.onended = () => setPlayingId(null)
  }, [playingId])

  const handleClassify = useCallback(async (rec: Recording, classification: RecordingClassification) => {
    try {
      await apiClient.put<Recording>(`/api/v1/recordings/${rec.id}`, {
        classification,
      } satisfies RecordingUpdate)
      setRecordings((prev) =>
        prev.map((r) => r.id === rec.id ? { ...r, classification } : r),
      )
      showToast('Clasificacion guardada', 'success')
    } catch {
      showToast('Error al clasificar', 'error')
    }
  }, [showToast])

  const handleFavorite = useCallback(async (rec: Recording) => {
    try {
      await apiClient.put<Recording>(`/api/v1/recordings/${rec.id}`, {
        is_favorite: !rec.is_favorite,
      } satisfies RecordingUpdate)
      setRecordings((prev) =>
        prev.map((r) => r.id === rec.id ? { ...r, is_favorite: !r.is_favorite } : r),
      )
      showToast(rec.is_favorite ? 'Quitado de favoritos' : 'Marcado como favorito', 'info')
    } catch {
      showToast('Error al actualizar', 'error')
    }
  }, [showToast])

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('es', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="flex flex-col gap-4 p-4 pb-8 max-w-lg mx-auto">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Grabaciones</h1>
        <p className="text-slate-400 text-xs mt-0.5">Sonidos capturados por el modo estacion</p>
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <Tooltip text="Cantidad de grabaciones realizadas hoy" position="bottom">
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-slate-100">{stats.recordings_made}</p>
              <p className="text-xs text-slate-400">Hoy</p>
            </div>
          </Tooltip>
          <Tooltip text="Sonidos detectados por el microfono hoy" position="bottom">
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-slate-100">{stats.sounds_detected}</p>
              <p className="text-xs text-slate-400">Detectados</p>
            </div>
          </Tooltip>
          <Tooltip text="Grabaciones marcadas como favoritas" position="bottom">
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-brand-400">
                {recordings.filter((r) => r.is_favorite).length}
              </p>
              <p className="text-xs text-slate-400">Favoritos</p>
            </div>
          </Tooltip>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {CLASSIFICATIONS.map((c) => (
          <Tooltip key={c.value} text={`Filtrar: ${c.label}`} position="bottom">
            <button
              onClick={() => setFilter(c.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === c.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Recording list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      ) : recordings.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <svg className="w-14 h-14 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <p className="font-medium text-slate-400">No hay grabaciones</p>
          <p className="text-sm mt-1">Inicia el modo estacion para empezar a grabar</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {recordings.map((rec) => (
            <div key={rec.id} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <Tooltip text="Reproduce este sonido por el parlante" position="right">
                  <button
                    onClick={() => handlePlay(rec)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      playingId === rec.id ? 'bg-red-600' : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                    aria-label={playingId === rec.id ? 'Detener reproduccion' : 'Reproducir grabacion'}
                  >
                    {playingId === rec.id ? (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                </Tooltip>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-100 text-sm font-medium">{formatDate(rec.created_at)}</p>
                  <p className="text-slate-400 text-xs">
                    {rec.duration !== null ? `${rec.duration.toFixed(1)}s` : '--'}
                    {rec.volume_peak !== null && (
                      <Tooltip text="Nivel de volumen del sonido ambiente en tiempo real" position="top">
                        <span className="ml-1 cursor-help">
                          {` · pico ${Math.round(rec.volume_peak * 100)}%`}
                        </span>
                      </Tooltip>
                    )}
                  </p>
                </div>
                <Tooltip
                  text={rec.is_favorite ? 'Quitar de favoritos' : 'Guardar como favorito para revisarla despues'}
                  position="left"
                >
                  <button
                    onClick={() => void handleFavorite(rec)}
                    className="w-10 h-10 flex items-center justify-center hover:scale-110 transition-transform"
                    aria-label={rec.is_favorite ? 'Quitar favorito' : 'Marcar favorito'}
                  >
                    <svg
                      className={`w-6 h-6 ${rec.is_favorite ? 'text-yellow-400 fill-yellow-400' : 'text-slate-500 hover:text-yellow-400'}`}
                      fill={rec.is_favorite ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </button>
                </Tooltip>
              </div>

              {/* Classification */}
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Clasificar:</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(['imitation', 'spontaneous', 'noise', 'unclassified'] as RecordingClassification[]).map((cls) => (
                    <Tooltip
                      key={cls}
                      text={
                        cls === 'imitation' ? 'El loro intento imitar un sonido' :
                        cls === 'spontaneous' ? 'El loro hablo por si solo' :
                        cls === 'noise' ? 'Era ruido de fondo' :
                        'No esta clasificada aun'
                      }
                      position="top"
                    >
                      <button
                        onClick={() => void handleClassify(rec, cls)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          rec.classification === cls
                            ? 'bg-brand-500 text-white'
                            : 'bg-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-600'
                        }`}
                      >
                        {cls === 'imitation' ? 'Imitacion' : cls === 'spontaneous' ? 'Espontaneo' : cls === 'noise' ? 'Ruido' : 'Sin clasificar'}
                      </button>
                    </Tooltip>
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

export default RecordingsPage
