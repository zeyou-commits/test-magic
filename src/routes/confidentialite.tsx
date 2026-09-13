import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";

const title = "Politique de confidentialité — Batogo";
const description =
  "Quelles données Batogo collecte lors de la création d'un compte, de la publication d'un avis ou d'un signalement, et comment les supprimer.";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <SiteLayout>
      <PageHero
        overline="Confidentialité"
        title="Vos données sur Batogo"
        intro="Nous collectons le minimum nécessaire pour permettre les avis, les signalements et la gestion de votre compte."
      />
      <div className="mt-8 max-w-3xl space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">Données collectées</h2>
          <p className="mt-1">
            Adresse e-mail et, si vous le souhaitez, nom affiché et photo de profil lors d'une
            connexion avec Google. Vos avis, notes et signalements sont conservés avec la date de
            publication.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Usage</h2>
          <p className="mt-1">
            Ces données servent uniquement à faire fonctionner votre compte, à modérer les
            contributions et à améliorer la fiabilité des informations publiées. Aucune revente à
            des tiers.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Vos droits</h2>
          <p className="mt-1">
            Depuis votre espace « Mon profil », vous pouvez modifier vos informations et supprimer
            vos avis non encore publiés. Pour supprimer entièrement votre compte, contactez-nous.
          </p>
        </section>
      </div>
    </SiteLayout>
  );
}
