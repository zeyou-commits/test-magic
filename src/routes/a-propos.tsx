import { seoHead } from "@/lib/seo/site";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";

const title = "À propos de BledWay, la carte des ferries Europe ↔ Algérie";
const description =
  "BledWay rassemble ports, lignes, durées et départs des traversées entre l'Europe et l'Algérie, et le suivi en direct des navires avec l'aide des voyageurs.";

export const Route = createFileRoute("/a-propos")({
  head: () => seoHead(title, description, "/a-propos"),
  component: AboutPage,
});

function AboutPage() {
  return (
    <SiteLayout>
      <PageHero
        overline="À propos"
        title="BledWay, l'information maritime rendue lisible"
        intro="Une carte unique pour comprendre en quelques secondes comment traverser entre l'Europe et l'Algérie, et savoir où en est votre bateau."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Card>
          <h2 className="font-display font-semibold">Informer d'abord</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Nous ne vendons pas de billets. Nous rassemblons et présentons clairement les ports,
            lignes, durées et départs.
          </p>
        </Card>
        <Card>
          <h2 className="font-display font-semibold">Avec les voyageurs</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Le signal des navires et les remontées des voyageurs sur place complètent les horaires.
            Une erreur signalée est corrigée pour tous.
          </p>
        </Card>
        <Card>
          <h2 className="font-display font-semibold">Avis modérés</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Les voyageurs notent les ports selon des critères précis ; chaque avis est relu avant
            publication.
          </p>
        </Card>
      </div>
      <p className="mt-10 text-sm text-muted-foreground">
        Une information erronée ?{" "}
        <Link to="/contact" className="font-semibold text-primary underline underline-offset-4">
          Signalez-la nous
        </Link>
        .
      </p>
    </SiteLayout>
  );
}
