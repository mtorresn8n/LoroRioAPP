// SoundDetector: monitors microphone for sound above a threshold

export class SoundDetector {
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private rafId: number | null = null
  private callback: (() => void) | null = null
  private threshold = 0.1
  private minDurationMs = 300
  private soundStartTime: number | null = null
  private lastTriggerTime = 0
  private cooldownMs = 2_000
  private _isActive = false

  get isActive(): boolean {
    return this._isActive
  }

  get analyserNode(): AnalyserNode | null {
    return this.analyser
  }

  getCurrentLevel(): number {
    if (!this.analyser) return 0
    const buffer = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(buffer)
    const sum = buffer.reduce((acc, val) => acc + val, 0)
    return sum / buffer.length / 255
  }

  async start(threshold: number, minDurationMs = 300, cooldownMs = 2_000): Promise<void> {
    if (this._isActive) return

    this.threshold = threshold
    this.minDurationMs = minDurationMs
    this.cooldownMs = cooldownMs

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(this.stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.3
    source.connect(this.analyser)

    this._isActive = true
    this.loop()
  }

  stop(): void {
    this._isActive = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.audioContext?.close().catch(() => {})
    this.audioContext = null
    this.analyser = null
    this.soundStartTime = null
  }

  onSoundDetected(callback: () => void): void {
    this.callback = callback
  }

  private loop = (): void => {
    if (!this._isActive) return

    const level = this.getCurrentLevel()
    const now = Date.now()

    if (level >= this.threshold) {
      if (this.soundStartTime === null) {
        this.soundStartTime = now
      } else if (
        now - this.soundStartTime >= this.minDurationMs &&
        now - this.lastTriggerTime >= this.cooldownMs
      ) {
        this.lastTriggerTime = now
        this.soundStartTime = null
        this.callback?.()
      }
    } else {
      this.soundStartTime = null
    }

    this.rafId = requestAnimationFrame(this.loop)
  }
}
