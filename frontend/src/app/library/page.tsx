import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, getApiBaseUrl } from '@/core/api-client'
import { ClipCard } from '@/components/clip-card'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'
import type { Clip, ClipUpdate } from '@/types'

const CLIP_TYPES: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'word', label: 'Palabras' },
  { value: 'phrase', label: 'Frases' },
  { value: 'sound', label: 'Sonidos' },
  { value: 'music', label: 'Musica' },
  { value: 'reward', label: 'Recompensas' },
]


const LibraryPage = () => {
  const { showToast } = useToast()
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const loadClips = useCallback(async () => {
    try {
      const params: Record<string, string> = {}
      if (search) params['q'] = search
      if (typeFilter !== 'all') params['type'] = typeFilter
      const data = await apiClient.get<Clip[]>('/api/v1/clips/', params)
      setClips(Array.isArray(data) ? data : [])
    } catch {
      setClips([])
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter])

  useEffect(() => {
    void loadClips()
  }, [loadClips])

  const handlePlay = useCallback((clip: Clip) => {
    if (playingId === clip.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
    }
    const audio = new Audio(`${getApiBaseUrl()}/api/v1/clips/${clip.id}/file`)
    audioRef.current = audio
    audio.play().catch(() => {})
    setPlayingId(clip.id)
    audio.onended = () => setPlayingId(null)
  }, [playingId])

  const handleEdit = useCallback(async (clip: Clip, data: ClipUpdate): Promise<void> => {
    const updated = await apiClient.put<Clip>(`/api/v1/clips/${clip.id}`, data)
    setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    showToast('Clip actualizado', 'success')
  }, [showToast])

  const handleDelete = useCallback(async (clip: Clip) => {
    if (!confirm(`Eliminar "${clip.name}"?`)) return
    try {
      await apiClient.del(`/api/v1/clips/${clip.id}`)
      setClips((prev) => prev.filter((c) => c.id !== clip.id))
      showToast('Clip eliminado', 'success')
    } catch {
      showToast('Error al eliminar el clip', 'error')
    }
  }, [showToast])

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const name = file.name.replace(/\.[^.]+$/, '')
      await apiClient.upload<Clip>('/api/v1/clips/', file, {
        name,
        type: 'sound',
        category: 'general',
        tags: '',
      })
      await loadClips()
      showToast('Clip subido correctamente', 'success')
    } catch {
      showToast('Error al subir el archivo', 'error')
    }
    e.target.value = ''
  }, [loadClips, showToast])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Biblioteca</h1>
            <p className="text-slate-400 text-xs mt-0.5">Clips de audio para entrenar a tu loro</p>
          </div>
          <div className="flex gap-2">
            <Tooltip text="Importa audio desde un video de YouTube" position="left">
              <Link
                to="/youtube"
                className="h-10 px-3 bg-red-600 rounded-xl flex items-center gap-1.5 text-sm font-medium text-white hover:bg-red-500 transition-colors active:scale-[0.98]"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-2.75 12.65 12.65 0 00-8.45 0A4.83 4.83 0 013.6 6.69 46.09 46.09 0 003 12a46.09 46.09 0 00.6 5.31 4.83 4.83 0 003.77 2.75 12.65 12.65 0 008.45 0 4.83 4.83 0 003.77-2.75A46.09 46.09 0 0021 12a46.09 46.09 0 00-.41-5.31zM9.75 15V9l5.25 3-5.25 3z" />
                </svg>
                YouTube
              </Link>
            </Tooltip>
            <Tooltip text="Subi un archivo de audio desde tu celular" position="left">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-10 w-10 bg-brand-500 rounded-xl flex items-center justify-center hover:bg-brand-600 transition-colors active:scale-[0.98]"
                aria-label="Subir clip de audio"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar clips..."
            className="w-full bg-slate-800 text-slate-100 pl-9 pr-4 py-2.5 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Buscar clips"
          />
        </div>

        {/* Type filter */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
          {CLIP_TYPES.map((t) => (
            <Tooltip key={t.value} text={`Ver solo clips de tipo: ${t.label}`} position="bottom">
              <button
                onClick={() => setTypeFilter(t.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  typeFilter === t.value
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Clip list */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-800 rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        ) : clips.length === 0 ? (
          <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-8 text-center">
            <svg className="w-14 h-14 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <p className="text-sm text-slate-500 font-medium">Todavia no tenes clips</p>
            <p className="text-xs text-slate-600 mt-1">Subi uno o importa desde YouTube</p>
            <div className="flex gap-2 justify-center mt-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-brand-500 text-white text-sm rounded-xl hover:bg-brand-600 transition-colors active:scale-[0.98]"
              >
                Subir archivo
              </button>
              <Link
                to="/youtube"
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-xl hover:bg-red-700 transition-colors active:scale-[0.98]"
              >
                Desde YouTube
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                onPlay={handlePlay}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isPlaying={playingId === clip.id}
              />
            ))}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  )
}

export default LibraryPage
