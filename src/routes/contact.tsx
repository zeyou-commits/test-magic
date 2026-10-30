import seoConfig from "../../seo.config.json";
import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";

const title = "Contact et signalement d'erreur — BledWay";
const description =
  "Signaler un horaire erroné, une ligne manquante ou un port à ajouter sur BledWay, la carte des ferries Europe ↔ Algérie.";

export const Route = createFileRoute("/contact")({
  head: () => seoHead(title, description, "/contact"),
  component: ContactPage,
});

function ContactPage() {
  return (
    <SiteLayout>
      <PageHero
        overline="Contact"
        title="Nous signaler une information"
        intro="La façon la plus rapide de nous aider : ouvrir la fiche concernée sur la carte et utiliser le bouton « Signaler une erreur »."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-display font-semibold">Signaler depuis la carte</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sur la fiche d'un port, d'une ligne ou d'un départ, le bouton de signalement transmet
            directement le contexte à notre équipe de modération.
          </p>
        </Card>
        <Card>
          <h2 className="font-display font-semibold">Nous écrire</h2>
          {seoConfig.contactEmail ? (
            <a
              href={`mailto:${seoConfig.contactEmail}?subject=${encodeURIComponent("Correction documentaire BledWay")}`}
              className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
            >
              {seoConfig.contactEmail}
            </a>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Le canal de contact pour les dossiers documentaires sera indiqué ici dès son
              ouverture. Les signalements depuis une fiche de la carte restent disponibles.
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Pour préparer une correction, relevez l'URL de la page, le passage concerné et une
            source datée. Ne transmettez pas de papiers d'identité ni de documents de véhicule.
          </p>
        </Card>
      </div>
    </SiteLayout>
  );
}
