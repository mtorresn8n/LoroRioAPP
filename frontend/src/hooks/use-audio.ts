import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from '@/core/audio-engine'

export function useAudio() {
  const engine = useRef<AudioEngine>(new AudioEngine())
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolumeState] = useState(1)

  useEffect(() => {
    const eng = engine.current
    eng.onFinished = () => setIsPlaying(false)
    return () => eng.destroy()
  }, [])

  const play = useCallback(async (url: string, vol?: number) => {
    await engine.current.play(url, vol)
    setIsPlaying(true)
  }, [])

  const stop = useCallback(() => {
    engine.current.stop()
    setIsPlaying(false)
  }, [])

  const setVolume = useCallback((v: number) => {
    engine.current.setVolume(v)
    setVolumeState(v)
  }, [])

  return { play, stop, setVolume, isPlaying, volume }
}
