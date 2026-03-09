import { useCallback, useState } from 'react'
import { apiClient } from '@/core/api-client'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'
import type { ClipType, YoutubeExtractRequest, YoutubeInfo } from '@/types'

const parseTime = (value: string): number => {
  const parts = value.split(':').map(Number)
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
  return parts[0] ?? 0
}

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const YoutubePage = () => {
  const { showToast } = useToast()
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<YoutubeInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [startTime, setStartTime] = useState('0:00')
  const [endTime, setEndTime] = useState('0:00')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('general')
  const [tags, setTags] = useState('')
  const [clipType, setClipType] = useState<ClipType>('word')

  const handleGetInfo = useCallback(async () => {
    if (!url.trim()) return
    setLoadingInfo(true)
    setError(null)
    setInfo(null)
    try {
      const data = await apiClient.post<YoutubeInfo>('/api/youtube/info', { url })
      setInfo(data)
      setName(data.title.slice(0, 60))
      setEndTime(formatTime(Math.min(data.duration, 60)))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al obtener informacion del video'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoadingInfo(false)
    }
  }, [url, showToast])

  const handleExtract = useCallback(async () => {
    if (!info || !name.trim()) return
    setExtracting(true)
    setError(null)
    try {
      const payload: YoutubeExtractRequest = {
        url,
        start_time: parseTime(startTime),
        end_time: parseTime(endTime),
        name: name.trim(),
        category: category.trim() || 'general',
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        clip_type: clipType,
      }
      await apiClient.post('/api/youtube/extract', payload)
      showToast('Clip guardado en la biblioteca', 'success')
      setUrl('')
      setInfo(null)
      setName('')
      setTags('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al extraer audio'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setExtracting(false)
    }
  }, [info, url, name, category, tags, clipType, startTime, endTime, showToast])

  return (
    <div className="flex flex-col gap-4 p-4 pb-8 max-w-lg mx-auto">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Importar de YouTube</h1>
        <p className="text-slate-400 text-sm mt-0.5">Extrae un fragmento de audio de cualquier video</p>
      </div>

      {/* URL input */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-300" htmlFor="yt-url">
          URL del video
        </label>
        <div className="flex gap-2">
          <Tooltip text="Pega aqui el link del video de YouTube que queres usar" position="top">
            <input
              id="yt-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1 bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleGetInfo() }}
            />
          </Tooltip>
          <Tooltip text="Obtener informacion del video para poder extraer el audio" position="left">
            <button
              onClick={() => void handleGetInfo()}
              disabled={!url.trim() || loadingInfo}
              className="px-4 py-3 bg-brand-500 rounded-xl text-white font-medium text-sm disabled:opacity-50 hover:bg-brand-600 transition-colors min-w-[80px]"
            >
              {loadingInfo ? '...' : 'Buscar'}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Loading indicator */}
      {loadingInfo && (
        <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span className="text-sm text-slate-300">Obteniendo informacion del video...</span>
        </div>
      )}

      {/* Video info */}
      {info && (
        <div className="bg-slate-800 rounded-xl p-4 flex gap-3">
          {info.thumbnail && (
            <img
              src={info.thumbnail}
              alt={info.title}
              className="w-20 h-14 object-cover rounded-lg flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-100 text-sm line-clamp-2">{info.title}</p>
            <p className="text-xs text-slate-400 mt-1">{info.channel}</p>
            <p className="text-xs text-brand-400 mt-1">Duracion total: {formatTime(info.duration)}</p>
          </div>
        </div>
      )}

      {/* Extract form */}
      {info && (
        <>
          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1" htmlFor="start-time">
                Inicio (mm:ss)
              </label>
              <Tooltip text="Desde donde queres que empiece el clip (minuto:segundo)" position="top">
                <input
                  id="start-time"
                  type="text"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="0:00"
                  className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Tooltip>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1" htmlFor="end-time">
                Fin (mm:ss)
              </label>
              <Tooltip text="Donde termina el clip. Maximo recomendado: 30 segundos" position="top">
                <input
                  id="end-time"
                  type="text"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  placeholder="0:30"
                  className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Tooltip>
            </div>
          </div>

          {/* Duration preview */}
          <div className="bg-slate-800 rounded-xl p-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-slate-300">
              Duracion del clip:{' '}
              <strong className="text-brand-400">
                {Math.max(0, parseTime(endTime) - parseTime(startTime))}s
              </strong>
            </span>
          </div>

          {/* Name */}
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1" htmlFor="clip-name">
              Nombre del clip
            </label>
            <Tooltip text="Como se va a llamar este clip en la biblioteca" position="top">
              <input
                id="clip-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del clip"
                className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </Tooltip>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1" htmlFor="clip-category">
                Categoria
              </label>
              <Tooltip text="Categoria para organizar los clips en la biblioteca" position="top">
                <input
                  id="clip-category"
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="general"
                  className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </Tooltip>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1" htmlFor="clip-type">
                Tipo de clip
              </label>
              <select
                id="clip-type"
                value={clipType}
                onChange={(e) => setClipType(e.target.value as ClipType)}
                className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="word">Palabra</option>
                <option value="phrase">Frase</option>
                <option value="sound">Sonido</option>
                <option value="music">Musica</option>
                <option value="reward">Recompensa</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1" htmlFor="clip-tags">
              Tags (separados por coma)
            </label>
            <Tooltip text="Etiquetas para encontrar el clip mas facil (ej: saludo, manana)" position="top">
              <input
                id="clip-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="saludo, manana, loro"
                className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </Tooltip>
          </div>

          <Tooltip text="Descarga el audio del video y lo guarda como clip en la biblioteca" position="top">
            <button
              onClick={() => void handleExtract()}
              disabled={!name.trim() || extracting}
              className="w-full py-3 bg-red-600 rounded-xl text-white font-semibold text-sm disabled:opacity-50 hover:bg-red-700 transition-colors min-h-[48px]"
            >
              {extracting ? 'Extrayendo...' : 'Extraer y guardar'}
            </button>
          </Tooltip>

          {extracting && (
            <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="text-sm text-slate-300">Descargando y procesando audio...</span>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Empty state when no URL yet */}
      {!info && !loadingInfo && !url && (
        <div className="text-center py-12 text-slate-500">
          <svg className="w-14 h-14 mx-auto mb-4 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21.593 7.203a2.506 2.506 0 00-1.762-1.766C18.265 5.007 12 5 12 5s-6.264-.007-7.831.44a2.506 2.506 0 00-1.762 1.767C2.005 8.769 2 12.001 2 12.001s.005 3.232.407 4.797a2.506 2.506 0 001.762 1.767C5.736 19.002 12 19 12 19s6.265.002 7.831-.44a2.506 2.506 0 001.762-1.767C21.995 15.233 22 12.001 22 12.001s-.005-3.232-.407-4.798zM10 15.001V9l5.196 3.001L10 15.001z" />
          </svg>
          <p className="font-medium text-slate-400">Pega el link de un video de YouTube</p>
          <p className="text-sm mt-1">Podras extraer cualquier fragmento de audio</p>
        </div>
      )}
    </div>
  )
}

export default YoutubePage
