interface VolumeMeterProps {
  level: number // 0 to 1
  threshold?: number // 0 to 1, optional line indicator
  orientation?: 'vertical' | 'horizontal'
  className?: string
}

export const VolumeMeter = ({
  level,
  threshold,
  orientation = 'vertical',
  className = '',
}: VolumeMeterProps) => {
  const clamped = Math.max(0, Math.min(1, level))
  const percent = Math.round(clamped * 100)

  const getColor = () => {
    if (clamped >= 0.8) return 'bg-red-500'
    if (clamped >= 0.6) return 'bg-yellow-500'
    return 'bg-brand-500'
  }

  if (orientation === 'horizontal') {
    return (
      <div className={`relative bg-slate-700 rounded-full overflow-hidden h-4 ${className}`}>
        <div
          className={`h-full rounded-full transition-all duration-75 ${getColor()}`}
          style={{ width: `${percent}%` }}
        />
        {threshold !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/50"
            style={{ left: `${Math.round(threshold * 100)}%` }}
          />
        )}
      </div>
    )
  }

  return (
    <div className={`relative bg-slate-700 rounded-full overflow-hidden w-4 ${className}`}>
      <div
        className={`absolute bottom-0 w-full rounded-full transition-all duration-75 ${getColor()}`}
        style={{ height: `${percent}%` }}
      />
      {threshold !== undefined && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-white/50"
          style={{ bottom: `${Math.round(threshold * 100)}%` }}
        />
      )}
    </div>
  )
}
