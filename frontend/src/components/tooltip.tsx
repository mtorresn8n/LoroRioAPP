'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface TooltipProps {
  text: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export const Tooltip = ({ text, children, position = 'top' }: TooltipProps) => {
  const [visible, setVisible] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const show = useCallback(() => setVisible(true), [])
  const hide = useCallback(() => setVisible(false), [])

  const handleTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => setVisible(true), 500)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
    }
    setTimeout(() => setVisible(false), 1500)
  }, [])

  useEffect(() => {
    return () => {
      if (longPressTimer.current !== null) {
        clearTimeout(longPressTimer.current)
      }
    }
  }, [])

  const positionClasses: Record<NonNullable<TooltipProps['position']>, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrowClasses: Record<NonNullable<TooltipProps['position']>, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-slate-700',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-slate-700',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-slate-700',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-slate-700',
  }

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex w-full"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={`absolute z-50 pointer-events-none ${positionClasses[position]}`}
        >
          <div className="bg-slate-700 text-white text-xs rounded-lg px-3 py-2 min-w-[200px] max-w-[300px] text-center leading-snug shadow-xl border border-slate-600 animate-in fade-in duration-150">
            {text}
          </div>
          <span
            className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`}
          />
        </div>
      )}
    </div>
  )
}
