import { createFileRoute, redirect } from "@tanstack/react-router";

/** Ancienne adresse de Mes dinars : les liens déjà partagés continuent de fonctionner. */
export const Route = createFileRoute("/ma-bezass")({
  beforeLoad: () => {
    throw redirect({ to: "/mes-dinars", replace: true });
  },
});
