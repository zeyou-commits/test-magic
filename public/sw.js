// La navigation et les données restent toujours servies par le réseau.
// Aucun cache applicatif ne peut donc retenir une ancienne version de BledWay.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
