// Bump VERSION on every release so users get the "new version" prompt.
const VERSION = 'aim-v2.1.0';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'js/app.js', 'js/logic.js', 'js/biu.js', 'js/fx.js', 'js/ask.js',
  'fonts/nunito.woff2', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg'];
const RUNTIME = 'aim-ocr-v5.1.1'; // screenshot reader files: cached on first use, kept across releases

self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL))));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION && k !== RUNTIME) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match('index.html'))); return; }
  const bucket = url.pathname.includes('/vendor/') ? RUNTIME : VERSION;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(bucket).then((c) => c.put(req, copy)); }
    return res;
  })));
});
