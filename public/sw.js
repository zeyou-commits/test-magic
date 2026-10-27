// La navigation et les données restent toujours servies par le réseau.
// Aucun cache applicatif ne peut donc retenir une ancienne version de BledWay.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = {}; }
  const title = typeof data.title === "string" ? data.title : "BledWay";
  const body = typeof data.body === "string" ? data.body : "Une information sur votre voyage est disponible.";
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/compte";
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: "/pwa-icon-192.png", badge: "/notification-badge.png", tag: data.tag || undefined,
    data: { url },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/compte", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => client.url === url);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  }));
});
