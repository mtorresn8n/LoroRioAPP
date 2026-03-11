'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/toast'
import { apiClient, getApiBaseUrl } from '@/core/api-client'
import type { Parrot, ParrotCreate, ParrotUpdate, ParrotSex, AvatarUploadResponse } from '@/types'

// ── Constants ────────────────────────────────────────────────────────────────

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

// ── Form state (local, not persisted directly) ──────────────────────────────

interface ParrotForm {
  name: string
  species: string
  birthDate: string
  adoptionDate: string
  weightGrams: string
  sex: ParrotSex
  notes: string
}

const DEFAULT_FORM: ParrotForm = {
  name: '',
  species: '',
  birthDate: '',
  adoptionDate: '',
  weightGrams: '',
  sex: 'unknown',
  notes: '',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Convert backend Parrot response to local form state */
function parrotToForm(parrot: Parrot): ParrotForm {
  return {
    name: parrot.name,
    species: parrot.species ?? '',
    birthDate: parrot.birth_date ?? '',
    adoptionDate: parrot.adoption_date ?? '',
    weightGrams: parrot.weight_grams != null ? String(parrot.weight_grams) : '',
    sex: parrot.sex ?? 'unknown',
    notes: parrot.notes ?? '',
  }
}

/** Convert local form state to backend create/update payload */
function formToPayload(form: ParrotForm): ParrotCreate {
  return {
    name: form.name,
    species: form.species || null,
    birth_date: form.birthDate || null,
    adoption_date: form.adoptionDate || null,
    weight_grams: form.weightGrams ? parseFloat(form.weightGrams) : null,
    sex: form.sex,
    notes: form.notes || null,
  }
}

/** Build the full avatar URL from a relative path */
function avatarUrl(avatarPath: string | null): string | null {
  if (!avatarPath) return null
  // If it's already a full URL, return as-is
  if (avatarPath.startsWith('http')) return avatarPath
  return `${getApiBaseUrl()}/${avatarPath}`
}

// ── Shared input styles ─────────────────────────────────────────────────────

const inputClass =
  'w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-700'

// ── Component ────────────────────────────────────────────────────────────────

const ParrotPage = () => {
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [parrot, setParrot] = useState<Parrot | null>(null)
  const [form, setForm] = useState<ParrotForm>(DEFAULT_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Fetch existing parrot on mount
  useEffect(() => {
    const fetchParrot = async () => {
      try {
        const data = await apiClient.get<Parrot | null>('/api/v1/parrot/')
        if (data) {
          setParrot(data)
          setForm(parrotToForm(data))
        }
      } catch (err) {
        console.error('Failed to fetch parrot profile:', err)
        showToast('Error al cargar el perfil', 'error')
      } finally {
        setLoading(false)
      }
    }
    void fetchParrot()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(<K extends keyof ParrotForm>(field: K, value: ParrotForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !parrot) return
    e.target.value = ''

    setUploadingAvatar(true)
    try {
      const result = await apiClient.upload<AvatarUploadResponse>(
        `/api/v1/parrot/${parrot.id}/avatar`,
        file,
      )
      // Update local parrot state with new avatar
      setParrot((prev) => prev ? { ...prev, avatar_path: result.avatar_path } : prev)
      showToast('Foto actualizada', 'success')
    } catch (err) {
      console.error('Failed to upload avatar:', err)
      showToast('Error al subir la foto', 'error')
    } finally {
      setUploadingAvatar(false)
    }
  }, [parrot, showToast])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      showToast('El nombre del loro es obligatorio', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = formToPayload(form)

      if (parrot) {
        // Update existing parrot
        const updated = await apiClient.put<Parrot>(
          `/api/v1/parrot/${parrot.id}`,
          payload as ParrotUpdate,
        )
        setParrot(updated)
        setForm(parrotToForm(updated))
        showToast('Perfil actualizado correctamente', 'success')
      } else {
        // Create new parrot
        const created = await apiClient.post<Parrot>('/api/v1/parrot/', payload)
        setParrot(created)
        setForm(parrotToForm(created))
        showToast('Perfil creado correctamente', 'success')
      }
    } catch (err) {
      console.error('Failed to save parrot profile:', err)
      showToast('Error al guardar el perfil', 'error')
    } finally {
      setSaving(false)
    }
  }, [form, parrot, showToast])

  const age = calculateAge(form.birthDate)
  const speciesLabel = SPECIES_OPTIONS.find((s) => s.value === form.species)?.label
  const currentAvatarUrl = avatarUrl(parrot?.avatar_path ?? null)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-10 max-w-lg md:max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-100">Perfil del Loro</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Configura la informacion personal de tu loro
        </p>
      </div>

      {/* Avatar hero card */}
      <div className="bg-slate-800 rounded-2xl p-6 flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-slate-700 border-4 border-slate-600 overflow-hidden flex items-center justify-center">
            {currentAvatarUrl ? (
              <img
                src={currentAvatarUrl}
                alt="Foto del loro"
                className="w-full h-full object-cover"
              />
            ) : (
              <svg className="w-12 h-12 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                <div className="animate-spin w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full" />
              </div>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar || (!parrot && !form.name.trim())}
            className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center shadow-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            aria-label="Cambiar foto del loro"
            title={!parrot ? 'Guarda el perfil primero para subir una foto' : 'Cambiar foto'}
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {form.name ? (
          <p className="text-2xl font-bold text-emerald-400 text-center tracking-tight">
            {form.name}
          </p>
        ) : (
          <p className="text-sm text-slate-500">Agrega un nombre abajo</p>
        )}

        {/* Info pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {age && (
            <span className="bg-emerald-900/40 border border-emerald-700/50 rounded-full px-3 py-1 text-emerald-300 text-xs font-medium">
              {age}
            </span>
          )}
          {speciesLabel && (
            <span className="bg-slate-700 rounded-full px-3 py-1 text-slate-300 text-xs font-medium">
              {speciesLabel}
            </span>
          )}
          {form.weightGrams && (
            <span className="bg-slate-700 rounded-full px-3 py-1 text-slate-300 text-xs font-medium">
              {form.weightGrams}g
            </span>
          )}
        </div>
      </div>

      {/* Basic info section */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Informacion basica
        </h2>
        <div className="bg-slate-800 rounded-xl p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="parrot-name">
              Nombre *
            </label>
            <input
              id="parrot-name"
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Rio, Kiwi, Mango..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="parrot-species">
              Especie
            </label>
            <select
              id="parrot-species"
              value={form.species}
              onChange={(e) => update('species', e.target.value)}
              className={inputClass}
            >
              <option value="">Seleccionar especie...</option>
              {SPECIES_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Sexo
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'male', label: 'Macho' },
                { value: 'female', label: 'Hembra' },
                { value: 'unknown', label: 'Desconocido' },
              ] as { value: ParrotSex; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update('sex', opt.value)}
                  className={`w-full py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                    form.sex === opt.value
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-700 text-slate-400 border-slate-600 hover:text-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Dates & health section */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Fechas y salud
        </h2>
        <div className="bg-slate-800 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="birth-date">
                Nacimiento
              </label>
              <input
                id="birth-date"
                type="date"
                value={form.birthDate}
                onChange={(e) => update('birthDate', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="adoption-date">
                Adopcion
              </label>
              <input
                id="adoption-date"
                type="date"
                value={form.adoptionDate}
                onChange={(e) => update('adoptionDate', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="weight">
              Peso (gramos)
            </label>
            <input
              id="weight"
              type="number"
              min={10}
              max={2000}
              value={form.weightGrams}
              onChange={(e) => update('weightGrams', e.target.value)}
              placeholder="450"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* Notes section */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Notas
        </h2>
        <div className="bg-slate-800 rounded-xl p-4">
          <textarea
            id="notes"
            rows={4}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Le gusta el mango, le da miedo la aspiradora..."
            className={`${inputClass} resize-none`}
          />
        </div>
      </section>

      {/* Save button */}
      <button
        onClick={() => void handleSave()}
        disabled={saving}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors min-h-[48px] active:scale-[0.98]"
      >
        {saving ? 'Guardando...' : parrot ? 'Guardar cambios' : 'Crear perfil'}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleAvatarChange(e)}
      />
    </div>
  )
}

export default ParrotPage
