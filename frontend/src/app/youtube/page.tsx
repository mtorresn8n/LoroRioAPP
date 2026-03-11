import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient, getApiBaseUrl } from '@/core/api-client'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'
import type { Clip, YoutubeExtractRequest, YoutubeInfo } from '@/types'

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Extracted clip type ──────────────────────────────────────────────────────

interface ExtractedClip {
  id: string
  name: string
  duration: number | null
  startTime: number
  endTime: number
}

// ── Time picker component ────────────────────────────────────────────────────

interface TimePickerProps {
  label: string
  totalSeconds: number
  maxSeconds: number
  onChange: (seconds: number) => void
  id: string
}

const TimePicker = ({ label, totalSeconds, maxSeconds, onChange, id }: TimePickerProps) => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const secRef = useRef<HTMLInputElement>(null)

  const clamp = (val: number) => Math.max(0, Math.min(val, maxSeconds))

  const setMinutes = (m: number) => {
    const newVal = clamp(m * 60 + seconds)
    onChange(newVal)
  }

  const setSeconds = (s: number) => {
    if (s > 59) {
      onChange(clamp((minutes + 1) * 60 + (s - 60)))
      return
    }
    if (s < 0) {
      if (minutes > 0) {
        onChange(clamp((minutes - 1) * 60 + (60 + s)))
        return
      }
      return
    }
    onChange(clamp(minutes * 60 + s))
  }

  const handleMinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); setMinutes(minutes + 1) }
    if (e.key === 'ArrowDown') { e.preventDefault(); setMinutes(minutes - 1) }
    if (e.key === ':' || e.key === 'ArrowRight') { e.preventDefault(); secRef.current?.focus(); secRef.current?.select() }
  }

  const handleSecKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); setSeconds(seconds + 1) }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSeconds(seconds - 1) }
  }

  const fieldClass = 'w-12 bg-transparent text-slate-100 text-center text-xl font-mono py-1 focus:outline-none select-all'
  const btnClass = 'p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600 active:scale-90 transition-all select-none'
  const chevronUp = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
  const chevronDown = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>

  return (
    <div>
      <label className="text-sm font-medium text-slate-300 block mb-2" htmlFor={`${id}-min`}>
        {label}
      </label>
      <div className="bg-slate-800 rounded-xl p-3">
        <div className="flex items-center justify-center gap-0">
          {/* Minutes */}
          <div className="flex flex-col items-center">
            <button type="button" className={btnClass} onClick={() => setMinutes(minutes + 1)} aria-label="Subir minutos">{chevronUp}</button>
            <input
              id={`${id}-min`}
              type="text"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(parseInt(e.target.value, 10) || 0)}
              onKeyDown={handleMinKeyDown}
              onFocus={(e) => e.target.select()}
              className={fieldClass}
              aria-label="Minutos"
            />
            <button type="button" className={btnClass} onClick={() => setMinutes(minutes - 1)} aria-label="Bajar minutos">{chevronDown}</button>
          </div>

          <span className="text-xl font-bold text-slate-500 pb-0.5">:</span>

          {/* Seconds */}
          <div className="flex flex-col items-center">
            <button type="button" className={btnClass} onClick={() => setSeconds(seconds + 1)} aria-label="Subir segundos">{chevronUp}</button>
            <input
              ref={secRef}
              id={`${id}-sec`}
              type="text"
              inputMode="numeric"
              value={seconds.toString().padStart(2, '0')}
              onChange={(e) => setSeconds(parseInt(e.target.value, 10) || 0)}
              onKeyDown={handleSecKeyDown}
              onFocus={(e) => e.target.select()}
              className={fieldClass}
              aria-label="Segundos"
            />
            <button type="button" className={btnClass} onClick={() => setSeconds(seconds - 1)} aria-label="Bajar segundos">{chevronDown}</button>
          </div>
        </div>
        <div className="flex justify-center gap-8 -mt-1">
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">min</span>
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">seg</span>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

const YoutubePage = () => {
  const { showToast } = useToast()
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<YoutubeInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [startSeconds, setStartSeconds] = useState(0)
  const [endSeconds, setEndSeconds] = useState(0)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('general')
  const [clipType, setClipType] = useState<string>('sound')

  // Extracted clips from the current video (session)
  const [extractedClips, setExtractedClips] = useState<ExtractedClip[]>([])

  // History: all YouTube clips from the database
  const [history, setHistory] = useState<Clip[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const fetchHistory = useCallback(async () => {
    try {
      const clips = await apiClient.get<Clip[]>('/api/v1/clips?source=youtube&limit=20')
      setHistory(clips)
    } catch {
      // Silently fail — history is not critical
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    void fetchHistory()
  }, [fetchHistory])

  const handleGetInfo = useCallback(async () => {
    if (!url.trim()) return
    setLoadingInfo(true)
    setError(null)
    setInfo(null)
    setExtractedClips([])
    try {
      const data = await apiClient.post<YoutubeInfo>('/api/v1/youtube/info', { url })
      setInfo(data)
      setName(data.title.slice(0, 60))
      setEndSeconds(Math.min(Math.floor(data.duration), 60))
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
        start_time: startSeconds,
        end_time: endSeconds,
        name: name.trim(),
        category: category.trim() || 'general',
        tags: [],
        difficulty: 1,
        default_volume: 1.0,
      }
      const clip = await apiClient.post<{ id: string; name: string; duration: number | null }>('/api/v1/youtube/extract', payload)
      showToast('Clip guardado en la biblioteca', 'success')

      // Add to extracted list — stay on the same screen
      setExtractedClips((prev) => [
        {
          id: clip.id,
          name: clip.name,
          duration: clip.duration,
          startTime: startSeconds,
          endTime: endSeconds,
        },
        ...prev,
      ])

      // Reset form for next extraction from same video
      setName(info.title.slice(0, 60))

      // Refresh history
      void fetchHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al extraer audio'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setExtracting(false)
    }
  }, [info, url, name, category, clipType, startSeconds, endSeconds, showToast, fetchHistory])

  const handleDeleteClip = useCallback(async (clipId: string) => {
    try {
      await apiClient.del(`/api/v1/clips/${clipId}`)
      setHistory((prev) => prev.filter((c) => c.id !== clipId))
      setExtractedClips((prev) => prev.filter((c) => c.id !== clipId))
      showToast('Clip eliminado', 'success')
    } catch {
      showToast('Error al eliminar el clip', 'error')
    }
  }, [showToast])

  const handleNewVideo = useCallback(() => {
    setUrl('')
    setInfo(null)
    setExtractedClips([])
    setName('')
    setStartSeconds(0)
    setEndSeconds(0)
    setError(null)
  }, [])

  const inputClass = 'w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Importar de YouTube</h1>
        <p className="text-slate-400 text-sm mt-0.5">Extrae fragmentos de audio de cualquier video</p>
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
              disabled={!!info}
              className={`flex-1 bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 ${info ? 'cursor-not-allowed' : ''}`}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleGetInfo() }}
            />
          </Tooltip>
          {!info ? (
            <button
              onClick={() => void handleGetInfo()}
              disabled={!url.trim() || loadingInfo}
              className="px-4 py-3 bg-brand-500 rounded-xl text-white font-medium text-sm disabled:opacity-50 hover:bg-brand-600 active:scale-[0.98] transition-colors min-w-[80px]"
            >
              {loadingInfo ? '...' : 'Buscar'}
            </button>
          ) : (
            <button
              onClick={handleNewVideo}
              className="px-4 py-3 bg-slate-700 rounded-xl text-slate-200 font-medium text-sm hover:bg-slate-600 active:scale-[0.98] transition-colors min-w-[80px]"
            >
              Cambiar
            </button>
          )}
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
              className="w-20 h-14 object-cover rounded-xl flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-100 text-sm line-clamp-2">{info.title}</p>
            <p className="text-xs text-slate-400 mt-1">{info.uploader}</p>
            <p className="text-xs text-brand-400 mt-1">Duracion total: {formatTime(info.duration)}</p>
          </div>
        </div>
      )}

      {/* Extracted clips from this video */}
      {extractedClips.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Clips extraidos ({extractedClips.length})
          </p>
          {extractedClips.map((clip) => (
            <div key={clip.id} className="bg-slate-800 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 bg-brand-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{clip.name}</p>
                    <p className="text-xs text-slate-400">
                      {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
                      {clip.duration != null && ` · ${clip.duration.toFixed(1)}s`}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-medium text-brand-400 bg-brand-600/20 px-2 py-0.5 rounded-full flex-shrink-0">
                  Guardado
                </span>
              </div>
              {/* Audio player */}
              <audio
                controls
                preload="none"
                className="w-full h-10 rounded-lg [&::-webkit-media-controls-panel]:bg-slate-700"
                src={`${getApiBaseUrl()}/api/v1/clips/${clip.id}/file`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Extract form */}
      {info && (
        <>
          {/* Section heading */}
          {extractedClips.length > 0 && (
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Extraer otro fragmento
            </p>
          )}

          {/* Time range pickers */}
          <div className="grid grid-cols-2 gap-3">
            <TimePicker
              label="Inicio"
              id="start-time"
              totalSeconds={startSeconds}
              maxSeconds={Math.floor(info.duration)}
              onChange={setStartSeconds}
            />
            <TimePicker
              label="Fin"
              id="end-time"
              totalSeconds={endSeconds}
              maxSeconds={Math.floor(info.duration)}
              onChange={setEndSeconds}
            />
          </div>

          {/* Duration preview */}
          <div className="bg-slate-800 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-slate-300">
                Duracion del clip:{' '}
                <strong className="text-brand-400">
                  {formatTime(Math.max(0, endSeconds - startSeconds))}
                </strong>
              </span>
            </div>
            <span className="text-xs text-slate-500">
              {formatTime(startSeconds)} → {formatTime(endSeconds)}
            </span>
          </div>

          {/* Name */}
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1" htmlFor="clip-name">
              Nombre del clip
            </label>
            <input
              id="clip-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Hola lorito, silbido mañanero..."
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1" htmlFor="clip-type">
                Tipo
              </label>
              <select
                id="clip-type"
                value={clipType}
                onChange={(e) => setClipType(e.target.value)}
                className={inputClass}
              >
                <option value="word">Palabra</option>
                <option value="phrase">Frase</option>
                <option value="whistle">Silbido</option>
                <option value="sound">Sonido</option>
                <option value="music">Musica</option>
                <option value="reward">Recompensa</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1" htmlFor="clip-category">
                Categoria
              </label>
              <select
                id="clip-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
              >
                <option value="general">General</option>
                <option value="saludo">Saludos</option>
                <option value="comando">Comandos</option>
                <option value="cancion">Canciones</option>
                <option value="silbido">Silbidos</option>
                <option value="himno">Himnos</option>
                <option value="refuerzo">Refuerzo positivo</option>
                <option value="ambiente">Sonidos ambiente</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => void handleExtract()}
            disabled={!name.trim() || extracting || endSeconds <= startSeconds}
            className="w-full py-3 bg-red-600 rounded-xl text-white font-semibold text-sm disabled:opacity-50 hover:bg-red-700 active:scale-[0.98] transition-colors min-h-[48px]"
          >
            {extracting ? 'Extrayendo...' : 'Extraer y guardar'}
          </button>

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
        <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-6 text-center">
          <svg className="w-14 h-14 mx-auto mb-4 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21.593 7.203a2.506 2.506 0 00-1.762-1.766C18.265 5.007 12 5 12 5s-6.264-.007-7.831.44a2.506 2.506 0 00-1.762 1.767C2.005 8.769 2 12.001 2 12.001s.005 3.232.407 4.797a2.506 2.506 0 001.762 1.767C5.736 19.002 12 19 12 19s6.265.002 7.831-.44a2.506 2.506 0 001.762-1.767C21.995 15.233 22 12.001 22 12.001s-.005-3.232-.407-4.798zM10 15.001V9l5.196 3.001L10 15.001z" />
          </svg>
          <p className="text-sm text-slate-500 font-medium">Pega el link de un video de YouTube</p>
          <p className="text-xs text-slate-600 mt-1">Podras extraer cualquier fragmento de audio</p>
        </div>
      )}

      {/* History: YouTube clips from database */}
      {history.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Clips importados de YouTube ({history.length})
          </p>
          {history.map((clip) => (
            <div key={clip.id} className="bg-slate-800 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 bg-red-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21.593 7.203a2.506 2.506 0 00-1.762-1.766C18.265 5.007 12 5 12 5s-6.264-.007-7.831.44a2.506 2.506 0 00-1.762 1.767C2.005 8.769 2 12.001 2 12.001s.005 3.232.407 4.797a2.506 2.506 0 001.762 1.767C5.736 19.002 12 19 12 19s6.265.002 7.831-.44a2.506 2.506 0 001.762-1.767C21.995 15.233 22 12.001 22 12.001s-.005-3.232-.407-4.798zM10 15.001V9l5.196 3.001L10 15.001z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-100 truncate">{clip.name}</p>
                  <p className="text-xs text-slate-400">
                    {clip.type} · {clip.category ?? 'general'}
                    {clip.duration != null && ` · ${clip.duration.toFixed(1)}s`}
                  </p>
                </div>
                <button
                  onClick={() => void handleDeleteClip(clip.id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                  aria-label="Eliminar clip"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <audio
                controls
                preload="none"
                className="w-full h-10 rounded-lg [&::-webkit-media-controls-panel]:bg-slate-700"
                src={`${getApiBaseUrl()}/api/v1/clips/${clip.id}/file`}
              />
            </div>
          ))}
        </div>
      )}

      {loadingHistory && !info && (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

export default YoutubePage
