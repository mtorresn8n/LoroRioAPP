// Typed API client using fetch with error handling

// Read runtime config lazily on every call to avoid race conditions
// with inline script execution order
function getBaseUrl(): string {
  const win = window as unknown as Record<string, Record<string, string>>;
  if (win['__LORO_CONFIG__']?.['API_URL']) return win['__LORO_CONFIG__']['API_URL'];
  return (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:8000';
}

// Exported for components that need direct URL access (e.g. audio src)
export const BASE_URL = new Proxy({} as { value: string }, {
  get: () => getBaseUrl(),
}) as unknown as string;

// Use Object.prototype.toString override so template literals work
export const getApiBaseUrl = getBaseUrl;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
    return new Promise(() => {}) // Never resolves — page is navigating
  }

  const contentType = res.headers.get('content-type') ?? ''

  if (!res.ok) {
    let body: unknown = null
    try {
      body = contentType.includes('application/json') ? await res.json() : await res.text()
    } catch {
      // ignore parse errors on error responses
    }
    const message = typeof body === 'object' && body !== null && 'detail' in body
      ? String((body as Record<string, unknown>)['detail'])
      : `HTTP ${res.status}`
    throw new ApiError(res.status, body, message)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

function buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
  const base = getBaseUrl()
  const url = new URL(`${base}${path}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value))
    })
  }
  return url.toString()
}

export const apiClient = {
  async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    const res = await fetch(buildUrl(path, params), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
    })
    return parseResponse<T>(res)
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return parseResponse<T>(res)
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(buildUrl(path), {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return parseResponse<T>(res)
  },

  async del<T>(path: string): Promise<T> {
    const res = await fetch(buildUrl(path), {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
    })
    return parseResponse<T>(res)
  },

  async upload<T>(path: string, file: File, data?: Record<string, string>): Promise<T> {
    const formData = new FormData()
    formData.append('file', file)
    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, value)
      })
    }
    const res = await fetch(buildUrl(path), {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
      body: formData,
    })
    return parseResponse<T>(res)
  },
}
export const api = apiClient
