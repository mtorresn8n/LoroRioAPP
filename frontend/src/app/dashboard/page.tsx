import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '@/core/api-client'
import { Tooltip } from '@/components/tooltip'
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
          apiClient.get<DailyStats>('/api/stats/today'),
          apiClient.get<Recording[]>('/api/recordings?limit=1&sort=created_at:desc'),
          apiClient.get<Schedule[]>('/api/schedules?enabled=true&limit=5'),
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
    <div className="flex flex-col gap-4 p-4 pb-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">LoroApp</h1>
        <p className="text-slate-400 text-sm">
          {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Stats grid */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Resumen de hoy
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-4 h-20 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Tooltip text="Cantidad de clips de audio reproducidos hoy para el loro" position="top">
              <StatCard
                label="Clips reproducidos"
                value={stats?.clips_played ?? 0}
                icon={
                  <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                }
              />
            </Tooltip>
            <Tooltip text="Grabaciones del loro capturadas por el microfono hoy" position="top">
              <StatCard
                label="Grabaciones"
                value={stats?.recordings_made ?? 0}
                icon={
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                }
              />
            </Tooltip>
            <Tooltip text="Cantidad de sonidos detectados por el microfono hoy" position="top">
              <StatCard
                label="Sonidos detectados"
                value={stats?.sounds_detected ?? 0}
                icon={
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0-6a3 3 0 110-6 3 3 0 010 6z" />
                  </svg>
                }
              />
            </Tooltip>
          </div>
        )}
      </section>

      {/* Last recording */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Ultima grabacion
        </h2>
        {loading ? (
          <div className="bg-slate-800 rounded-xl h-16 animate-pulse" />
        ) : lastRecording ? (
          <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-100 font-medium capitalize">
                {lastRecording.classification}
              </p>
              <p className="text-slate-400 text-sm">
                {formatTime(lastRecording.created_at)}
                {lastRecording.duration !== null && ` · ${lastRecording.duration.toFixed(1)}s`}
              </p>
            </div>
            <Tooltip text="Ver todas las grabaciones del loro" position="left">
              <Link
                to="/recordings"
                className="text-brand-400 text-sm font-medium hover:text-brand-300 transition-colors"
              >
                Ver todas
              </Link>
            </Tooltip>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl p-4 text-center text-slate-500">
            <p className="text-sm">Sin grabaciones aun</p>
            <p className="text-xs mt-1">Inicia el modo estacion para empezar a grabar</p>
          </div>
        )}
      </section>

      {/* Upcoming events */}
      {!loading && nextEvents.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Proximos horarios
          </h2>
          <div className="flex flex-col gap-2">
            {nextEvents.map((schedule) => (
              <div key={schedule.id} className="bg-slate-800 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-900/30 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-100 font-medium truncate">{schedule.name}</p>
                  <p className="text-slate-400 text-sm capitalize">{schedule.schedule_type}</p>
                </div>
                <Tooltip text={schedule.enabled ? 'Horario activo' : 'Horario desactivado'} position="left">
                  <span className={`w-2 h-2 rounded-full ${schedule.enabled ? 'bg-brand-400' : 'bg-slate-600'}`} />
                </Tooltip>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Acciones rapidas
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Tooltip text="Ir a la biblioteca de clips de audio" position="top">
            <Link
              to="/library"
              className="bg-slate-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-700 transition-colors h-24"
            >
              <svg className="w-7 h-7 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span className="text-sm font-medium text-slate-200">Reproducir clip</span>
            </Link>
          </Tooltip>
          <Tooltip text="Ver todas las grabaciones del loro" position="top">
            <Link
              to="/recordings"
              className="bg-slate-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-700 transition-colors h-24"
            >
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <span className="text-sm font-medium text-slate-200">Grabaciones</span>
            </Link>
          </Tooltip>
          <Tooltip text="Ir a sesiones de entrenamiento" position="top">
            <Link
              to="/training"
              className="bg-slate-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-slate-700 transition-colors h-24"
            >
              <svg className="w-7 h-7 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-sm font-medium text-slate-200">Entrenar</span>
            </Link>
          </Tooltip>
          <Tooltip text="Activa el modo continuo: la app escucha y responde sola" position="top">
            <Link
              to="/station"
              className="bg-brand-900/40 border border-brand-700/50 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-brand-900/60 transition-colors h-24"
            >
              <svg className="w-7 h-7 text-brand-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-medium text-brand-300">Modo estacion</span>
            </Link>
          </Tooltip>
        </div>
      </section>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
}

const StatCard = ({ label, value, icon }: StatCardProps) => (
  <div className="bg-slate-800 rounded-xl p-4 cursor-help h-full flex flex-col justify-center">
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <span className="text-2xl font-bold text-slate-100">{value}</span>
    </div>
    <p className="text-xs text-slate-400 truncate">{label}</p>
  </div>
)

export default DashboardPage
