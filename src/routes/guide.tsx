import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";

const title = "Guide pratique de la traversée en ferry vers l'Algérie — Batogo";
const description =
  "Préparer sa traversée vers l'Algérie : documents, enregistrement au port, véhicule, bagages, animaux, durée des formalités et conseils pour la haute saison.";

const faq = [
  {
    q: "Combien de temps avant le départ faut-il se présenter au port ?",
    a: "Les compagnies demandent en général une présentation plusieurs heures avant le départ, davantage avec un véhicule et en haute saison. Vérifiez toujours l'heure indiquée sur votre billet : elle prime sur toute autre information.",
  },
  {
    q: "Peut-on embarquer une voiture ?",
    a: "La plupart des liaisons vers l'Algérie acceptent les véhicules de tourisme. La carte grise, l'assurance valable pour l'Algérie et le respect de la réglementation douanière sont demandés à l'embarquement.",
  },
  {
    q: "Quels documents faut-il prévoir ?",
    a: "Un passeport en cours de validité et, selon votre nationalité, un visa. Les mineurs et les animaux ont des exigences particulières : renseignez-vous auprès de la compagnie et des autorités avant de réserver.",
  },
  {
    q: "Les horaires changent-ils souvent ?",
    a: "Oui, surtout en été et en cas de météo difficile. Batogo indique pour chaque information sa source et sa date de vérification, mais la compagnie reste la seule référence officielle.",
  },
];

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: GuidePage,
});

function GuidePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <SiteLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageHero
        overline="Guide"
        title="Préparer sa traversée en ferry vers l'Algérie"
        intro="L'essentiel avant de réserver et le jour du départ, port par port. Les informations officielles restent celles de votre compagnie."
      />

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold">Avant de réserver</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Comparez les durées de traversée sur la page des lignes.</li>
            <li>Vérifiez si le port de départ est ouvert à la période visée.</li>
            <li>Anticipez la haute saison : les places véhicule partent en premier.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-display text-lg font-semibold">Le jour du départ</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Présentez-vous largement en avance, surtout avec un véhicule.</li>
            <li>Gardez vos documents d'identité accessibles pendant les contrôles.</li>
            <li>Consultez les prochains départs pour repérer un retard éventuel.</li>
          </ul>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Questions fréquentes</h2>
        <div className="mt-4 space-y-4">
          {faq.map((item) => (
            <Card key={item.q}>
              <h3 className="font-display font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </Card>
          ))}
        </div>
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        Envie de voir les liaisons en un coup d'œil ?{" "}
        <Link to="/" className="font-semibold text-primary underline underline-offset-4">
          Ouvrir la carte
        </Link>
        .
      </p>
    </SiteLayout>
  );
}
