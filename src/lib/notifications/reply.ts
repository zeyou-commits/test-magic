import { useEffect, useRef } from "react";

export type NotificationReply = {
  target: "alert" | "help";
  id: string;
  action: "confirm" | "deny" | "go";
  at: number;
};

// Déposée par le service worker : un lien reçu ailleurs ne peut pas déclencher une réponse à votre place.
const CACHE = "bledway-reply";
const ENTRY = "/__notification-reply";
const VALID_MS = 2 * 60_000;

async function take(target: NotificationReply["target"], ids: string[]) {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(CACHE);
  const stored = await cache.match(ENTRY);
  if (!stored) return null;
  const reply = (await stored.json()) as NotificationReply;
  if (Date.now() - reply.at > VALID_MS) {
    await cache.delete(ENTRY);
    return null;
  }
  if (reply.target !== target || !ids.includes(reply.id)) return null;
  await cache.delete(ENTRY);
  return reply;
}

/** Bouton touché dans une notification : la liste qui contient l'élément envoie la réponse à l'ouverture. */
export function useNotificationReply(
  target: NotificationReply["target"],
  ids: string[],
  run: (reply: NotificationReply) => void,
) {
  const latest = useRef(run);
  latest.current = run;
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    const list = key.split(",");
    const check = () => {
      void take(target, list)
        .then((reply) => {
          if (reply) latest.current(reply);
        })
        .catch(() => undefined);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "bledway-reply") check();
    };
    check();
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [target, key]);
}
