import { createFileRoute } from "@tanstack/react-router";
import { GuideHub } from "@/components/editorial/GuideHub";
import { seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/vehicules-moins-3-ans")({
  head: () =>
    seoHead(
      tr("ui.pageVehiculesMoins3Ans.voitureDeMoinsDe3"),
      tr("ui.pageVehiculesMoins3Ans.preparerUneImportationDeVoiture"),
      "/vehicules-moins-3-ans",
    ),
  component: () => <GuideHub topic="vehicules" />,
});
