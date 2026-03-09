import { useEffect, useRef } from 'react'

interface WaveformProps {
  analyserNode: AnalyserNode | null
  width?: number
  height?: number
  color?: string
}

export const Waveform = ({
  analyserNode,
  width = 300,
  height = 80,
  color = '#22c55e',
}: WaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (!analyserNode) {
      ctx.clearRect(0, 0, width, height)
      // Draw flat line when no analyser
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()
      return
    }

    const bufferLength = analyserNode.fftSize
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      analyserNode.getByteTimeDomainData(dataArray)

      ctx.fillStyle = '#1e293b'
      ctx.fillRect(0, 0, width, height)

      ctx.lineWidth = 2
      ctx.strokeStyle = color
      ctx.beginPath()

      const sliceWidth = width / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i]! / 128
        const y = (v * height) / 2
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
        x += sliceWidth
      }

      ctx.lineTo(width, height / 2)
      ctx.stroke()
    }

    draw()

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [analyserNode, width, height, color])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-lg w-full"
      style={{ height }}
    />
  )
}
