import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";

const title = "À propos de Batogo, la carte des ferries vers l'Algérie";
const description =
  "Batogo rassemble ports, lignes, durées et départs des traversées vers l'Algérie, avec la source et la date de vérification de chaque information.";

export const Route = createFileRoute("/a-propos")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <SiteLayout>
      <PageHero
        overline="À propos"
        title="Batogo, l'information maritime rendue lisible"
        intro="« Bato » pour le bateau, « go » pour le départ : une carte unique pour comprendre en quelques secondes comment rejoindre l'Algérie par la mer."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Card>
          <h2 className="font-display font-semibold">Informer d'abord</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Nous ne vendons pas de billets. Nous rassemblons, vérifions et présentons clairement
            les ports, lignes, durées et départs.
          </p>
        </Card>
        <Card>
          <h2 className="font-display font-semibold">Sources visibles</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Chaque calendrier et chaque départ affiche sa source et sa date de vérification, ainsi
            que son niveau de fiabilité.
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
