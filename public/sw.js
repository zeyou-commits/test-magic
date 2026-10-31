// La navigation et les données restent toujours servies par le réseau.
// Aucun cache applicatif ne peut donc retenir une ancienne version de BledWay.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
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
