import { useCallback, useEffect, useRef, useState } from 'react'

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [isSupported] = useState(() => 'wakeLock' in navigator)

  const acquire = useCallback(async () => {
    if (!isSupported || wakeLockRef.current) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      setIsActive(true)
      wakeLockRef.current.addEventListener('release', () => {
        setIsActive(false)
        wakeLockRef.current = null
      })
    } catch {
      // Wake Lock acquisition can fail (e.g. tab not visible)
      setIsActive(false)
    }
  }, [isSupported])

  const release = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release()
      wakeLockRef.current = null
      setIsActive(false)
    }
  }, [])

  // Re-acquire on page visibility change (required behavior for Wake Lock API)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isActive && !wakeLockRef.current) {
        acquire().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [acquire, isActive])

  return { acquire, release, isActive, isSupported }
}
