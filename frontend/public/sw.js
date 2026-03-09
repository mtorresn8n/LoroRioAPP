// LoroApp Service Worker - App Shell Caching

const CACHE_NAME = 'loro-app-v1'
const STATIC_CACHE = 'loro-static-v1'

// App shell assets to cache on install
const APP_SHELL = [
  '/',
  '/station',
  '/manifest.json',
]

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL).catch(() => {
        // Ignore errors for optional assets
      })
    }).then(() => self.skipWaiting()),
  )
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      )
    }).then(() => self.clients.claim()),
  )
})

// Fetch strategy:
// - API calls: network first, no cache
// - Static assets (JS/CSS/fonts): cache first
// - HTML (navigation): network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip API requests and WebSocket
  if (url.pathname.startsWith('/api/') || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return
  }

  // Static assets: cache first
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        })
      }),
    )
    return
  }

  // Navigation requests: network first, fallback to '/'
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/').then((cached) => {
          return cached ?? new Response('Offline - LoroApp', {
            headers: { 'Content-Type': 'text/html' },
          })
        })
      }),
    )
    return
  }
})
