import { createFileRoute } from "@tanstack/react-router";
import { GuideHub } from "@/components/editorial/GuideHub";
import { seoHead } from "@/lib/seo/site";
export const Route = createFileRoute("/guide/")({
  head: () =>
    seoHead(
      "Guide ferry Algérie, véhicules et préparation du voyage | BledWay",
      "Dossiers sourcés pour voyager en Algérie : véhicule de moins de trois ans, budget, bateaux, cabines, embarquement et covoiturage.",
      "/guide",
    ),
  component: () => <GuideHub />,
});
