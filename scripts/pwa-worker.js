/* Generated worker inputs are replaced by build-pwa.mjs. */
const CACHE_PREFIX = 'sergeant-public-';
const CACHE = CACHE_PREFIX + '__BUILD_VERSION__';
const FILES = __BUILD_FILES__;
const DIGESTS = __BUILD_DIGESTS__;
const ROUTES = new Set(__BUILD_ROUTES__);
const PUBLIC = new Set(FILES);
const origin = self.location.origin;
const usable = (response, url) => response.ok && !response.redirected && response.url === url;

self.addEventListener('install', (event) => {
  // A new build waits for existing app windows to close. Never interrupt queued edits.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async (path) => {
      // Static hosts redirect /index.html to /. Fetch the canonical URL and retain the stable cache key.
      const url = new URL(path === '/index.html' ? '/' : path, origin).href;
      const response = await fetch(url, { cache: 'reload', credentials: 'same-origin', redirect: 'error' });
      if (!usable(response, url)) throw new Error(`Cannot cache public asset ${path}`);
      // Hosting gates can return a login page with status 200. Only exact exported bytes enter the cache.
      const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
      const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (hex !== DIGESTS[path]) throw new Error(`Public asset differs from export: ${path}`);
      await cache.put(new URL(path, origin).href, response);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Supabase, authentication, API calls, and writes bypass the worker entirely.
  if (request.method !== 'GET' || url.origin !== origin || url.search) return;
  const navigation = request.mode === 'navigate';
  const route = url.pathname.replace(/\/$/, '') || '/';
  const knownRoute = ROUTES.has(route) || /^\/(course|item)\/[^/]+\/?$/.test(url.pathname);
  if (navigation && knownRoute) {
    event.respondWith((async () => {
      try {
        // Online navigations always see the current deployment. Never cache authenticated HTML responses.
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE);
        return cache.match(new URL('/index.html', origin).href);
      }
    })());
  } else if (!navigation && PUBLIC.has(url.pathname) && !url.pathname.endsWith('.html')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(url.href)) || fetch(request);
    })());
  }
});
