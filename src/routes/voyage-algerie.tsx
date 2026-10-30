import { createFileRoute } from "@tanstack/react-router";
import { GuideHub } from "@/components/editorial/GuideHub";
import { seoHead } from "@/lib/seo/site";
export const Route = createFileRoute("/voyage-algerie")({
  head: () =>
    seoHead(
      "Voyage en Algérie en ferry : voiture, famille et budget | BledWay",
      "Préparez votre traversée entre l'Europe et l'Algérie, aller et retour : voiture, cabine, enfants, animaux, accès aux ports, budget et démarches à l'arrivée.",
      "/voyage-algerie",
    ),
  component: () => <GuideHub topic="voyage" />,
});
