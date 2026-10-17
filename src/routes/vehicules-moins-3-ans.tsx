import { createFileRoute } from "@tanstack/react-router";
import { GuideHub } from "@/components/editorial/GuideHub";
import { seoHead } from "@/lib/seo/site";
export const Route = createFileRoute("/vehicules-moins-3-ans")({
  head: () =>
    seoHead(
      "Voiture de moins de 3 ans en Algérie : guide et outils | Batogo",
      "Préparer une importation de voiture en Algérie : régime, âge à la déclaration, documents, budget complet et simulateurs expliqués.",
      "/vehicules-moins-3-ans",
    ),
  component: () => <GuideHub topic="vehicules" />,
});
