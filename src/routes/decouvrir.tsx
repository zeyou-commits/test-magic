import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { HomeContent } from "@/components/home/HomeContent";
import { portsQuery, routesQuery } from "@/lib/ferry/queries";
import { seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";

/**
 * « Découvrir BledWay » : le récit, les lignes, les navires, les guides et les questions qui
 * étaient sous la carte. L'accueil reste un écran d'application (la carte, rien en dessous).
 */
export const Route = createFileRoute("/decouvrir")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
    ]);
  },
  head: () =>
    seoHead(
      tr("ui.pageDecouvrir.decouvrirBledwayLeFerryVers"),
      tr("ui.pageDecouvrir.lignesEtPortsEntreL"),
      "/decouvrir",
    ),
  component: DiscoverPage,
});

function DiscoverPage() {
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const navigate = useNavigate();
  return (
    <SiteLayout>
      <h1 className="sr-only">{tr("ui.pageDecouvrir.decouvrirBledway")}</h1>
      <HomeContent
        ports={ports}
        routes={routes}
        // « Explorer sur la carte » : la carte s'ouvre sur cette ligne.
        onExplore={(route) =>
          void navigate({
            to: "/",
            search: { from: route.departure_port_id, to: route.arrival_port_id } as never,
          })
        }
      />
    </SiteLayout>
  );
}
