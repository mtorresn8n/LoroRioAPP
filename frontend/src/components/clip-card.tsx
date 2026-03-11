import { useState } from 'react'
import { getApiBaseUrl } from '@/core/api-client'
import type { Clip, ClipUpdate } from '@/types'

const TYPE_COLORS: Record<string, string> = {
  word: 'bg-blue-500/20 text-blue-300',
  phrase: 'bg-purple-500/20 text-purple-300',
  sound: 'bg-yellow-500/20 text-yellow-300',
  music: 'bg-pink-500/20 text-pink-300',
  whistle: 'bg-teal-500/20 text-teal-300',
  reward: 'bg-brand-500/20 text-brand-300',
}

const CLIP_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'word', label: 'Palabra' },
  { value: 'phrase', label: 'Frase' },
  { value: 'sound', label: 'Sonido' },
  { value: 'music', label: 'Musica' },
  { value: 'whistle', label: 'Silbido' },
  { value: 'reward', label: 'Recompensa' },
]

interface ClipCardProps {
  clip: Clip
  onPlay: (clip: Clip) => void
  /** Called when the user saves edits. Return a promise so the card can show saving state. */
  onEdit?: (clip: Clip, data: ClipUpdate) => Promise<void>
  onDownload?: (clip: Clip) => void
  onDelete?: (clip: Clip) => void
  isPlaying?: boolean
}

export const ClipCard = ({ clip, onPlay, onEdit, onDownload, onDelete, isPlaying = false }: ClipCardProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Form field state - initialised from clip on each edit open
  const [name, setName] = useState(clip.name)
  const [type, setType] = useState(clip.type)
  const [category, setCategory] = useState(clip.category ?? '')
  const [tagsRaw, setTagsRaw] = useState((clip.tags ?? []).join(', '))

  const handleDownload = () => {
    if (onDownload) {
      onDownload(clip)
      return
    }
    const ext = clip.file_path?.split('.').pop() ?? 'wav'
    const link = document.createElement('a')
    link.href = `${getApiBaseUrl()}/api/v1/clips/${clip.id}/file`
    link.download = `${clip.name}.${ext}`
    link.click()
  }

  const openEdit = () => {
    // Reset form to current clip values whenever the panel opens
    setName(clip.name)
    setType(clip.type)
    setCategory(clip.category ?? '')
    setTagsRaw((clip.tags ?? []).join(', '))
    setEditError(null)
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditError(null)
  }

  const handleSave = async () => {
    if (!onEdit) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      setEditError('El nombre no puede estar vacio.')
      return
    }

    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const data: ClipUpdate = {
      name: trimmedName,
      type,
      category: category.trim() || undefined,
      tags,
    }

    setSaving(true)
    setEditError(null)
    try {
      await onEdit(clip, data)
      setIsEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al guardar los cambios.')
    } finally {
      setSaving(false)
    }
  }

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '--'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
  }

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden transition-colors">
      {/* Main card row */}
      <div className="p-4 flex items-center gap-3">
        <button
          onClick={() => onPlay(clip)}
          className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            isPlaying ? 'bg-brand-600' : 'bg-brand-500 active:bg-brand-600'
          }`}
          aria-label={isPlaying ? 'Stop' : `Play ${clip.name}`}
        >
          {isPlaying ? (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-100 truncate">{clip.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[clip.type] ?? 'bg-slate-600 text-slate-300'}`}>
              {clip.type}
            </span>
            {clip.category && (
              <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
                {clip.category}
              </span>
            )}
            <span className="text-xs text-slate-500">{formatDuration(clip.duration)}</span>
          </div>
          {(clip.tags ?? []).length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {(clip.tags ?? []).slice(0, 3).map((tag) => (
                <span key={tag} className="text-xs text-slate-500">#{tag}</span>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleDownload}
          className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 active:bg-slate-600"
          aria-label={`Descargar ${clip.name}`}
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        {onEdit && (
          <button
            onClick={isEditing ? cancelEdit : openEdit}
            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
              isEditing
                ? 'bg-brand-500/20 text-brand-400'
                : 'bg-slate-700 active:bg-slate-600'
            }`}
            aria-label={isEditing ? 'Cancelar edicion' : `Editar ${clip.name}`}
            aria-expanded={isEditing}
          >
            {isEditing ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            )}
          </button>
        )}

        {onDelete && (
          <button
            onClick={() => onDelete(clip)}
            className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 active:bg-red-600/80 hover:bg-red-600/50 transition-colors"
            aria-label={`Eliminar ${clip.name}`}
          >
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* Inline edit panel */}
      {isEditing && (
        <div className="border-t border-slate-700 px-4 pb-4 pt-3 flex flex-col gap-3">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-400" htmlFor={`edit-name-${clip.id}`}>
              Nombre
            </label>
            <input
              id={`edit-name-${clip.id}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-500"
              placeholder="Nombre del clip"
              disabled={saving}
            />
          </div>

          {/* Type + Category side by side on wider screens */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-400" htmlFor={`edit-type-${clip.id}`}>
                Tipo
              </label>
              <select
                id={`edit-type-${clip.id}`}
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none"
                disabled={saving}
              >
                {CLIP_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-400" htmlFor={`edit-category-${clip.id}`}>
                Categoria
              </label>
              <input
                id={`edit-category-${clip.id}`}
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-500"
                placeholder="general"
                disabled={saving}
              />
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-400" htmlFor={`edit-tags-${clip.id}`}>
              Tags <span className="text-slate-600 font-normal">(separados por coma)</span>
            </label>
            <input
              id={`edit-tags-${clip.id}`}
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className="bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-500"
              placeholder="loro, hablar, saludo"
              disabled={saving}
            />
          </div>

          {/* Error */}
          {editError && (
            <p role="alert" className="text-xs text-red-400">
              {editError}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="px-4 py-2 bg-slate-700 text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-600 transition-colors active:scale-[0.98] disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
