/* FitFlow service worker.
 * - Caches only public, non-personal assets (app shell, hashed JS/CSS, icons, exercise media).
 * - Never caches /api/* responses or authenticated page HTML (private data lives in IndexedDB
 *   on the device and is managed by the app).
 * - Offline navigations fall back to the /offline shell.
 */
const VERSION = "ff-v1";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const MEDIA = `${VERSION}-media`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    try {
      const res = await fetch(OFFLINE_URL, { credentials: "omit", cache: "reload" });
      if (res.ok) {
        const html = await res.clone().text();
        await cache.put(OFFLINE_URL, res);
        const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]))];
        const st = await caches.open(STATIC);
        await Promise.all(assets.map((a) => st.add(a).catch(() => {})));
      }
    } catch (e) { /* offline at install time */ }
    await cache.addAll(["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // private data: network only, never cached
  if (url.pathname.startsWith("/_next/static/")) { event.respondWith(cacheFirst(req, STATIC)); return; }
  if (url.pathname.startsWith("/media/") || url.pathname.startsWith("/icons/")) { event.respondWith(cacheFirst(req, MEDIA)); return; }
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (e) {
        const cache = await caches.open(SHELL);
        return (await cache.match(OFFLINE_URL)) || new Response("<h1>آفلاین</h1>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "FitFlow", body: "اعلان جدید", url: "/dashboard" };
  try { data = { ...data, ...event.data.json() }; } catch (e) { /* ignore */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", dir: "rtl", lang: "fa", data: { url: data.url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  })());
});
