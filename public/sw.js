// En ligne, la navigation et les données viennent toujours du réseau : aucune ancienne version
// de BledWay ne peut rester bloquée. Hors ligne (en mer, au port), la dernière page reçue et ses
// fichiers servent de secours ; les données du voyage sont gardées par la page elle-même.
const PAGES = "bledway-pages-v1";
const ASSETS = "bledway-assets-v1";
const ASSETS_KEPT = 160;
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Supabase, cartes et services externes : jamais interceptés.
  if (url.origin !== self.location.origin) return;
  // Fichiers versionnés (nom unique à chaque mise en ligne) : les garder ne fige rien.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - ASSETS_KEPT))) await cache.delete(old);
      }
      return response;
    })());
    return;
  }
  // Pages : le réseau d'abord ; sans réseau, la dernière version reçue de cette page (ou l'accueil).
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(PAGES);
          await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch (error) {
        const cache = await caches.open(PAGES);
        const cached = (await cache.match(url.pathname)) ?? (await cache.match("/"));
        if (cached) return cached;
        throw error;
      }
    })());
  }
});
const ICONS = ["alert", "warning", "trip", "community", "info", "delay", "access-closed", "access-moved", "help", "help-medical"];
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = {}; }
  const title = typeof data.title === "string" ? data.title : "BledWay";
  const body = typeof data.body === "string" ? data.body : "Une information sur votre voyage est disponible.";
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/compte";
  // Un picto par motif ; à défaut, par nature de message, puis l'icône de l'application.
  const picto = [data.picto, data.kind].find((name) => ICONS.includes(name));
  const icon = picto ? `/notification-icons/${picto}.png` : "/pwa-icon-192.png";
  const actions = Array.isArray(data.actions) ? data.actions.slice(0, 2) : [];
  event.waitUntil(self.registration.showNotification(title, {
    body, icon, badge: "/notification-badge.png", tag: data.tag || undefined, actions,
    data: { url, reply: data.reply },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/compte", self.location.origin).href;
  const reply = event.notification.data?.reply;
  event.waitUntil((async () => {
    // Répondre exige la position du voyageur, que seule la page ouverte peut demander : elle reprend la réponse.
    if (event.action && reply) {
      const cache = await caches.open("bledway-reply");
      await cache.put("/__notification-reply", new Response(JSON.stringify({ ...reply, action: event.action, at: Date.now() })));
    }
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => client.url === url);
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: "bledway-reply" });
      return;
    }
    return self.clients.openWindow(url);
  })());
});
