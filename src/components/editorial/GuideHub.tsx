import { SiteLayout } from "@/components/layout/SiteLayout";
import { articles } from "@/content/articles";
import type { Topic } from "@/content/types";
import { Breadcrumbs, CollectionSchema, EditorialHero, primaryLink, textLink } from "./Editorial";
import { tr } from "@/lib/i18n";

const topics: { id: Topic; name: string; path: string; intro: string }[] = [
  {
    id: "vehicules",
    name: "Véhicules et importation",
    path: "/vehicules-moins-3-ans",
    intro: "Comprendre le régime, vérifier l'âge et construire le coût complet avant d'acheter.",
  },
  {
    id: "voyage",
    name: "Le voyage Europe ↔ Algérie",
    path: "/voyage-algerie",
    intro:
      "Choisir son billet, préparer la voiture et organiser la traversée jusqu'à la sortie du port.",
  },
  {
    id: "route",
    name: "La route et les rendez-vous",
    path: "/covoiturage",
    intro: "Choisir un point de regroupement et partager les frais avant de rejoindre le terminal.",
  },
];
export function GuideHub({ topic }: { topic?: Topic }) {
  const current = topics.find((t) => t.id === topic);
  const selected = articles.filter((a) => !topic || a.topic === topic);
  const title = current?.name ?? "Guide du voyage en Algérie par ferry";
  const path = current?.path ?? "/guide";
  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: current?.name ?? "Guide pratique", path }]} />
      <CollectionSchema
        path={path}
        name={title}
        items={selected.map((a) => ({ name: a.title, path: `/guide/${a.slug}` }))}
      />
      <EditorialHero
        label={tr("ui.guideHub.laBibliothequeBledway")}
        title={title}
        intro={
          current?.intro ??
          tr("ui.guideHub.duProjetAutomobileAuDernier")
        }
      />
      <div className="mb-10 flex flex-wrap gap-3">
        <a href="/simulateurs" className={primaryLink}>
          {tr("ui.guideHub.mesSimulateurs")}
        </a>
        <a
          href="/bateaux"
          className="inline-flex min-h-11 items-center rounded-xl border px-5 text-sm font-semibold hover:bg-secondary"
        >
          {tr("ui.guideHub.lesDossiersNavires")}
        </a>
      </div>
      {!topic ? (
        <nav aria-label={tr("ui.guideHub.themesDuGuide")} className="mb-10 grid gap-4 md:grid-cols-3">
          {topics.map((t) => (
            <a
              key={t.id}
              href={t.path}
              className="rounded-xl border bg-secondary/40 p-5 transition-colors hover:border-primary/40"
            >
              <h2 className="font-display text-lg font-bold">{t.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.intro}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-primary">
                {tr("ui.guideHub.explorerCeTheme")}
              </span>
            </a>
          ))}
        </nav>
      ) : null}
      <section>
        <h2 className="font-display text-2xl font-bold">
          {topic ? tr("ui.guideHub.lesDossiersPourAvancer") : tr("ui.guideHub.tousLesDossiersPratiques")}
        </h2>
        <div className="mt-5 divide-y border-y">
          {selected.map((a, i) => (
            <a
              key={a.slug}
              href={`/guide/${a.slug}`}
              className="group grid gap-2 py-6 md:grid-cols-[3rem_minmax(0,1fr)_auto] md:gap-5"
            >
              <span className="font-display text-sm text-muted-foreground" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-display text-xl font-semibold group-hover:text-primary">
                  {a.title}
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  {a.description}
                </p>
              </div>
              <span className="self-center text-sm font-semibold text-primary">
                {tr("ui.guideHub.lireLeDossier")}
              </span>
            </a>
          ))}
        </div>
      </section>
      <p className="mt-8 text-sm text-muted-foreground">
        {tr("ui.guideHub.desInformationsPourPreparerVos")}{" "}
        <a href="/methode-editoriale" className={textLink}>
          {tr("ui.guideHub.comprendreNotreMethode")}
        </a>
        .
      </p>
    </SiteLayout>
  );
}
