import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient, getApiBaseUrl } from '@/core/api-client'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'
import type { DailyStats, Recording, RecordingClassification, RecordingUpdate } from '@/types'

const CLASSIFICATIONS: { value: RecordingClassification | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'speech', label: 'Habla' },
  { value: 'parrot', label: 'Loro' },
  { value: 'noise', label: 'Ruido' },
  { value: 'silence', label: 'Silencio' },
]

type SortOption = 'newest' | 'oldest' | 'starred'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Mas recientes' },
  { value: 'oldest', label: 'Mas antiguas' },
  { value: 'starred', label: 'Favoritas primero' },
]

const BATCH_SIZE = 20

const getMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
const currentMonthKey = getMonthKey(new Date())

const RecordingsPage = () => {
  const { showToast } = useToast()
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<RecordingClassification | 'all'>('all')
  const [sort, setSort] = useState<SortOption>('newest')
  const [onlyStarred, setOnlyStarred] = useState(false)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([currentMonthKey]))
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  // How many recordings to show per month (expandable)
  const [monthVisibleCount, setMonthVisibleCount] = useState<Record<string, number>>({
    [currentMonthKey]: BATCH_SIZE,
  })
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { limit: '500' }
      if (filter !== 'all' && filter !== null) params['classification'] = filter
      const [recs, statsData] = await Promise.all([
        apiClient.get<Recording[]>('/api/v1/recordings/', params),
        apiClient.get<DailyStats>('/api/v1/recordings/stats'),
      ])
      setRecordings(Array.isArray(recs) ? recs : [])
      setStats(statsData)
    } catch {
      setRecordings([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handlePlay = useCallback((rec: Recording) => {
    if (playingId === rec.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(`${getApiBaseUrl()}/api/v1/recordings/${rec.id}/file`)
    audioRef.current = audio
    audio.play().catch(() => {})
    setPlayingId(rec.id)
    audio.onended = () => setPlayingId(null)
  }, [playingId])

  const handleClassify = useCallback(async (rec: Recording, classification: RecordingClassification) => {
    try {
      await apiClient.put<Recording>(`/api/v1/recordings/${rec.id}`, {
        classification,
      } satisfies RecordingUpdate)
      setRecordings((prev) =>
        prev.map((r) => r.id === rec.id ? { ...r, classification } : r),
      )
      showToast('Clasificacion guardada', 'success')
    } catch {
      showToast('Error al clasificar', 'error')
    }
  }, [showToast])

  const handleDelete = useCallback(async (rec: Recording) => {
    if (!confirm('Eliminar esta grabacion?')) return
    try {
      await apiClient.del(`/api/v1/recordings/${rec.id}`)
      setRecordings((prev) => prev.filter((r) => r.id !== rec.id))
      showToast('Grabacion eliminada', 'success')
    } catch {
      showToast('Error al eliminar', 'error')
    }
  }, [showToast])

  const handleStar = useCallback(async (rec: Recording) => {
    try {
      await apiClient.put<Recording>(`/api/v1/recordings/${rec.id}`, {
        starred: !rec.starred,
      } satisfies RecordingUpdate)
      setRecordings((prev) =>
        prev.map((r) => r.id === rec.id ? { ...r, starred: !r.starred } : r),
      )
      showToast(rec.starred ? 'Quitado de favoritos' : 'Marcado como favorito', 'info')
    } catch {
      showToast('Error al actualizar', 'error')
    }
  }, [showToast])

  const showMoreInMonth = useCallback((monthKey: string, amount: number | 'all') => {
    setMonthVisibleCount((prev) => ({
      ...prev,
      [monthKey]: amount === 'all' ? 99999 : (prev[monthKey] ?? BATCH_SIZE) + amount,
    }))
  }, [])

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('es', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  const filteredRecordings = useMemo(() => {
    let result = [...recordings]
    if (onlyStarred) result = result.filter((r) => r.starred)
    if (sort === 'newest') {
      result.sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    } else if (sort === 'oldest') {
      result.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    } else if (sort === 'starred') {
      result.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0))
    }
    return result
  }, [recordings, onlyStarred, sort])

  // Group recordings into Year > Month > Week
  const groupedData = useMemo(() => {
    const now = new Date()
    const thisYear = now.getFullYear()

    const getWeekNumber = (d: Date): number => {
      const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
      copy.setUTCDate(copy.getUTCDate() + 4 - (copy.getUTCDay() || 7))
      const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1))
      return Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    }

    const getWeekStart = (d: Date): Date => {
      const copy = new Date(d)
      const day = copy.getDay() || 7
      copy.setDate(copy.getDate() - day + 1)
      copy.setHours(0, 0, 0, 0)
      return copy
    }

    const getWeekEnd = (d: Date): Date => {
      const start = getWeekStart(d)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return end
    }

    const formatShortDate = (d: Date) =>
      d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

    type WeekGroup = { weekKey: string; weekLabel: string; recordings: Recording[] }
    type MonthGroup = { monthKey: string; monthLabel: string; totalCount: number; weeks: WeekGroup[] }
    type YearGroup = { year: number; yearLabel: string; months: MonthGroup[] }

    const yearMap = new Map<number, Map<string, Recording[]>>()

    for (const rec of filteredRecordings) {
      const d = new Date(rec.recorded_at)
      const year = d.getFullYear()
      const mKey = getMonthKey(d)
      if (!yearMap.has(year)) yearMap.set(year, new Map())
      const monthMap = yearMap.get(year)!
      if (!monthMap.has(mKey)) monthMap.set(mKey, [])
      monthMap.get(mKey)!.push(rec)
    }

    const result: YearGroup[] = []

    for (const [year, monthMap] of yearMap) {
      const months: MonthGroup[] = []
      for (const [mKey, allRecs] of monthMap) {
        const sampleMonth = parseInt(mKey.split('-')[1], 10)
        const monthLabel = new Date(year, sampleMonth, 1)
          .toLocaleDateString('es-AR', { month: 'long' })
          .replace(/^\w/, (c) => c.toUpperCase())

        const totalCount = allRecs.length
        // Limit visible recordings for this month
        const visibleLimit = monthVisibleCount[mKey] ?? BATCH_SIZE
        const visibleRecs = allRecs.slice(0, visibleLimit)

        // Group visible recs into weeks
        const weekMap = new Map<string, Recording[]>()
        for (const rec of visibleRecs) {
          const d = new Date(rec.recorded_at)
          const weekNum = getWeekNumber(d)
          const wKey = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
          if (!weekMap.has(wKey)) weekMap.set(wKey, [])
          weekMap.get(wKey)!.push(rec)
        }

        const weeks: WeekGroup[] = []
        for (const [wKey, recs] of weekMap) {
          const sampleDate = new Date(recs[0].recorded_at)
          const wStart = getWeekStart(sampleDate)
          const wEnd = getWeekEnd(sampleDate)
          const weekLabel = `Semana ${getWeekNumber(sampleDate)} · ${formatShortDate(wStart)} - ${formatShortDate(wEnd)}`
          weeks.push({ weekKey: wKey, weekLabel, recordings: recs })
        }
        months.push({ monthKey: mKey, monthLabel, totalCount, weeks })
      }
      result.push({
        year,
        yearLabel: year === thisYear ? `${year} (este año)` : String(year),
        months,
      })
    }

    return result
  }, [filteredRecordings, monthVisibleCount])

  // Recording card
  const RecordingCard = ({ rec }: { rec: Recording }) => (
    <div className="bg-slate-800 rounded-xl p-3">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => handlePlay(rec)}
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            playingId === rec.id ? 'bg-red-600' : 'bg-slate-700 hover:bg-slate-600'
          }`}
          aria-label={playingId === rec.id ? 'Detener' : 'Reproducir'}
        >
          {playingId === rec.id ? (
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-slate-100 text-sm font-medium">{formatDate(rec.recorded_at)}</p>
          <p className="text-slate-400 text-xs">
            {rec.duration !== null ? `${rec.duration.toFixed(1)}s` : '--'}
            {rec.peak_volume !== null && ` · ${rec.peak_volume.toFixed(1)} dB`}
          </p>
        </div>
        <button
          onClick={() => {
            const link = document.createElement('a')
            link.href = `${getApiBaseUrl()}/api/v1/recordings/${rec.id}/file`
            link.download = `grabacion-${rec.id.slice(0, 8)}.wav`
            link.click()
          }}
          className="w-8 h-8 flex items-center justify-center hover:scale-110 transition-transform"
          aria-label="Descargar"
        >
          <svg className="w-4 h-4 text-slate-500 hover:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button
          onClick={() => void handleStar(rec)}
          className="w-8 h-8 flex items-center justify-center hover:scale-110 transition-transform"
          aria-label={rec.starred ? 'Quitar favorito' : 'Marcar favorito'}
        >
          <svg
            className={`w-5 h-5 ${rec.starred ? 'text-yellow-400 fill-yellow-400' : 'text-slate-500 hover:text-yellow-400'}`}
            fill={rec.starred ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
        <button
          onClick={() => void handleDelete(rec)}
          className="w-8 h-8 flex items-center justify-center hover:scale-110 transition-transform"
          aria-label="Eliminar grabacion"
        >
          <svg className="w-4 h-4 text-slate-500 hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
      <div className="flex gap-1.5 flex-wrap pl-[52px]">
        {(['speech', 'parrot', 'noise', 'silence'] as NonNullable<RecordingClassification>[]).map((cls) => (
          <button
            key={cls}
            onClick={() => void handleClassify(rec, cls)}
            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
              rec.classification === cls
                ? 'bg-brand-500 text-white'
                : 'bg-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-600'
            }`}
          >
            {cls === 'speech' ? 'Habla' : cls === 'parrot' ? 'Loro' : cls === 'noise' ? 'Ruido' : 'Silencio'}
          </button>
        ))}
      </div>
    </div>
  )

  // "Ver mas" buttons for a month
  const LoadMoreButtons = ({ monthKey, totalCount }: { monthKey: string; totalCount: number }) => {
    const visible = monthVisibleCount[monthKey] ?? BATCH_SIZE
    const remaining = totalCount - visible
    if (remaining <= 0) return null

    return (
      <div className="flex gap-2 ml-2 mt-2">
        <button
          onClick={() => showMoreInMonth(monthKey, BATCH_SIZE)}
          className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-xl hover:bg-slate-700 transition-colors active:scale-[0.98]"
        >
          Ver mas ({Math.min(remaining, BATCH_SIZE)})
        </button>
        {remaining > BATCH_SIZE && (
          <button
            onClick={() => showMoreInMonth(monthKey, 'all')}
            className="px-3 py-2 bg-slate-800 text-slate-500 text-xs rounded-xl hover:bg-slate-700 hover:text-slate-300 transition-colors active:scale-[0.98]"
          >
            Ver todas ({remaining})
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Grabaciones</h1>
        <p className="text-slate-400 text-xs mt-0.5">Sonidos capturados por el modo estacion</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <Tooltip text="Cantidad de grabaciones realizadas hoy" position="bottom">
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-slate-100 tabular-nums">{stats.recordings_made}</p>
              <p className="text-xs text-slate-400">Hoy</p>
            </div>
          </Tooltip>
          <Tooltip text="Sonidos detectados por el microfono hoy" position="bottom">
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-slate-100 tabular-nums">{stats.sounds_detected}</p>
              <p className="text-xs text-slate-400">Detectados</p>
            </div>
          </Tooltip>
          <Tooltip text="Grabaciones marcadas como favoritas" position="bottom">
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-brand-400 tabular-nums">
                {recordings.filter((r) => r.starred).length}
              </p>
              <p className="text-xs text-slate-400">Favoritos</p>
            </div>
          </Tooltip>
        </div>
      )}

      {/* Sort & starred */}
      <div className="flex gap-2 items-center">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="flex-1 bg-slate-800 text-slate-300 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => setOnlyStarred((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            onlyStarred ? 'bg-yellow-500/20 text-yellow-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <svg className="w-4 h-4" fill={onlyStarred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          Favoritas
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {CLASSIFICATIONS.map((c) => (
          <Tooltip key={c.value ?? 'null'} text={`Filtrar: ${c.label}`} position="bottom">
            <button
              onClick={() => setFilter(c.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === c.value ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Recording list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      ) : filteredRecordings.length === 0 ? (
        <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-8 text-center">
          <svg className="w-14 h-14 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <p className="text-sm text-slate-500 font-medium">No hay grabaciones</p>
          <p className="text-xs text-slate-600 mt-1">Inicia el modo estacion para empezar a grabar</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groupedData.map((yearGroup) => (
            <div key={yearGroup.year}>
              {groupedData.length > 1 && (
                <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm py-2 px-1 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-100">{yearGroup.yearLabel}</span>
                    <span className="text-xs text-slate-500">
                      {yearGroup.months.reduce((sum, m) => sum + m.totalCount, 0)} grabaciones
                    </span>
                  </div>
                </div>
              )}

              {yearGroup.months.map((monthGroup) => {
                const isCurrentMonth = monthGroup.monthKey === currentMonthKey
                const monthCollapsed = !expandedMonths.has(monthGroup.monthKey)
                return (
                <div key={monthGroup.monthKey} className="mb-3">
                  {/* Month header */}
                  <button
                    onClick={() => setExpandedMonths((prev) => {
                      const next = new Set(prev)
                      next.has(monthGroup.monthKey) ? next.delete(monthGroup.monthKey) : next.add(monthGroup.monthKey)
                      return next
                    })}
                    className="sticky top-0 z-10 w-full bg-slate-900/95 backdrop-blur-sm py-2 px-3 mb-2 rounded-lg border-l-2 border-brand-500 hover:bg-slate-800/95 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${monthCollapsed ? '' : 'rotate-90'}`} /* expanded/collapsed */ fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-sm font-semibold text-slate-200">{monthGroup.monthLabel}</span>
                        {isCurrentMonth && (
                          <span className="text-[10px] bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded-full font-medium">actual</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">{monthGroup.totalCount} grabaciones</span>
                    </div>
                  </button>

                  {!monthCollapsed && (
                    <>
                      {monthGroup.weeks.map((weekGroup) => {
                        const weekCollapsed = !expandedWeeks.has(weekGroup.weekKey)
                        return (
                        <div key={weekGroup.weekKey} className="mb-3 ml-2">
                          <button
                            onClick={() => setExpandedWeeks((prev) => {
                              const next = new Set(prev)
                              next.has(weekGroup.weekKey) ? next.delete(weekGroup.weekKey) : next.add(weekGroup.weekKey)
                              return next
                            })}
                            className="flex items-center gap-2 py-1.5 px-2 mb-2 w-full hover:bg-slate-800/50 rounded-lg transition-colors"
                          >
                            <svg className={`w-3 h-3 text-slate-500 transition-transform ${weekCollapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
                            <span className="text-xs font-medium text-slate-400">{weekGroup.weekLabel}</span>
                            <span className="text-xs text-slate-600">{weekGroup.recordings.length} reg.</span>
                          </button>
                          {!weekCollapsed && (
                            <div className="flex flex-col gap-2 ml-2">
                              {weekGroup.recordings.map((rec) => (
                                <RecordingCard key={rec.id} rec={rec} />
                              ))}
                            </div>
                          )}
                        </div>
                        )
                      })}
                      <LoadMoreButtons monthKey={monthGroup.monthKey} totalCount={monthGroup.totalCount} />
                    </>
                  )}
                </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RecordingsPage
