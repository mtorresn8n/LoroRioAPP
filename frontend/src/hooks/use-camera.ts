// frontend/src/hooks/use-camera.ts
import { useCallback, useRef, useState } from 'react'

interface UseCameraReturn {
  stream: MediaStream | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  start: (constraints?: MediaStreamConstraints) => Promise<MediaStream>
  stop: () => void
  capturePhoto: () => string | null
  isActive: boolean
}

export const useCamera = (): UseCameraReturn => {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const start = useCallback(async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
    const defaultConstraints: MediaStreamConstraints = {
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
      ...constraints,
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia(defaultConstraints)
    setStream(mediaStream)
    setIsActive(true)

    if (videoRef.current) {
      videoRef.current.srcObject = mediaStream
    }

    return mediaStream
  }, [])

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

  return { stream, videoRef, start, stop, capturePhoto, isActive }
}
