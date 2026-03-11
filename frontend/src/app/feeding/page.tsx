'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '@/core/api-client'
import { useToast } from '@/components/toast'
import type {
  FoodItem,
  FoodItemCreate,
  FoodItemUpdate,
  FoodCategory,
  FrequencyRecommendation,
  FeedingLog,
  FeedingLogCreate,
  FeedingPlan,
} from '@/types'

// ── Local types ──────────────────────────────────────────────────────────────

type FeedingTab = 'registro' | 'catalogo' | 'plan'
type SafetyFilter = 'all' | 'safe' | 'toxic' | 'occasional'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a display safety status from FoodItem flags */
function deriveSafety(food: FoodItem): 'safe' | 'toxic' | 'occasional' {
  if (food.is_toxic) return 'toxic'
  if (!food.is_safe) return 'occasional'
  // Items with frequency "occasional" or "never" are treated as occasional/toxic
  if (food.frequency_recommendation === 'never') return 'toxic'
  if (food.frequency_recommendation === 'occasional') return 'occasional'
  return 'safe'
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0] ?? ''
}

const SAFETY_COLORS: Record<'safe' | 'toxic' | 'occasional', string> = {
  safe: 'border-emerald-700/50 bg-emerald-900/20',
  toxic: 'border-red-700/50 bg-red-900/20',
  occasional: 'border-yellow-700/50 bg-yellow-900/20',
}

const SAFETY_BADGE: Record<'safe' | 'toxic' | 'occasional', string> = {
  safe: 'bg-emerald-800 text-emerald-200',
  toxic: 'bg-red-800 text-red-200',
  occasional: 'bg-yellow-800 text-yellow-200',
}

const SAFETY_LABEL: Record<'safe' | 'toxic' | 'occasional', string> = {
  safe: 'Seguro',
  toxic: 'TOXICO',
  occasional: 'Ocasional',
}

const CATEGORY_LABEL: Record<FoodCategory, string> = {
  fruit: 'Fruta',
  vegetable: 'Verdura',
  seed: 'Semilla',
  pellet: 'Pellet',
  nut: 'Fruto seco',
  protein: 'Proteina',
  grain: 'Grano',
  treat: 'Premio',
  toxic: 'Toxico',
}

const FREQUENCY_LABEL: Record<FrequencyRecommendation, string> = {
  daily: 'Diario',
  '3x_week': '3 veces por semana',
  occasional: 'Ocasional',
  never: 'NUNCA',
}

const inputClass =
  'w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-500 border border-slate-700'

// ── Registro tab ─────────────────────────────────────────────────────────────

interface RegistroTabProps {
  catalog: FoodItem[]
  parrotId: string | null
}

const RegistroTab = ({ catalog, parrotId }: RegistroTabProps) => {
  const { showToast } = useToast()
  const [logs, setLogs] = useState<FeedingLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [selectedFoodId, setSelectedFoodId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const safeCatalog = useMemo(
    () => catalog.filter((f) => !f.is_toxic && deriveSafety(f) !== 'toxic'),
    [catalog],
  )

  // Load feeding logs from backend
  const loadLogs = useCallback(async () => {
    if (!parrotId) return
    try {
      const data = await apiClient.get<FeedingLog[]>('/api/v1/feeding/logs', {
        parrot_id: parrotId,
        limit: 500,
      })
      setLogs(Array.isArray(data) ? data : [])
    } catch {
      showToast('Error al cargar registros de alimentacion', 'error')
    } finally {
      setLoading(false)
    }
  }, [parrotId, showToast])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const logsForDate = useMemo(() => {
    return logs
      .filter((l) => l.fed_at.startsWith(selectedDate))
      .sort((a, b) => b.fed_at.localeCompare(a.fed_at))
  }, [logs, selectedDate])

  const todayLogs = useMemo(
    () => logs.filter((l) => l.fed_at.startsWith(todayStr())),
    [logs],
  )

  // Weekly summary based on backend data
  const weeklySummary = useMemo(() => {
    const counts: Record<string, number> = {}
    Object.keys(CATEGORY_LABEL).forEach((cat) => { counts[cat] = 0 })
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const cutoff = sevenDaysAgo.toISOString()
    logs
      .filter((l) => l.fed_at >= cutoff)
      .forEach((l) => {
        const food = catalog.find((f) => f.id === l.food_item_id)
        if (food && counts[food.category] !== undefined) {
          counts[food.category] += 1
        }
      })
    return counts
  }, [logs, catalog])

  const handleAdd = useCallback(async () => {
    if (!parrotId) {
      showToast('Primero configura tu loro en el perfil', 'error')
      return
    }
    if (!selectedFoodId || !quantity.trim()) {
      showToast('Selecciona un alimento y agrega la cantidad', 'error')
      return
    }
    const food = catalog.find((f) => f.id === selectedFoodId)
    if (!food) return

    setSubmitting(true)
    try {
      const payload: FeedingLogCreate = {
        parrot_id: parrotId,
        food_item_id: food.id,
        food_name: food.name,
        quantity: quantity.trim(),
      }
      const newLog = await apiClient.post<FeedingLog>('/api/v1/feeding/logs', payload)
      setLogs((prev) => [newLog, ...prev])
      setQuantity('')
      setSelectedFoodId('')
      showToast(`${food.name} registrado`, 'success')
    } catch {
      showToast('Error al registrar alimento', 'error')
    } finally {
      setSubmitting(false)
    }
  }, [parrotId, selectedFoodId, quantity, catalog, showToast])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await apiClient.del(`/api/v1/feeding/logs/${id}`)
      setLogs((prev) => prev.filter((l) => l.id !== id))
      showToast('Registro eliminado', 'info')
    } catch {
      showToast('Error al eliminar registro', 'error')
    }
  }, [showToast])

  if (!parrotId) {
    return (
      <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-6 text-center">
        <p className="text-amber-300 text-sm font-semibold">Perfil de loro no configurado</p>
        <p className="text-amber-200/70 text-xs mt-1">
          Ve a la seccion de perfil para crear tu loro antes de registrar alimentacion.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Quick add */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Registrar alimento
        </h2>
        <div className="bg-slate-800 rounded-xl p-4 space-y-3">
          <select
            value={selectedFoodId}
            onChange={(e) => setSelectedFoodId(e.target.value)}
            className={inputClass}
          >
            <option value="">Seleccionar alimento...</option>
            {safeCatalog.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({CATEGORY_LABEL[f.category]})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Cantidad (ej: 1 trozo)"
              className={`flex-1 ${inputClass}`}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
            />
            <button
              onClick={() => void handleAdd()}
              disabled={submitting}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors min-w-[90px] active:scale-[0.98]"
            >
              {submitting ? '...' : 'Registrar'}
            </button>
          </div>
        </div>
      </section>

      {/* Weekly summary */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Ultimos 7 dias
        </h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {(Object.entries(weeklySummary)).map(([cat, count]) => (
            <div key={cat} className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-slate-100 tabular-nums">{count}</p>
              <p className="text-xs text-slate-400">{CATEGORY_LABEL[cat as FoodCategory] ?? cat}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Date picker + logs */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Historial</h2>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-800 text-slate-100 px-3 py-1.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700"
          />
          {selectedDate === todayStr() && (
            <span className="text-xs text-emerald-400 font-medium">Hoy</span>
          )}
        </div>

        {loading ? (
          <div className="bg-slate-800/60 rounded-xl p-6 text-center">
            <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-500 mt-2">Cargando registros...</p>
          </div>
        ) : logsForDate.length === 0 ? (
          <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-6 text-center">
            <p className="text-sm text-slate-500">Sin registros para este dia</p>
            {selectedDate === todayStr() && (
              <p className="text-xs text-slate-600 mt-1">Usa el formulario de arriba para registrar</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {logsForDate.map((log) => {
              const time = new Date(log.fed_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={log.id} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-900/40 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-100 text-sm font-medium truncate">{log.food_name}</p>
                    <p className="text-slate-400 text-xs">
                      {log.quantity ?? ''}{log.quantity ? ' \u00b7 ' : ''}{time}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleDelete(log.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                    aria-label="Eliminar registro"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

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

// ── Catalogo tab ─────────────────────────────────────────────────────────────

interface CatalogoTabProps {
  catalog: FoodItem[]
  onReload: () => void
}

const CatalogoTab = ({ catalog, onReload }: CatalogoTabProps) => {
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [filterSafety, setFilterSafety] = useState<SafetyFilter>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Add form state
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<FoodCategory>('fruit')
  const [newIsSafe, setNewIsSafe] = useState(true)
  const [newIsToxic, setNewIsToxic] = useState(false)
  const [newFrequency, setNewFrequency] = useState<FrequencyRecommendation | ''>('')
  const [newNotes, setNewNotes] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState<FoodCategory>('fruit')
  const [editIsSafe, setEditIsSafe] = useState(true)
  const [editIsToxic, setEditIsToxic] = useState(false)
  const [editFrequency, setEditFrequency] = useState<FrequencyRecommendation | ''>('')
  const [editNotes, setEditNotes] = useState('')

  const filtered = useMemo(() => {
    return catalog.filter((f) => {
      const matchSearch = f.name.toLowerCase().includes(search.toLowerCase())
      const safety = deriveSafety(f)
      const matchSafety = filterSafety === 'all' || safety === filterSafety
      return matchSearch && matchSafety
    })
  }, [catalog, search, filterSafety])

  const handleAddCustom = useCallback(async () => {
    if (!newName.trim()) {
      showToast('El nombre del alimento es obligatorio', 'error')
      return
    }
    setSubmitting(true)
    try {
      const payload: FoodItemCreate = {
        name: newName.trim(),
        category: newCategory,
        is_safe: newIsSafe,
        is_toxic: newIsToxic,
        frequency_recommendation: newFrequency || undefined,
        notes: newNotes.trim() || undefined,
      }
      await apiClient.post<FoodItem>('/api/v1/feeding/foods', payload)
      onReload()
      setNewName('')
      setNewNotes('')
      setNewFrequency('')
      setNewIsSafe(true)
      setNewIsToxic(false)
      setShowAddForm(false)
      showToast('Alimento agregado al catalogo', 'success')
    } catch {
      showToast('Error al agregar alimento', 'error')
    } finally {
      setSubmitting(false)
    }
  }, [newName, newCategory, newIsSafe, newIsToxic, newFrequency, newNotes, onReload, showToast])

  const startEdit = useCallback((food: FoodItem) => {
    setEditingId(food.id)
    setEditName(food.name)
    setEditCategory(food.category)
    setEditIsSafe(food.is_safe)
    setEditIsToxic(food.is_toxic)
    setEditFrequency(food.frequency_recommendation ?? '')
    setEditNotes(food.notes ?? '')
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editName.trim()) {
      showToast('El nombre es obligatorio', 'error')
      return
    }
    setSubmitting(true)
    try {
      const payload: FoodItemUpdate = {
        name: editName.trim(),
        category: editCategory,
        is_safe: editIsSafe,
        is_toxic: editIsToxic,
        frequency_recommendation: editFrequency || undefined,
        notes: editNotes.trim() || undefined,
      }
      await apiClient.put<FoodItem>(`/api/v1/feeding/foods/${editingId}`, payload)
      onReload()
      setEditingId(null)
      showToast('Alimento actualizado', 'success')
    } catch {
      showToast('Error al actualizar alimento', 'error')
    } finally {
      setSubmitting(false)
    }
  }, [editingId, editName, editCategory, editIsSafe, editIsToxic, editFrequency, editNotes, onReload, showToast])

  return (
    <div className="space-y-4">
      {/* Search and filters */}
      <div className="space-y-2">
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

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'safe', 'occasional', 'toxic'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterSafety(s)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterSafety === s
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s === 'all' ? 'Todos' : SAFETY_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Add button */}
      <button
        onClick={() => setShowAddForm(!showAddForm)}
        className="w-full py-2.5 border border-dashed border-slate-600 rounded-xl text-slate-400 text-sm hover:text-slate-200 hover:border-slate-500 transition-colors"
      >
        {showAddForm ? 'Cancelar' : '+ Agregar alimento personalizado'}
      </button>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-slate-800 rounded-xl p-4 space-y-3 border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300">Nuevo alimento</h3>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del alimento"
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as FoodCategory)}
              className={inputClass}
            >
              {(Object.entries(CATEGORY_LABEL) as [FoodCategory, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select
              value={newFrequency}
              onChange={(e) => setNewFrequency(e.target.value as FrequencyRecommendation)}
              className={inputClass}
            >
              <option value="">Frecuencia...</option>
              {(Object.entries(FREQUENCY_LABEL) as [FrequencyRecommendation, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={newIsSafe}
                onChange={(e) => { setNewIsSafe(e.target.checked); if (e.target.checked) setNewIsToxic(false) }}
                className="rounded border-slate-600"
              />
              Seguro
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={newIsToxic}
                onChange={(e) => { setNewIsToxic(e.target.checked); if (e.target.checked) setNewIsSafe(false) }}
                className="rounded border-slate-600"
              />
              Toxico
            </label>
          </div>
          <textarea
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Notas adicionales..."
            rows={2}
            className={`${inputClass} resize-none`}
          />
          <button
            onClick={() => void handleAddCustom()}
            disabled={submitting}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors active:scale-[0.98]"
          >
            {submitting ? 'Guardando...' : 'Agregar al catalogo'}
          </button>
        </div>
      )}

      {/* Food grid */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-6 text-center">
            <p className="text-sm text-slate-500">No se encontraron alimentos</p>
          </div>
        ) : (
          filtered.map((food) => {
            const safety = deriveSafety(food)
            const isEditing = editingId === food.id

            if (isEditing) {
              return (
                <div key={food.id} className="bg-slate-800 rounded-xl p-4 space-y-3 border border-emerald-700/50">
                  <h3 className="text-sm font-semibold text-slate-300">Editar alimento</h3>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nombre del alimento"
                    className={inputClass}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as FoodCategory)}
                      className={inputClass}
                    >
                      {(Object.entries(CATEGORY_LABEL) as [FoodCategory, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    <select
                      value={editFrequency}
                      onChange={(e) => setEditFrequency(e.target.value as FrequencyRecommendation)}
                      className={inputClass}
                    >
                      <option value="">Frecuencia...</option>
                      {(Object.entries(FREQUENCY_LABEL) as [FrequencyRecommendation, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={editIsSafe}
                        onChange={(e) => { setEditIsSafe(e.target.checked); if (e.target.checked) setEditIsToxic(false) }}
                        className="rounded border-slate-600"
                      />
                      Seguro
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={editIsToxic}
                        onChange={(e) => { setEditIsToxic(e.target.checked); if (e.target.checked) setEditIsSafe(false) }}
                        className="rounded border-slate-600"
                      />
                      Toxico
                    </label>
                  </div>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notas adicionales..."
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleSaveEdit()}
                      disabled={submitting}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
                    >
                      {submitting ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={food.id}
                className={`rounded-xl p-4 border ${SAFETY_COLORS[safety]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {safety === 'toxic' && (
                        <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      )}
                      <p className="text-slate-100 font-semibold text-sm">{food.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SAFETY_BADGE[safety]}`}>
                        {SAFETY_LABEL[safety]}
                      </span>
                      <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
                        {CATEGORY_LABEL[food.category]}
                      </span>
                    </div>
                    {food.frequency_recommendation && (
                      <p className="text-slate-400 text-xs mt-1">
                        {FREQUENCY_LABEL[food.frequency_recommendation]}
                      </p>
                    )}
                    {food.notes && (
                      <p className="text-slate-500 text-xs mt-0.5 italic">{food.notes}</p>
                    )}
                  </div>
                  {/* Edit button */}
                  <button
                    onClick={() => startEdit(food)}
                    className="p-1.5 text-slate-500 hover:text-emerald-400 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                    aria-label="Editar alimento"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Plan IA tab ──────────────────────────────────────────────────────────────

interface PlanIATabProps {
  parrotId: string | null
}

const PlanIATab = ({ parrotId }: PlanIATabProps) => {
  const { showToast } = useToast()
  const [generating, setGenerating] = useState(false)
  const [plan, setPlan] = useState<FeedingPlan | null>(null)

  const handleGenerate = useCallback(async () => {
    if (!parrotId) {
      showToast('Primero configura tu loro en el perfil', 'error')
      return
    }
    setGenerating(true)
    try {
      const result = await apiClient.post<FeedingPlan>('/api/v1/feeding/suggest-plan', {
        parrot_id: parrotId,
      })
      setPlan(result)
      showToast('Plan semanal generado correctamente', 'success')
    } catch {
      showToast('Error al generar plan. Intenta de nuevo.', 'error')
    } finally {
      setGenerating(false)
    }
  }, [parrotId, showToast])

  // Render plan_data as weekly meals if available
  const weeklyMeals = useMemo(() => {
    if (!plan?.plan_data) return null
    const data = plan.plan_data
    // Try to interpret plan_data - it could be { days: [...] } or a direct array
    if (Array.isArray(data['days'])) {
      return data['days'] as { day: string; meals: { time: string; foods: string; notes: string }[] }[]
    }
    // Fallback: generate a default display
    return null
  }, [plan])

  return (
    <div className="space-y-5">
      {/* Generator card */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Plan semanal con IA
        </h2>
        <div className="bg-slate-800 rounded-xl p-4 space-y-3">
          <p className="text-slate-400 text-sm">
            Gemini genera un plan personalizado segun la especie, edad y preferencias de tu loro
          </p>
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-3">
            <p className="text-blue-300 text-xs">
              Para mejores resultados, completa el perfil de tu loro antes de generar el plan.
            </p>
          </div>
          <button
            onClick={() => void handleGenerate()}
            disabled={generating || !parrotId}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium text-sm rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98]"
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
        </div>
      </section>

      {weeklyMeals && (
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Tu plan
          </h2>
          <div className="space-y-2">
            {weeklyMeals.map((day) => (
              <div key={day.day} className="bg-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-700/50 px-4 py-2">
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
          </div>
        </section>
      )}

      {/* Show raw plan data if format is not recognized */}
      {plan && !weeklyMeals && (
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Tu plan
          </h2>
          <div className="bg-slate-800 rounded-xl p-4">
            <pre className="text-slate-300 text-xs whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(plan.plan_data, null, 2)}
            </pre>
          </div>
        </section>
      )}

      <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 space-y-2">
        <p className="text-amber-300 text-sm font-semibold">Notas nutricionales</p>
        <ul className="space-y-1 text-amber-200/80 text-xs">
          <li>- El agua fresca debe estar siempre disponible</li>
          <li>- Evitar aguacate, chocolate, cafe, cebolla y alimentos con sal</li>
          <li>- Variar las frutas y verduras para diversidad nutricional</li>
          <li>- Consultar con un veterinario aviar para ajustes especificos</li>
        </ul>
      </div>

      {!plan && !generating && (
        <div className="bg-slate-800/60 border border-slate-700/50 border-dashed rounded-xl p-8 text-center">
          <svg className="w-10 h-10 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <p className="text-sm text-slate-500">Presiona el boton para generar un plan</p>
          <p className="text-xs text-slate-600 mt-1">La IA creara una dieta balanceada para tu loro</p>
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

interface ParrotResponse {
  id: string
  name: string
  [key: string]: unknown
}

const FeedingPage = () => {
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<FeedingTab>('registro')
  const [catalog, setCatalog] = useState<FoodItem[]>([])
  const [parrotId, setParrotId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load parrot profile and food catalog from backend
  const loadData = useCallback(async () => {
    try {
      const [parrotData, foodsData] = await Promise.all([
        apiClient.get<ParrotResponse | null>('/api/v1/parrot/'),
        apiClient.get<FoodItem[]>('/api/v1/feeding/foods', { limit: 500 }),
      ])
      if (parrotData?.id) {
        setParrotId(parrotData.id)
      }
      setCatalog(Array.isArray(foodsData) ? foodsData : [])
    } catch {
      showToast('Error al cargar datos de alimentacion', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const reloadCatalog = useCallback(async () => {
    try {
      const data = await apiClient.get<FoodItem[]>('/api/v1/feeding/foods', { limit: 500 })
      setCatalog(Array.isArray(data) ? data : [])
    } catch {
      // Silent fail, catalog already loaded
    }
  }, [])

  const tabs: { key: FeedingTab; label: string }[] = [
    { key: 'registro', label: 'Registro' },
    { key: 'catalogo', label: 'Catalogo' },
    { key: 'plan', label: 'Plan IA' },
  ]

  if (loading) {
    return (
      <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
        <div className="pt-2">
          <h1 className="text-xl font-bold text-slate-100">Alimentacion</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Alimentacion</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Controla la dieta y nutricion de tu loro
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 px-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === tab.key
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'registro' && <RegistroTab catalog={catalog} parrotId={parrotId} />}
      {activeTab === 'catalogo' && (
        <CatalogoTab catalog={catalog} onReload={() => void reloadCatalog()} />
      )}
      {activeTab === 'plan' && <PlanIATab parrotId={parrotId} />}
    </div>
  )
}

export default FeedingPage
