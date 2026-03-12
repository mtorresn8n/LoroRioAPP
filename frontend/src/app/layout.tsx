import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Tooltip } from '@/components/tooltip'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  tooltip: string
  icon: React.ReactNode
  exact?: boolean
}

interface NavSection {
  heading: string
  items: NavItem[]
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconParrot = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M12 2C8.5 2 6 4.5 6 7c0 1.5.6 2.8 1.5 3.8L7 12H5a2 2 0 00-2 2v1a5 5 0 005 5h8a5 5 0 005-5v-1a2 2 0 00-2-2h-2l-.5-1.2C17.4 9.8 18 8.5 18 7c0-2.5-2.5-5-6-5z" />
    <circle cx="15" cy="7" r="1" fill="currentColor" />
  </svg>
)

const IconFood = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M3 11l19-9-9 19-2-8-8-2z" />
  </svg>
)

const IconDashboard = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)

const IconTraining = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
)

const IconScheduler = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const IconLibrary = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
)

const IconYouTube = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M21.593 7.203a2.506 2.506 0 00-1.762-1.766C18.265 5.007 12 5 12 5s-6.264-.007-7.831.44a2.506 2.506 0 00-1.762 1.767C2.005 8.769 2 12.001 2 12.001s.005 3.232.407 4.797a2.506 2.506 0 001.762 1.767C5.736 19.002 12 19 12 19s6.265.002 7.831-.44a2.506 2.506 0 001.762-1.767C21.995 15.233 22 12.001 22 12.001s-.005-3.232-.407-4.798zM10 15.001V9l5.196 3.001L10 15.001z" />
  </svg>
)

const IconMic = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
)

const IconAI = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)

const IconResponses = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
)

const IconStation = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const IconRemote = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

const IconSettings = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)


const IconMenu = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)

const IconClose = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

// ── Navigation structure ──────────────────────────────────────────────────────

const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Mi Loro',
    items: [
      {
        to: '/parrot',
        label: 'Perfil del Loro',
        tooltip: 'Configura el nombre, especie y datos de tu loro',
        icon: <IconParrot />,
      },
      {
        to: '/feeding',
        label: 'Alimentacion',
        tooltip: 'Registra lo que come tu loro y consulta alimentos seguros',
        icon: <IconFood />,
      },
    ],
  },
  {
    heading: 'Entrenamiento',
    items: [
      {
        to: '/',
        label: 'Dashboard',
        tooltip: 'Resumen del dia: estadisticas y actividad reciente',
        icon: <IconDashboard />,
        exact: true,
      },
      {
        to: '/training',
        label: 'Sesiones',
        tooltip: 'Crea y ejecuta sesiones de entrenamiento para tu loro',
        icon: <IconTraining />,
      },
      {
        to: '/scheduler',
        label: 'Horarios',
        tooltip: 'Programa clips y sesiones para que suenen automaticamente',
        icon: <IconScheduler />,
      },
    ],
  },
  {
    heading: 'Audio',
    items: [
      {
        to: '/library',
        label: 'Biblioteca de Clips',
        tooltip: 'Todos los sonidos y palabras guardados para entrenar',
        icon: <IconLibrary />,
      },
      {
        to: '/youtube',
        label: 'Importar de YouTube',
        tooltip: 'Extrae audio de cualquier video de YouTube como clip',
        icon: <IconYouTube />,
      },
      {
        to: '/recordings',
        label: 'Grabaciones',
        tooltip: 'Escucha y clasifica las grabaciones del loro',
        icon: <IconMic />,
      },
    ],
  },
  {
    heading: 'Inteligencia',
    items: [
      {
        to: '/ai',
        label: 'Asistente IA',
        tooltip: 'Transcripciones, voz generada y analisis de progreso con IA',
        icon: <IconAI />,
      },
      {
        to: '/responses',
        label: 'Respuestas Auto',
        tooltip: 'Reglas automaticas que responden a sonidos o palabras',
        icon: <IconResponses />,
      },
    ],
  },
  {
    heading: 'Estacion',
    items: [
      {
        to: '/station',
        label: 'Modo Estacion',
        tooltip: 'Activa el modo continuo: la app escucha y responde sola',
        icon: <IconStation />,
      },
      {
        to: '/remote-control',
        label: 'Control Remoto',
        tooltip: 'Controla el Host remotamente: camara, walkie talkie y acciones',
        icon: <IconRemote />,
      },
    ],
  },
  {
    heading: 'Admin',
    items: [
      {
        to: '/settings',
        label: 'Configuracion',
        tooltip: 'API Keys, preferencias y ajustes de la estacion',
        icon: <IconSettings />,
      },
    ],
  },
]

// ── Sidebar nav item ──────────────────────────────────────────────────────────

interface SidebarNavItemProps {
  item: NavItem
  onNavigate?: () => void
}

const SidebarNavItem = ({ item, onNavigate }: SidebarNavItemProps) => (
  <Tooltip text={item.tooltip} position="right">
    <NavLink
      to={item.to}
      end={item.exact}
      onClick={onNavigate}
      title={item.tooltip}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
          isActive
            ? 'bg-brand-600 text-white'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800 active:bg-slate-700'
        }`
      }
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </NavLink>
  </Tooltip>
)

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const Sidebar = ({ open, onClose }: SidebarProps) => {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          ref={overlayRef}
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-40 w-64 bg-slate-900 border-r border-slate-800
          flex flex-col transition-transform duration-300
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:flex
        `}
        aria-label="Menu principal"
      >
        {/* Logo / header */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <IconParrot />
            </div>
            <span className="text-slate-100 font-bold text-lg tracking-tight">LoroApp</span>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            aria-label="Cerrar menu"
          >
            <IconClose />
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.heading}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-1.5">
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarNavItem
                    key={item.to}
                    item={item}
                    onNavigate={onClose}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom spacer */}
        <div className="px-3 py-3 shrink-0" />
      </aside>
    </>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

const Layout = () => {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isStation = location.pathname === '/station'

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const openSidebar = useCallback(() => setSidebarOpen(true), [])

  // Close sidebar on route change on mobile
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  if (isStation) {
    return <Outlet />
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden bg-slate-900 border-b border-slate-800 flex items-center gap-3 px-4 py-3 shrink-0">
          <button
            onClick={openSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            aria-label="Abrir menu"
            aria-expanded={sidebarOpen}
          >
            <IconMenu />
          </button>
          <span className="text-slate-100 font-bold text-base">LoroApp</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overscroll-none">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
