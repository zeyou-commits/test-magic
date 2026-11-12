import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  AnswerBox,
  Breadcrumbs,
  EditorialHero,
  FaqSection,
  textLink,
} from "@/components/editorial/Editorial";
import { companiesQuery, portsQuery, routesQuery } from "@/lib/ferry/queries";
import { formatDuration } from "@/lib/ferry/format";
import { CONFIRM_NOTE, generalFaq } from "@/lib/seo/answers";
import { seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/questions-frequentes")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(companiesQuery),
    ]);
  },
  head: () =>
    seoHead(
      "Ferry Europe–Algérie : questions fréquentes | BledWay",
      "Compagnies, ports, durées, prix repères, arrivée au port, voiture et TPD : les réponses directes aux questions des voyageurs entre l'Europe et l'Algérie.",
      "/questions-frequentes",
    ),
  component: FaqPage,
});

function FaqPage() {
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const lines = routes
    .map((route) => ({
      route,
      label: `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`,
      operators: companies
        .filter((company) => route.company_ids.includes(company.id))
        .map((company) => company.name)
        .join(", "),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: "Questions fréquentes", path: "/questions-frequentes" }]} />
      <EditorialHero
        label="L'essentiel"
        title={tr("ui.pageQuestionsFrequentes.ferryEuropeAlgerieLesReponses")}
        intro={tr("ui.pageQuestionsFrequentes.compagniesPortsDureesBudgetEt")}
      />
      <AnswerBox>
        {tr("ui.pageQuestionsFrequentes.lesDureesEtLesPrix")}{" "}
        {CONFIRM_NOTE}
      </AnswerBox>
      <FaqSection faq={generalFaq(ports, routes, companies)} path="/questions-frequentes" />
      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold">{tr("ui.pageQuestionsFrequentes.toutesLesLignesEtLeur")}</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-secondary/70">
              <tr>
                <th className="px-4 py-3">{tr("ui.pageQuestionsFrequentes.ligne")}</th>
                <th className="px-4 py-3">{tr("ui.pageQuestionsFrequentes.dureeTypiqueEstimation")}</th>
                <th className="px-4 py-3">{tr("ui.pageQuestionsFrequentes.compagniesRenseignees")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ route, label, operators }) => (
                <tr key={route.id} className="border-t">
                  <th scope="row" className="px-4 py-3 font-semibold">
                    <Link to="/lignes/$slug" params={{ slug: route.slug }} className={textLink}>
                      {label}
                    </Link>
                  </th>
                  <td className="px-4 py-3">{formatDuration(route.typical_duration_minutes)}</td>
                  <td className="px-4 py-3">{operators || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="mt-10 text-sm">
        <Link to="/barometre-prix" className={textLink}>
          {tr("ui.pageQuestionsFrequentes.barometreDesPrix")}
        </Link>{" "}
        ·{" "}
        <Link to="/guide" className={textLink}>
          {tr("ui.pageQuestionsFrequentes.tousLesDossiers")}
        </Link>{" "}
        ·{" "}
        <Link to="/methode-editoriale" className={textLink}>
          {tr("ui.pageQuestionsFrequentes.methodeEtSources")}
        </Link>
      </p>
    </SiteLayout>
  );
}
