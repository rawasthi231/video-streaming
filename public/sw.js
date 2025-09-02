/**
 * Service Worker for Video Streaming Platform
 * Provides basic caching and offline capabilities
 */

const CACHE_NAME = 'video-streaming-v1';
const STATIC_ASSETS = [
  '/',
  '/css/main.css',
  '/js/api.js',
  '/js/app.js',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/hls.js@1.4.12/dist/hls.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.error('Failed to cache static assets:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache when appropriate
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip API requests (except for video streaming)
  if (url.pathname.startsWith('/api/') && !url.pathname.includes('/stream/')) {
    return;
  }

  // Skip real-time endpoints
  if (url.pathname.includes('/health') || 
      url.pathname.includes('/metrics') || 
      url.pathname.includes('/burn')) {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise fetch from network
        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response for caching
            const responseToCache = response.clone();

            // Cache static assets and HTML pages
            if (request.method === 'GET' && 
                (url.pathname.endsWith('.css') || 
                 url.pathname.endsWith('.js') || 
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/')) {
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, responseToCache);
                });
            }

            return response;
          })
          .catch(() => {
            // Serve offline fallback for HTML requests
            if (request.headers.get('accept').includes('text/html')) {
              return caches.match('/');
            }
          });
      })
  );
});
