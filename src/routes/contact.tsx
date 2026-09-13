import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHero, SiteLayout } from "@/components/layout/SiteLayout";

const title = "Contact et signalement d'erreur — Batogo";
const description =
  "Signaler un horaire erroné, une ligne manquante ou un port à ajouter sur Batogo, la carte des ferries vers l'Algérie.";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
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
          <p className="mt-2 text-sm text-muted-foreground">
            Vous représentez une compagnie ou une autorité portuaire et souhaitez nous transmettre
            vos calendriers officiels ? Indiquez-nous l'adresse à utiliser et nous ajouterons ce
            canal de contact ici.
          </p>
        </Card>
      </div>
    </SiteLayout>
  );
}
