// AudioRecorder: records microphone audio using MediaRecorder API

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: BlobEvent['data'][] = []
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stopTimer: ReturnType<typeof setTimeout> | null = null
  private _isRecording = false

  get isRecording(): boolean {
    return this._isRecording
  }

  get analyserNode(): AnalyserNode | null {
    return this.analyser
  }

  async start(duration?: number): Promise<void> {
    if (this._isRecording) return

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    // Set up analyser for volume monitoring
    this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(this.stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)

    this.chunks = []
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm',
    })

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }

    this.mediaRecorder.start(100) // collect in 100ms chunks
    this._isRecording = true

    if (duration) {
      this.stopTimer = setTimeout(() => this.stop(), duration * 1_000)
    }
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this._isRecording) {
        reject(new Error('Not recording'))
        return
      }

      if (this.stopTimer !== null) {
        clearTimeout(this.stopTimer)
        this.stopTimer = null
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType ?? 'audio/webm' })
        this.cleanup()
        resolve(blob)
      }

      this.mediaRecorder.onerror = () => {
        this.cleanup()
        reject(new Error('MediaRecorder error'))
      }

      this.mediaRecorder.stop()
      this._isRecording = false
    })
  }

  getVolumeLevel(): number {
    if (!this.analyser) return 0
    const buffer = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(buffer)
    const sum = buffer.reduce((acc, val) => acc + val, 0)
    return sum / buffer.length / 255
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.audioContext?.close().catch(() => {})
    this.audioContext = null
    this.analyser = null
    this.mediaRecorder = null
    this.chunks = []
  }
}
