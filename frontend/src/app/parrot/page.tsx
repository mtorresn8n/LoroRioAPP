import { useCallback, useEffect, useRef, useState } from 'react'
import { Tooltip } from '@/components/tooltip'
import { useToast } from '@/components/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

type Sex = 'male' | 'female' | 'unknown'

interface ParrotProfile {
  name: string
  species: string
  birthDate: string
  adoptionDate: string
  weightGrams: string
  sex: Sex
  notes: string
  avatarUrl: string | null
}

const STORAGE_KEY = 'loro:parrot-profile'

const SPECIES_OPTIONS = [
  { value: 'african_grey', label: 'Loro Gris Africano' },
  { value: 'cockatiel', label: 'Cockatiel (Ninfa)' },
  { value: 'budgerigar', label: 'Periquito (Budgerigar)' },
  { value: 'macaw', label: 'Guacamayo (Macaw)' },
  { value: 'amazon', label: 'Loro Amazona' },
  { value: 'conure', label: 'Cotorra (Conure)' },
  { value: 'lovebird', label: 'Inseparable (Lovebird)' },
  { value: 'eclectus', label: 'Eclectus' },
  { value: 'caique', label: 'Caique' },
  { value: 'other', label: 'Otra especie' },
]

const DEFAULT_PROFILE: ParrotProfile = {
  name: '',
  species: '',
  birthDate: '',
  adoptionDate: '',
  weightGrams: '',
  sex: 'unknown',
  notes: '',
  avatarUrl: null,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calculateAge(birthDateStr: string): string {
  if (!birthDateStr) return ''
  const birth = new Date(birthDateStr)
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  let months = now.getMonth() - birth.getMonth()
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years === 0 && months === 0) return 'Menos de un mes'
  const parts: string[] = []
  if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`)
  if (months > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`)
  return parts.join(', ')
}

function loadProfile(): ParrotProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PROFILE
    return JSON.parse(raw) as ParrotProfile
  } catch {
    return DEFAULT_PROFILE
  }
}

function saveProfile(profile: ParrotProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

// ── Component ─────────────────────────────────────────────────────────────────

const ParrotPage = () => {
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState<ParrotProfile>(DEFAULT_PROFILE)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setProfile(loadProfile())
  }, [])

  const update = useCallback(<K extends keyof ParrotProfile>(field: K, value: ParrotProfile[K]) => {
    setProfile((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        update('avatarUrl', reader.result)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [update])

  const handleSave = useCallback(async () => {
    if (!profile.name.trim()) {
      showToast('El nombre del loro es obligatorio', 'error')
      return
    }
    setSaving(true)
    await new Promise<void>((r) => setTimeout(r, 400))
    saveProfile(profile)
    setSaving(false)
    showToast('Perfil guardado correctamente', 'success')
  }, [profile, showToast])

  const age = calculateAge(profile.birthDate)

  return (
    <div className="max-w-lg mx-auto p-4 pb-10 space-y-6">
      {/* Page header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Perfil del Loro</h1>
        <p className="text-slate-400 text-sm mt-1">
          Configura la informacion personal de tu loro
        </p>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-slate-800 border-4 border-slate-700 overflow-hidden flex items-center justify-center">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt="Foto del loro"
                className="w-full h-full object-cover"
              />
            ) : (
              <svg className="w-14 h-14 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>
          <Tooltip text="Subi una foto de tu loro desde tu celular" position="right">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center shadow-lg hover:bg-emerald-500 transition-colors"
              aria-label="Cambiar foto del loro"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </Tooltip>
        </div>

        {/* Big name display */}
        {profile.name && (
          <p className="text-3xl font-bold text-emerald-400 text-center tracking-tight">
            {profile.name}
          </p>
        )}

        {/* Age pill */}
        {age && (
          <Tooltip text="Edad calculada automaticamente segun la fecha de nacimiento" position="bottom">
            <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-full px-4 py-1.5">
              <span className="text-emerald-300 text-sm font-semibold">{age}</span>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Form */}
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="parrot-name">
            Nombre *
          </label>
          <Tooltip text="Como se llama tu loro" position="top">
            <input
              id="parrot-name"
              type="text"
              value={profile.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Rio, Kiwi, Mango..."
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700"
            />
          </Tooltip>
        </div>

        {/* Species */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="parrot-species">
            Especie
          </label>
          <Tooltip text="Selecciona la especie de tu loro para personalizar el entrenamiento" position="top">
            <select
              id="parrot-species"
              value={profile.species}
              onChange={(e) => update('species', e.target.value)}
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700"
            >
              <option value="">Seleccionar especie...</option>
              {SPECIES_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Tooltip>
        </div>

        {/* Sex */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Sexo
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'male', label: 'Macho' },
              { value: 'female', label: 'Hembra' },
              { value: 'unknown', label: 'Desconocido' },
            ] as { value: Sex; label: string }[]).map((opt) => (
              <Tooltip key={opt.value} text={`Marcar como ${opt.label}`} position="top">
                <button
                  onClick={() => update('sex', opt.value)}
                  className={`w-full py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                    profile.sex === opt.value
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="birth-date">
              Fecha de nacimiento
            </label>
            <Tooltip text="Fecha aproximada de nacimiento para calcular la edad" position="top">
              <input
                id="birth-date"
                type="date"
                value={profile.birthDate}
                onChange={(e) => update('birthDate', e.target.value)}
                className="w-full bg-slate-800 text-slate-100 px-3 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700"
              />
            </Tooltip>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="adoption-date">
              Fecha de adopcion
            </label>
            <Tooltip text="Cuando llego tu loro a vivir con vos" position="top">
              <input
                id="adoption-date"
                type="date"
                value={profile.adoptionDate}
                onChange={(e) => update('adoptionDate', e.target.value)}
                className="w-full bg-slate-800 text-slate-100 px-3 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700"
              />
            </Tooltip>
          </div>
        </div>

        {/* Weight */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="weight">
            Peso (gramos)
          </label>
          <Tooltip text="El peso del loro en gramos. Util para controlar la salud" position="top">
            <input
              id="weight"
              type="number"
              min={10}
              max={2000}
              value={profile.weightGrams}
              onChange={(e) => update('weightGrams', e.target.value)}
              placeholder="450"
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700"
            />
          </Tooltip>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="notes">
            Notas
          </label>
          <Tooltip text="Cualquier informacion adicional sobre tu loro" position="top">
            <textarea
              id="notes"
              rows={4}
              value={profile.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Le gusta el mango, le da miedo la aspiradora..."
              className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700 resize-none"
            />
          </Tooltip>
        </div>
      </div>

      {/* Save button */}
      <Tooltip text="Guarda todos los datos del perfil" position="top">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors min-h-[48px]"
        >
          {saving ? 'Guardando...' : 'Guardar perfil'}
        </button>
      </Tooltip>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />
    </div>
  )
}

export default ParrotPage
