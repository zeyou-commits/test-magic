import { createFileRoute, redirect } from "@tanstack/react-router";

// « Mon voyage » est devenu un mode de la carte d'accueil : l'ancienne adresse y mène.
export const Route = createFileRoute("/mon-voyage")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { voyage: 1 } as never });
  },
});
