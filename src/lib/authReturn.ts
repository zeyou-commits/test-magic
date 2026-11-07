import { useRouterState } from "@tanstack/react-router";
import { pendingChat } from "@/lib/ferry/chat";

/**
 * Où revenir après une connexion ou une inscription (Google, lien de confirmation d'e-mail) :
 * la page d'où l'on venait, pas « Mon compte ». Un message écrit dans un salon avant de se connecter
 * rouvre ce salon au retour (room=1), pour voir son message publié.
 */
export function authReturnPath(): string {
  if (typeof window === "undefined") return "/";
  const { pathname, search } = window.location;
  if (pathname.startsWith("/auth")) return "/";
  const params = new URLSearchParams(search);
  const chat = pendingChat();
  if (chat && (chat.kind === "crossing" || chat.kind === "port")) params.set("room", "1");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

/** Lien vers la page de connexion qui ramène ensuite ici. */
export const authUrl = (origin = typeof window === "undefined" ? "" : window.location.origin) =>
  `${origin}/auth?next=${encodeURIComponent(authReturnPath())}`;

/** Pour les liens « Se connecter » : la page actuelle, identique côté serveur et navigateur. */
export function useAuthNext(): string {
  return useRouterState({
    select: (state) =>
      state.location.pathname.startsWith("/auth") ? "/" : state.location.href || "/",
  });
}
