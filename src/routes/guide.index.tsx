import { createFileRoute } from "@tanstack/react-router";
import { GuideHub } from "@/components/editorial/GuideHub";
import { seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";
export const Route = createFileRoute("/guide/")({
  head: () =>
    seoHead(
      tr("ui.pageGuideIndex.guideFerryAlgerieVehiculesEt"),
      tr("ui.pageGuideIndex.dossiersSourcesPourVoyagerEn"),
      "/guide",
    ),
  component: () => <GuideHub />,
});
