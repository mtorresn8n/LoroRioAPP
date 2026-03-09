import { useCallback, useMemo, useState } from 'react'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

type FoodSafety = 'safe' | 'toxic' | 'occasional'
type FoodCategory = 'fruit' | 'vegetable' | 'seed' | 'pellet' | 'protein' | 'other'
type FeedingTab = 'registro' | 'catalogo' | 'plan'

interface FoodItem {
  id: string
  name: string
  category: FoodCategory
  safety: FoodSafety
  frequency: string
  notes: string
}

interface FeedingLog {
  id: string
  foodId: string
  foodName: string
  quantity: string
  date: string
  time: string
}

interface WeeklyMeal {
  day: string
  meals: { time: string; foods: string; notes: string }[]
}

const STORAGE_LOGS_KEY = 'loro:feeding-logs'
const STORAGE_CATALOG_KEY = 'loro:feeding-catalog'

// ── Default catalog ───────────────────────────────────────────────────────────

const DEFAULT_CATALOG: FoodItem[] = [
  { id: 'f1', name: 'Manzana', category: 'fruit', safety: 'safe', frequency: 'Diario', notes: 'Sin semillas' },
  { id: 'f2', name: 'Mango', category: 'fruit', safety: 'safe', frequency: 'Varias veces por semana', notes: '' },
  { id: 'f3', name: 'Banana', category: 'fruit', safety: 'safe', frequency: 'Con moderacion', notes: 'Alta en azucar' },
  { id: 'f4', name: 'Uvas', category: 'fruit', safety: 'safe', frequency: 'Ocasional', notes: 'Sin semillas' },
  { id: 'f5', name: 'Aguacate (Palta)', category: 'fruit', safety: 'toxic', frequency: 'NUNCA', notes: 'Extremadamente toxico para loros' },
  { id: 'f6', name: 'Zanahoria', category: 'vegetable', safety: 'safe', frequency: 'Diario', notes: 'Rica en vitamina A' },
  { id: 'f7', name: 'Brocoli', category: 'vegetable', safety: 'safe', frequency: 'Varias veces por semana', notes: '' },
  { id: 'f8', name: 'Espinaca', category: 'vegetable', safety: 'occasional', frequency: 'Ocasional', notes: 'Puede interferir con calcio' },
  { id: 'f9', name: 'Cebolla', category: 'vegetable', safety: 'toxic', frequency: 'NUNCA', notes: 'Toxico para aves' },
  { id: 'f10', name: 'Girasol', category: 'seed', safety: 'occasional', frequency: 'Ocasional', notes: 'Alta en grasa, no como base' },
  { id: 'f11', name: 'Pellet Harrison', category: 'pellet', safety: 'safe', frequency: 'Diario (base)', notes: 'Dieta balanceada completa' },
  { id: 'f12', name: 'Huevo cocido', category: 'protein', safety: 'safe', frequency: 'Una o dos veces por semana', notes: 'Buena fuente de proteina' },
  { id: 'f13', name: 'Chocolate', category: 'other', safety: 'toxic', frequency: 'NUNCA', notes: 'Extremadamente toxico' },
  { id: 'f14', name: 'Cafe', category: 'other', safety: 'toxic', frequency: 'NUNCA', notes: 'Toxico para aves' },
  { id: 'f15', name: 'Naranja', category: 'fruit', safety: 'safe', frequency: 'Varias veces por semana', notes: '' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadLogs(): FeedingLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_LOGS_KEY)
    return raw ? (JSON.parse(raw) as FeedingLog[]) : []
  } catch {
    return []
  }
}

function saveLogs(logs: FeedingLog[]): void {
  localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(logs))
}

function loadCatalog(): FoodItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_CATALOG_KEY)
    return raw ? (JSON.parse(raw) as FoodItem[]) : DEFAULT_CATALOG
  } catch {
    return DEFAULT_CATALOG
  }
}

function saveCatalog(items: FoodItem[]): void {
  localStorage.setItem(STORAGE_CATALOG_KEY, JSON.stringify(items))
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0] ?? ''
}

function nowTimeStr(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}

const SAFETY_COLORS: Record<FoodSafety, string> = {
  safe: 'border-emerald-600 bg-emerald-900/20',
  toxic: 'border-red-600 bg-red-900/20',
  occasional: 'border-yellow-600 bg-yellow-900/20',
}

const SAFETY_BADGE: Record<FoodSafety, string> = {
  safe: 'bg-emerald-800 text-emerald-200',
  toxic: 'bg-red-800 text-red-200',
  occasional: 'bg-yellow-800 text-yellow-200',
}

const SAFETY_LABEL: Record<FoodSafety, string> = {
  safe: 'Seguro',
  toxic: 'TOXICO',
  occasional: 'Ocasional',
}

const CATEGORY_LABEL: Record<FoodCategory, string> = {
  fruit: 'Fruta',
  vegetable: 'Verdura',
  seed: 'Semilla',
  pellet: 'Pellet',
  protein: 'Proteina',
  other: 'Otro',
}

const WEEKLY_DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']

// ── Registro tab ──────────────────────────────────────────────────────────────

interface RegistroTabProps {
  catalog: FoodItem[]
}

const RegistroTab = ({ catalog: catalogProp }: RegistroTabProps) => {
  const { showToast } = useToast()
  const [logs, setLogs] = useState<FeedingLog[]>(() => loadLogs())
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [selectedFoodId, setSelectedFoodId] = useState('')
  const [quantity, setQuantity] = useState('')

  const safeCatalog = catalogProp.filter((f) => f.safety !== 'toxic')

  const logsForDate = useMemo(
    () => logs.filter((l) => l.date === selectedDate).sort((a, b) => b.time.localeCompare(a.time)),
    [logs, selectedDate],
  )

  const todayLogs = useMemo(() => logs.filter((l) => l.date === todayStr()), [logs])

  const weeklySummary = useMemo(() => {
    const counts: Record<FoodCategory, number> = {
      fruit: 0, vegetable: 0, seed: 0, pellet: 0, protein: 0, other: 0,
    }
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const cutoff = sevenDaysAgo.toISOString().split('T')[0] ?? ''
    logs.filter((l) => l.date >= cutoff).forEach((l) => {
      const food = catalogProp.find((f) => f.id === l.foodId)
      if (food) counts[food.category] += 1
    })
    return counts
  }, [logs, catalogProp])

  const handleAdd = useCallback(() => {
    if (!selectedFoodId || !quantity.trim()) {
      showToast('Selecciona un alimento y agrega la cantidad', 'error')
      return
    }
    const food = catalogProp.find((f) => f.id === selectedFoodId)
    if (!food) return
    const newLog: FeedingLog = {
      id: `log-${Date.now()}`,
      foodId: food.id,
      foodName: food.name,
      quantity: quantity.trim(),
      date: todayStr(),
      time: nowTimeStr(),
    }
    const updated = [newLog, ...logs]
    setLogs(updated)
    saveLogs(updated)
    setQuantity('')
    setSelectedFoodId('')
    showToast(`${food.name} registrado`, 'success')
  }, [selectedFoodId, quantity, logs, catalogProp, showToast])

  const handleDelete = useCallback((id: string) => {
    const updated = logs.filter((l) => l.id !== id)
    setLogs(updated)
    saveLogs(updated)
    showToast('Registro eliminado', 'info')
  }, [logs, showToast])

  return (
    <div className="space-y-5">
      {/* Quick add */}
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Registrar alimento de hoy</h2>
        <Tooltip text="Selecciona que le diste de comer a tu loro" position="top">
          <select
            value={selectedFoodId}
            onChange={(e) => setSelectedFoodId(e.target.value)}
            className="w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Seleccionar alimento...</option>
            {safeCatalog.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({CATEGORY_LABEL[f.category]})</option>
            ))}
          </select>
        </Tooltip>
        <div className="flex gap-2">
          <Tooltip text="Cuanto le diste (ej: 1 trozo, 30g, un cuarto de fruta)" position="top">
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Cantidad (ej: 1 trozo)"
              className="flex-1 bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            />
          </Tooltip>
          <Tooltip text="Guardar este alimento en el registro de hoy" position="top">
            <button
              onClick={handleAdd}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors min-w-[90px]"
            >
              Registrar
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Weekly summary */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Resumen ultimos 7 dias</h2>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(weeklySummary) as [FoodCategory, number][]).map(([cat, count]) => (
            <div key={cat} className="bg-slate-700 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-slate-100">{count}</p>
              <p className="text-xs text-slate-400">{CATEGORY_LABEL[cat]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Date picker + logs */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm font-medium text-slate-300 shrink-0">Ver dia:</label>
          <Tooltip text="Cambia la fecha para ver que comio tu loro ese dia" position="top">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-800 text-slate-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700"
            />
          </Tooltip>
          {selectedDate === todayStr() && (
            <span className="text-xs text-emerald-400 font-medium">Hoy</span>
          )}
        </div>

        {logsForDate.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <svg className="w-10 h-10 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">Sin registros para este dia</p>
            {selectedDate === todayStr() && (
              <p className="text-xs mt-1">Usa el formulario de arriba para registrar</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {logsForDate.map((log) => (
              <div key={log.id} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-100 text-sm font-medium truncate">{log.foodName}</p>
                  <p className="text-slate-400 text-xs">{log.quantity} &middot; {log.time}</p>
                </div>
                <Tooltip text="Eliminar este registro de alimentacion" position="left">
                  <button
                    onClick={() => handleDelete(log.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                    aria-label="Eliminar registro"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today summary at bottom */}
      {todayLogs.length > 0 && selectedDate !== todayStr() && (
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
          <p className="text-xs text-slate-400">
            Hoy registraste <strong className="text-slate-200">{todayLogs.length}</strong> alimentos
          </p>
        </div>
      )}
    </div>
  )
}

// ── Catalogo tab ──────────────────────────────────────────────────────────────

interface CatalogoTabProps {
  catalog: FoodItem[]
  onCatalogChange: (updated: FoodItem[]) => void
}

const CatalogoTab = ({ catalog, onCatalogChange }: CatalogoTabProps) => {
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const filterCat: FoodCategory | 'all' = 'all'
  const [filterSafety, setFilterSafety] = useState<FoodSafety | 'all'>('all')
  const [showAddForm, setShowAddForm] = useState(false)

  // Add form state
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<FoodCategory>('fruit')
  const [newSafety, setNewSafety] = useState<FoodSafety>('safe')
  const [newFrequency, setNewFrequency] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const filtered = useMemo(() => {
    return catalog.filter((f) => {
      const matchSearch = f.name.toLowerCase().includes(search.toLowerCase())
      const matchCat = filterCat === 'all' || f.category === filterCat
      const matchSafety = filterSafety === 'all' || f.safety === filterSafety
      return matchSearch && matchCat && matchSafety
    })
  }, [catalog, search, filterCat, filterSafety])

  const handleAddCustom = useCallback(() => {
    if (!newName.trim()) {
      showToast('El nombre del alimento es obligatorio', 'error')
      return
    }
    const newItem: FoodItem = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      category: newCategory,
      safety: newSafety,
      frequency: newFrequency.trim() || 'Segun criterio',
      notes: newNotes.trim(),
    }
    const updated = [...catalog, newItem]
    onCatalogChange(updated)
    saveCatalog(updated)
    setNewName('')
    setNewFrequency('')
    setNewNotes('')
    setShowAddForm(false)
    showToast(`${newItem.name} agregado al catalogo`, 'success')
  }, [newName, newCategory, newSafety, newFrequency, newNotes, catalog, onCatalogChange, showToast])

  return (
    <div className="space-y-4">
      {/* Search and filters */}
      <div className="space-y-2">
        <Tooltip text="Busca un alimento por nombre" position="top">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar alimento..."
              className="w-full bg-slate-800 text-slate-100 pl-9 pr-4 py-2.5 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </Tooltip>

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'safe', 'occasional', 'toxic'] as const).map((s) => (
            <Tooltip key={s} text={s === 'all' ? 'Ver todos' : `Filtrar por: ${SAFETY_LABEL[s] ?? ''}`} position="top">
              <button
                onClick={() => setFilterSafety(s)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterSafety === s
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s === 'all' ? 'Todos' : SAFETY_LABEL[s]}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Add button */}
      <Tooltip text="Agregar un alimento personalizado al catalogo" position="top">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="w-full py-2.5 border border-dashed border-slate-600 rounded-xl text-slate-400 text-sm hover:text-slate-200 hover:border-slate-500 transition-colors"
        >
          {showAddForm ? 'Cancelar' : '+ Agregar alimento personalizado'}
        </button>
      </Tooltip>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-slate-800 rounded-xl p-4 space-y-3 border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300">Nuevo alimento</h3>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del alimento"
            className="w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as FoodCategory)}
              className="w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            >
              {(Object.entries(CATEGORY_LABEL) as [FoodCategory, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select
              value={newSafety}
              onChange={(e) => setNewSafety(e.target.value as FoodSafety)}
              className="w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            >
              <option value="safe">Seguro</option>
              <option value="occasional">Ocasional</option>
              <option value="toxic">Toxico</option>
            </select>
          </div>
          <input
            type="text"
            value={newFrequency}
            onChange={(e) => setNewFrequency(e.target.value)}
            placeholder="Frecuencia (ej: Diario, Ocasional)"
            className="w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none placeholder:text-slate-500"
          />
          <textarea
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Notas adicionales..."
            rows={2}
            className="w-full bg-slate-700 text-slate-100 px-3 py-2.5 rounded-lg text-sm focus:outline-none placeholder:text-slate-500 resize-none"
          />
          <button
            onClick={handleAddCustom}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Agregar al catalogo
          </button>
        </div>
      )}

      {/* Food grid */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center py-8 text-slate-500 text-sm">No se encontraron alimentos</p>
        ) : (
          filtered.map((food) => (
            <div
              key={food.id}
              className={`rounded-xl p-4 border ${SAFETY_COLORS[food.safety]} ${food.safety === 'toxic' ? 'ring-1 ring-red-700' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {food.safety === 'toxic' && (
                      <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    )}
                    <p className="text-slate-100 font-semibold text-sm">{food.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SAFETY_BADGE[food.safety]}`}>
                      {SAFETY_LABEL[food.safety]}
                    </span>
                    <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
                      {CATEGORY_LABEL[food.category]}
                    </span>
                  </div>
                  {food.frequency && (
                    <p className="text-slate-400 text-xs mt-1">{food.frequency}</p>
                  )}
                  {food.notes && (
                    <p className="text-slate-500 text-xs mt-0.5 italic">{food.notes}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Plan IA tab ───────────────────────────────────────────────────────────────

const PlanIATab = () => {
  const { showToast } = useToast()
  const [generating, setGenerating] = useState(false)
  const [plan, setPlan] = useState<WeeklyMeal[] | null>(null)

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    // Simulate AI generation - in production, call /api/v1/ai/feeding-plan
    await new Promise<void>((r) => setTimeout(r, 1800))

    const generatedPlan: WeeklyMeal[] = WEEKLY_DAYS.map((day) => ({
      day,
      meals: [
        {
          time: '08:00',
          foods: 'Pellet Harrison (base) + zanahoria rallada',
          notes: 'Comida principal del dia',
        },
        {
          time: '12:00',
          foods: 'Fruta fresca de temporada (manzana o naranja)',
          notes: 'Sin semillas ni carozos',
        },
        {
          time: '17:00',
          foods: 'Verdura fresca (brocoli o espinaca) + pellet',
          notes: 'Ultima comida del dia',
        },
      ],
    }))

    setPlan(generatedPlan)
    setGenerating(false)
    showToast('Plan semanal generado correctamente', 'success')
  }, [showToast])

  return (
    <div className="space-y-5">
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Plan de alimentacion semanal con IA</h2>
          <p className="text-slate-400 text-xs mt-1">
            Gemini genera un plan personalizado segun la especie, edad y preferencias de tu loro
          </p>
        </div>
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
          <p className="text-blue-300 text-xs">
            Para mejores resultados, completa el perfil de tu loro (especie y edad) antes de generar el plan.
          </p>
        </div>
        <Tooltip text="Gemini genera un plan personalizado segun la edad y dieta de tu loro" position="top">
          <button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium text-sm rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[48px]"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generando plan...
              </>
            ) : (
              'Generar plan semanal'
            )}
          </button>
        </Tooltip>
      </div>

      {plan && (
        <div className="space-y-3">
          {plan.map((day) => (
            <div key={day.day} className="bg-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-700 px-4 py-2">
                <p className="text-sm font-semibold text-slate-200">{day.day}</p>
              </div>
              <div className="p-4 space-y-3">
                {day.meals.map((meal, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-xs text-emerald-400 font-mono shrink-0 pt-0.5 w-10">{meal.time}</span>
                    <div>
                      <p className="text-slate-100 text-sm">{meal.foods}</p>
                      {meal.notes && (
                        <p className="text-slate-500 text-xs mt-0.5">{meal.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 space-y-2">
            <p className="text-amber-300 text-sm font-semibold">Notas nutricionales</p>
            <ul className="space-y-1 text-amber-200/80 text-xs">
              <li>- El agua fresca debe estar siempre disponible</li>
              <li>- Evitar aguacate, chocolate, cafe, cebolla y alimentos con sal</li>
              <li>- Variar las frutas y verduras para diversidad nutricional</li>
              <li>- Consultar con un veterinario aviar para ajustes especificos</li>
            </ul>
          </div>
        </div>
      )}

      {!plan && !generating && (
        <div className="text-center py-12 text-slate-500">
          <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <p className="text-sm">Presiona el boton para generar un plan</p>
          <p className="text-xs mt-1">La IA creara una dieta balanceada para tu loro</p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const FeedingPage = () => {
  const [activeTab, setActiveTab] = useState<FeedingTab>('registro')
  const [catalog, setCatalog] = useState<FoodItem[]>(() => loadCatalog())

  const handleCatalogChange = useCallback((updated: FoodItem[]) => {
    setCatalog(updated)
    saveCatalog(updated)
  }, [])

  const tabs: { key: FeedingTab; label: string; tooltip: string }[] = [
    { key: 'registro', label: 'Registro', tooltip: 'Anota lo que comio tu loro hoy' },
    { key: 'catalogo', label: 'Catalogo', tooltip: 'Ver alimentos seguros y toxicos' },
    { key: 'plan', label: 'Plan IA', tooltip: 'Genera un plan semanal con inteligencia artificial' },
  ]

  return (
    <div className="max-w-lg mx-auto p-4 pb-10 space-y-5">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Alimentacion</h1>
        <p className="text-slate-400 text-sm mt-1">
          Controla la dieta y nutricion de tu loro
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {tabs.map((tab) => (
          <Tooltip key={tab.key} text={tab.tooltip} position="bottom">
            <button
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'registro' && <RegistroTab catalog={catalog} />}
      {activeTab === 'catalogo' && (
        <CatalogoTab catalog={catalog} onCatalogChange={handleCatalogChange} />
      )}
      {activeTab === 'plan' && <PlanIATab />}
    </div>
  )
}

export default FeedingPage
