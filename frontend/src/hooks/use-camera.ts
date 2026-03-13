// frontend/src/hooks/use-camera.ts
import { useCallback, useRef, useState } from 'react'

type FacingMode = 'environment' | 'user'

interface UseCameraReturn {
  stream: MediaStream | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  start: (constraints?: MediaStreamConstraints) => Promise<MediaStream>
  stop: () => void
  flip: () => Promise<MediaStream | null>
  capturePhoto: () => string | null
  isActive: boolean
  facingMode: FacingMode
}

export const useCamera = (): UseCameraReturn => {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [facingMode, setFacingMode] = useState<FacingMode>('environment')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const facingModeRef = useRef<FacingMode>('environment')

  const startWithMode = useCallback(async (mode: FacingMode, audioEnabled: boolean): Promise<MediaStream> => {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: audioEnabled,
    })
    setStream(mediaStream)
    setIsActive(true)
    setFacingMode(mode)
    facingModeRef.current = mode

    if (videoRef.current) {
      videoRef.current.srcObject = mediaStream
    }

    return mediaStream
  }, [])

  const start = useCallback(async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
    const mode = (constraints?.video && typeof constraints.video === 'object'
      ? (constraints.video as MediaTrackConstraints).facingMode as FacingMode | undefined
      : undefined) ?? 'environment'
    const audio = constraints?.audio !== false
    return startWithMode(mode, audio)
  }, [startWithMode])

  const stop = useCallback(() => {
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
    }
    setStream(null)
    setIsActive(false)
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [stream])

  const flip = useCallback(async (): Promise<MediaStream | null> => {
    if (!isActive) return null
    // Stop current tracks
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
    }
    const newMode: FacingMode = facingModeRef.current === 'environment' ? 'user' : 'environment'
    return startWithMode(newMode, true)
  }, [isActive, stream, startWithMode])

  const capturePhoto = useCallback((): string | null => {
    if (!videoRef.current || !isActive) return null

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    const video = videoRef.current

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/png')
  }, [isActive])

  return { stream, videoRef, start, stop, flip, capturePhoto, isActive, facingMode }
}
