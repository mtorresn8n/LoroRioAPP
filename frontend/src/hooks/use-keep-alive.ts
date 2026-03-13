import { useCallback, useRef, useState } from 'react'

/**
 * Keeps the browser audio process alive when the phone screen locks.
 *
 * Creates a silent AudioContext oscillator running at a near-zero gain so
 * the OS does not suspend the browser process. This complements the Wake
 * Lock API, which only prevents the screen from turning off — it does NOT
 * prevent the browser from being throttled or suspended on mobile when the
 * screen locks via hardware button.
 */
export function useKeepAlive() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  // Keep a stable reference to the statechange handler so it can be removed
  // in deactivate() without creating a new function identity each render.
  const stateChangeListenerRef = useRef<(() => void) | null>(null)
  const [isActive, setIsActive] = useState(false)

  const activate = useCallback(() => {
    if (oscillatorRef.current) return

    try {
      const ctx = new AudioContext()
      audioCtxRef.current = ctx

      // Resume immediately — browsers may create the context in 'suspended'
      // state when there has been no prior user gesture on that page load.
      void ctx.resume()

      // Re-resume whenever the OS suspends the context (e.g. screen lock on
      // iOS Safari). Without this the oscillator goes silent after the first
      // suspension even though the browser process is still running.
      const onStateChange = () => {
        if (ctx.state === 'suspended') {
          void ctx.resume()
        }
      }
      ctx.addEventListener('statechange', onStateChange)
      stateChangeListenerRef.current = onStateChange

      const oscillator = ctx.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = 1 // 1 Hz — completely inaudible

      const gain = ctx.createGain()
      gain.gain.value = 0.001 // Near-zero gain to minimise battery draw

      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start()

      oscillatorRef.current = oscillator
      gainRef.current = gain
      setIsActive(true)
    } catch {
      // AudioContext may be blocked (e.g. no user gesture yet) — fail silently
      setIsActive(false)
    }
  }, [])

  const deactivate = useCallback(() => {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop()
      } catch {
        // Oscillator may already be stopped
      }
      oscillatorRef.current = null
    }

    gainRef.current = null

    if (audioCtxRef.current) {
      // Remove the statechange listener before closing to avoid any callbacks
      // firing on a context that is already being torn down.
      if (stateChangeListenerRef.current) {
        audioCtxRef.current.removeEventListener('statechange', stateChangeListenerRef.current)
        stateChangeListenerRef.current = null
      }
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }

    setIsActive(false)
  }, [])

  return { activate, deactivate, isActive }
}
