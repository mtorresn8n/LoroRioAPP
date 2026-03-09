import { useCallback, useEffect, useRef, useState } from 'react'

interface AudioPlayerProps {
  src: string
  title: string
  autoPlay?: boolean
}

export const AudioPlayer = ({ src, title, autoPlay = false }: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)

  useEffect(() => {
    const audio = new Audio(src)
    audioRef.current = audio

    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
    audio.addEventListener('timeupdate', () => {
      setProgress(audio.currentTime / (audio.duration || 1))
    })
    audio.addEventListener('ended', () => setIsPlaying(false))

    if (autoPlay) {
      audio.play().then(() => setIsPlaying(true)).catch(() => {})
    }

    return () => {
      audio.pause()
      audio.src = ''
    }
  }, [src, autoPlay])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }, [isPlaying])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const v = Number(e.target.value) / 100
    audio.currentTime = v * audio.duration
    setProgress(v)
  }, [])

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const v = Number(e.target.value) / 100
    audio.volume = v
    setVolumeState(v)
  }, [])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="w-12 h-12 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0 active:bg-brand-600"
          aria-label={isPlaying ? 'Pause' : 'Play'}
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
          <p className="text-sm font-medium text-slate-100 truncate">{title}</p>
          <p className="text-xs text-slate-400">
            {formatTime(progress * duration)} / {formatTime(duration)}
          </p>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(progress * 100)}
        onChange={handleSeek}
        className="w-full h-2 bg-slate-600 rounded-full appearance-none cursor-pointer accent-brand-500"
        aria-label="Seek"
      />

      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={handleVolume}
          className="w-24 h-2 bg-slate-600 rounded-full appearance-none cursor-pointer accent-brand-500"
          aria-label="Volume"
        />
        <span className="text-xs text-slate-400 w-8">{Math.round(volume * 100)}%</span>
      </div>
    </div>
  )
}
