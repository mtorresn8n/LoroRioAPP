import type { Clip } from '@/types'

const TYPE_COLORS: Record<string, string> = {
  word: 'bg-blue-500/20 text-blue-300',
  phrase: 'bg-purple-500/20 text-purple-300',
  sound: 'bg-yellow-500/20 text-yellow-300',
  music: 'bg-pink-500/20 text-pink-300',
  reward: 'bg-brand-500/20 text-brand-300',
}

interface ClipCardProps {
  clip: Clip
  onPlay: (clip: Clip) => void
  onEdit?: (clip: Clip) => void
  isPlaying?: boolean
}

export const ClipCard = ({ clip, onPlay, onEdit, isPlaying = false }: ClipCardProps) => {
  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '--'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-3 active:bg-slate-700 transition-colors">
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
        {clip.tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {clip.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs text-slate-500">#{tag}</span>
            ))}
          </div>
        )}
      </div>

      {onEdit && (
        <button
          onClick={() => onEdit(clip)}
          className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 active:bg-slate-600"
          aria-label={`Edit ${clip.name}`}
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}
    </div>
  )
}
