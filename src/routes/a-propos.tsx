import { seoHead } from "@/lib/seo/site";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { tr } from "@/lib/i18n";

const title = "À propos de BledWay, la carte des ferries Europe ↔ Algérie";
const description =
  "BledWay rassemble ports, lignes, durées et départs des traversées entre l'Europe et l'Algérie, et le suivi en direct des navires avec l'aide des voyageurs.";

export const Route = createFileRoute("/a-propos")({
  head: () => seoHead(title, description, "/a-propos"),
  component: AboutPage,
});

const PILLARS = [
  {
    title: "Informer d'abord",
    text: "Nous ne vendons pas de billets. Nous rassemblons et présentons clairement les ports, lignes, durées et départs, toutes compagnies confondues.",
  },
  {
    title: "Avec les voyageurs",
    text: "Le signal des navires et les remontées des voyageurs sur place complètent les horaires. Une erreur signalée est corrigée pour tous.",
  },
  {
    title: "Honnête sur ce qu'on sait",
    text: "Un retard estimé est dit estimé, un navire sans signal est dit sans signal. Nous préférons « on ne sait pas » à une fausse certitude.",
  },
];

const STEPS = [
  {
    title: "Trouver",
    text: "Toutes les traversées sur une seule carte, avec les durées, les jours de départ et les prix indicatifs.",
  },
  {
    title: "Préparer",
    text: "Le trajet de porte à porte, l'heure de départ conseillée, les papiers et la check-list du voyage.",
  },
  {
    title: "Suivre",
    text: "Le bateau en direct, l'embarquement, les retards, l'état de la mer, et le salon des voyageurs de la traversée.",
  },
  {
    title: "Partager",
    text: "Signaler ce qui se passe au port ou à bord, noter les navires et les ports, répondre aux questions des autres.",
  },
];

function AboutPage() {
  return (
    <SiteLayout>
      <PageHero
        overline={tr("ui.pageAPropos.aPropos")}
        title={tr("ui.pageAPropos.bledwayLaRouteDuBled")}
        intro={tr("ui.pageAPropos.uneCarteUniquePourComprendre")}
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {PILLARS.map((pillar) => (
          <Card key={pillar.title}>
            <h2 className="font-display font-semibold">{pillar.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{pillar.text}</p>
          </Card>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold">{tr("ui.pageAPropos.ceQueVousYTrouvez")}</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-xl border bg-card p-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {index + 1}
              </span>
              <span>
                <strong className="block text-sm">{step.title}</strong>
                <span className="text-sm text-muted-foreground">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 grid gap-6 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">
            {tr("ui.pageAPropos.dOuViennentLesInformations")}
          </h2>
          <p className="mt-2">
            {tr("ui.pageAPropos.lesProgrammesPubliesParLes")}{" "}
            <Link to="/methode-editoriale" className="font-medium text-primary underline">
              {tr("ui.pageAPropos.methodeEditoriale")}
            </Link>
            .
          </p>
        </div>
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">
            {tr("ui.pageAPropos.independantEtGratuit")}
          </h2>
          <p className="mt-2">
            {tr("ui.pageAPropos.bledwayNAppartientAAucune")}{" "}
            <Link to="/confidentialite" className="font-medium text-primary underline">
              {tr("ui.pageAPropos.confidentialite")}
            </Link>
            ).
          </p>
        </div>
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">{tr("ui.pageAPropos.uneCommunaute")}</h2>
          <p className="mt-2">
            {tr("ui.pageAPropos.lesSalonsLesQuestionsPar")}{" "}
            <Link to="/charte" className="font-medium text-primary underline">
              {tr("ui.pageAPropos.charte")}
            </Link>
            {tr("ui.pageAPropos.pseudoEtAvatarSuffisentPersonne")}
          </p>
        </div>
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">
            {tr("ui.pageAPropos.toujoursVerifier")}
          </h2>
          <p className="mt-2">
            {tr("ui.pageAPropos.bledwayAideAComprendreEt")}
          </p>
        </div>
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        {tr("ui.pageAPropos.uneInformationErroneeUneIdee")}{" "}
        <Link to="/contact" className="font-semibold text-primary underline underline-offset-4">
          {tr("ui.pageAPropos.ecrivezNous")}
        </Link>
        .
      </p>
    </SiteLayout>
  );
}
