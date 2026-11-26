/* La Planque : service worker (appli installable + chargement rapide).
   Les fichiers du site sont toujours pris en ligne d'abord (pour avoir la dernière version),
   et gardés en réserve pour s'ouvrir même avec une mauvaise connexion.
   Les données (Supabase) ne passent jamais par ici. */
const V = 'planque-v2';
const SHELL = ['./', './index.html', './config.js', './fiches.js', './planque-cloud.js', './planque-admin.js', './planque-ui.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'no-cache' })).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const c = await caches.open(V);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') { const home = await c.match('./index.html') || await c.match('./'); if (home) return home }
    throw err;
  }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(V), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) { e.respondWith(networkFirst(req)); return }
  if (/(^|\.)cdn\.jsdelivr\.net$|^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) { e.respondWith(staleWhileRevalidate(req)); return }
  // Supabase (données, connexion, photos) et le reste : le navigateur s'en occupe normalement
});
