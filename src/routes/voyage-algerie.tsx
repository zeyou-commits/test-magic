import { createFileRoute } from "@tanstack/react-router";
import { GuideHub } from "@/components/editorial/GuideHub";
import { seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/voyage-algerie")({
  head: () =>
    seoHead(
      tr("ui.pageVoyageAlgerie.voyageEnAlgerieEnFerry"),
      tr("ui.pageVoyageAlgerie.preparezVotreTraverseeEntreL"),
      "/voyage-algerie",
    ),
  component: () => <GuideHub topic="voyage" />,
});
