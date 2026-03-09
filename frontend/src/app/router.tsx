import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from '@/app/layout'

const DashboardPage = lazy(() => import('@/app/dashboard/page'))
const LibraryPage = lazy(() => import('@/app/library/page'))
const YoutubePage = lazy(() => import('@/app/youtube/page'))
const TrainingPage = lazy(() => import('@/app/training/page'))
const RecordingsPage = lazy(() => import('@/app/recordings/page'))
const SchedulerPage = lazy(() => import('@/app/scheduler/page'))
const ResponsesPage = lazy(() => import('@/app/responses/page'))
const AiPage = lazy(() => import('@/app/ai/page'))
const SettingsPage = lazy(() => import('@/app/settings/page'))
const StationPage = lazy(() => import('@/app/station/page'))
const ParrotPage = lazy(() => import('@/app/parrot/page'))
const FeedingPage = lazy(() => import('@/app/feeding/page'))

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    <p className="text-slate-500 text-sm">Cargando...</p>
  </div>
)

const AppRouter = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="youtube" element={<YoutubePage />} />
        <Route path="training" element={<TrainingPage />} />
        <Route path="recordings" element={<RecordingsPage />} />
        <Route path="scheduler" element={<SchedulerPage />} />
        <Route path="responses" element={<ResponsesPage />} />
        <Route path="ai" element={<AiPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="station" element={<StationPage />} />
        <Route path="parrot" element={<ParrotPage />} />
        <Route path="feeding" element={<FeedingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </Suspense>
)

export default AppRouter
