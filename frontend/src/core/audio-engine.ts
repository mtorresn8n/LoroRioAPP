// AudioEngine: plays audio files using Web Audio API

export class AudioEngine {
  private context: AudioContext | null = null
  private sourceNode: AudioBufferSourceNode | null = null
  private gainNode: GainNode | null = null
  private _isPlaying = false
  private _volume = 1

  onFinished: (() => void) | null = null

  get isPlaying(): boolean {
    return this._isPlaying
  }

  private getContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext()
    }
    return this.context
  }

  async play(url: string, volume?: number): Promise<void> {
    this.stop()

    const ctx = this.getContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const res = await fetch(url)
    const arrayBuffer = await res.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

    this.gainNode = ctx.createGain()
    this.gainNode.gain.value = volume ?? this._volume
    this.gainNode.connect(ctx.destination)

    this.sourceNode = ctx.createBufferSource()
    this.sourceNode.buffer = audioBuffer
    this.sourceNode.connect(this.gainNode)

    this._isPlaying = true
    this.sourceNode.onended = () => {
      this._isPlaying = false
      this.sourceNode = null
      this.onFinished?.()
    }

    this.sourceNode.start()
  }

  stop(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null
        this.sourceNode.stop()
        this.sourceNode.disconnect()
      } catch {
        // ignore errors when stopping already stopped nodes
      }
      this.sourceNode = null
    }
    this.gainNode?.disconnect()
    this.gainNode = null
    this._isPlaying = false
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v))
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume
    }
  }

  getVolume(): number {
    return this._volume
  }

  destroy(): void {
    this.stop()
    this.context?.close().catch(() => {})
    this.context = null
  }
}
