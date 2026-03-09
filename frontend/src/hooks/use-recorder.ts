import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioRecorder } from '@/core/recorder'

export function useRecorder() {
  const recorder = useRef<AudioRecorder>(new AudioRecorder())
  const [isRecording, setIsRecording] = useState(false)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const rafRef = useRef<number | null>(null)

  const startVolumeMonitor = useCallback(() => {
    const tick = () => {
      setVolumeLevel(recorder.current.getVolumeLevel())
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const stopVolumeMonitor = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setVolumeLevel(0)
  }, [])

  const start = useCallback(
    async (duration?: number) => {
      await recorder.current.start(duration)
      setIsRecording(true)
      startVolumeMonitor()
    },
    [startVolumeMonitor],
  )

  const stop = useCallback(async (): Promise<Blob> => {
    stopVolumeMonitor()
    const blob = await recorder.current.stop()
    setIsRecording(false)
    return blob
  }, [stopVolumeMonitor])

  useEffect(() => {
    return () => stopVolumeMonitor()
  }, [stopVolumeMonitor])

  return { start, stop, isRecording, volumeLevel, analyserNode: recorder.current.analyserNode }
}
