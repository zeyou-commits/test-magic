import { SiteLayout } from "@/components/layout/SiteLayout";
import { articles } from "@/content/articles";
import type { Topic } from "@/content/types";
import { Breadcrumbs, CollectionSchema, EditorialHero, primaryLink, textLink } from "./Editorial";

const topics: { id: Topic; name: string; path: string; intro: string }[] = [
  {
    id: "vehicules",
    name: "Véhicules et importation",
    path: "/vehicules-moins-3-ans",
    intro: "Comprendre le régime, vérifier l'âge et construire le coût complet avant d'acheter.",
  },
  {
    id: "voyage",
    name: "Le voyage vers l'Algérie",
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
  const title = current?.name ?? "Votre voyage commence par les bonnes réponses";
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
        label="La bibliothèque Batogo"
        title={title}
        intro={
          current?.intro ??
          "Du projet automobile au dernier kilomètre avant le port : des dossiers sourcés, des repères concrets et des outils pour préparer votre départ."
        }
      />
      <div className="mb-10 flex flex-wrap gap-3">
        <a href="/simulateurs" className={primaryLink}>
          Mes simulateurs
        </a>
        <a
          href="/bateaux"
          className="inline-flex min-h-11 items-center rounded-xl border px-5 text-sm font-semibold hover:bg-secondary"
        >
          Les dossiers bateaux
        </a>
      </div>
      {!topic ? (
        <nav aria-label="Thèmes du guide" className="mb-10 grid gap-4 md:grid-cols-3">
          {topics.map((t) => (
            <a
              key={t.id}
              href={t.path}
              className="rounded-xl border bg-secondary/40 p-5 transition-colors hover:border-primary/40"
            >
              <h2 className="font-display text-lg font-bold">{t.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.intro}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-primary">
                Explorer ce thème →
              </span>
            </a>
          ))}
        </nav>
      ) : null}
      <section>
        <h2 className="font-display text-2xl font-bold">
          {topic ? "Les dossiers pour avancer" : "Tous les dossiers pratiques"}
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
                Lire le dossier →
              </span>
            </a>
          ))}
        </div>
      </section>
      <p className="mt-8 text-sm text-muted-foreground">
        Des informations pour préparer vos décisions, avec leurs sources et leurs limites.{" "}
        <a href="/methode-editoriale" className={textLink}>
          Comprendre notre méthode
        </a>
        .
      </p>
    </SiteLayout>
  );
}
