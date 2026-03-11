import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '@/core/api-client'
import { Tooltip } from '@/components/tooltip'
import { StatCard } from '@/components/stat-card'
import { ActionCard } from '@/components/action-card'
import type { DailyStats, Recording, Schedule } from '@/types'

const DashboardPage = () => {
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [lastRecording, setLastRecording] = useState<Recording | null>(null)
  const [nextEvents, setNextEvents] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [statsData, recordings, schedules] = await Promise.all([
          apiClient.get<DailyStats>('/api/v1/recordings/stats'),
          apiClient.get<Recording[]>('/api/v1/recordings/?limit=1'),
          apiClient.get<Schedule[]>('/api/v1/scheduler/', { limit: '5' }),
        ])
        setStats(statsData)
        const recs = Array.isArray(recordings) ? recordings : []
        setLastRecording(recs[0] ?? null)
        setNextEvents(Array.isArray(schedules) ? schedules : [])
      } catch {
        // show empty state on error
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">LoroApp</h1>
        <p className="text-slate-400 text-sm">
          {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Hero: Modo Estacion */}
      <Link
        to="/station"
        className="group bg-gradient-to-br from-brand-900/50 to-brand-950/30 border border-brand-700/40 rounded-2xl p-5 flex items-center gap-4 hover:border-brand-600/60 hover:from-brand-900/60 transition-all active:scale-[0.98]"
      >
        <div className="w-14 h-14 rounded-2xl bg-brand-800/40 border border-brand-700/30 flex items-center justify-center shrink-0 group-hover:bg-brand-800/60 transition-colors">
          <svg className="w-7 h-7 text-brand-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-brand-300">Modo Estacion</p>
          <p className="text-sm text-slate-400 mt-0.5">La app escucha y responde automaticamente</p>
        </div>
        <svg className="w-5 h-5 text-brand-500 shrink-0 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Last recording */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Ultima grabacion
        </h2>
        {loading ? (
          <div className="bg-slate-800 rounded-xl h-[4.5rem] animate-pulse" />
        ) : lastRecording ? (
          <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-900/30 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-100 font-medium capitalize truncate">
                {lastRecording.classification ?? 'Sin clasificar'}
              </p>
              <p className="text-slate-400 text-sm">
                {formatTime(lastRecording.recorded_at)}
                {lastRecording.duration !== null && ` · ${lastRecording.duration.toFixed(1)}s`}
              </p>
            </div>
            <Link
              to="/recordings"
              className="text-brand-400 text-sm font-medium hover:text-brand-300 transition-colors shrink-0"
            >
              Ver todas
            </Link>
          </div>
        ) : (
          <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-4 text-center">
            <p className="text-sm text-slate-500">Sin grabaciones aun</p>
            <p className="text-xs text-slate-600 mt-1">Inicia el modo estacion para empezar</p>
          </div>
        )}
      </section>

      {/* Stats grid */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Resumen de hoy
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-800 rounded-xl h-[5rem] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tooltip text="Clips de audio reproducidos hoy" position="top">
              <StatCard
                label="Clips reproducidos"
                value={stats?.clips_played ?? 0}
                icon={
                  <svg className="w-4 h-4 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                }
              />
            </Tooltip>
            <Tooltip text="Grabaciones capturadas por el microfono hoy" position="top">
              <StatCard
                label="Grabaciones"
                value={stats?.recordings_made ?? 0}
                icon={
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                }
              />
            </Tooltip>
            <Tooltip text="Sesiones de entrenamiento completadas hoy" position="top">
              <StatCard
                label="Sesiones"
                value={stats?.sessions_completed ?? 0}
                icon={
                  <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                }
              />
            </Tooltip>
            <Tooltip text="Sonidos detectados por el microfono hoy" position="top">
              <StatCard
                label="Sonidos detectados"
                value={stats?.sounds_detected ?? 0}
                icon={
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0-6a3 3 0 110-6 3 3 0 010 6z" />
                  </svg>
                }
              />
            </Tooltip>
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Acciones rapidas
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <ActionCard
            to="/library"
            label="Clips"
            icon={
              <svg className="w-6 h-6 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            }
          />
          <ActionCard
            to="/recordings"
            label="Grabaciones"
            icon={
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            }
          />
          <ActionCard
            to="/training"
            label="Entrenar"
            icon={
              <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            }
          />
        </div>
      </section>

      {/* Upcoming events */}
      {!loading && nextEvents.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Proximos horarios
          </h2>
          <div className="flex flex-col gap-2">
            {nextEvents.map((schedule) => (
              <div key={schedule.id} className="bg-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-900/30 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-100 font-medium text-sm truncate">{schedule.name}</p>
                  <p className="text-slate-500 text-xs capitalize">{schedule.schedule_type}</p>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${schedule.is_active ? 'bg-brand-400' : 'bg-slate-600'}`} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default DashboardPage
