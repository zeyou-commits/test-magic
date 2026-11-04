import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { LEGAL_UPDATED, LegalSections, PageLink } from "@/components/layout/LegalPage";

const title = "Mentions légales — BledWay";
const description =
  "Mentions légales du site BledWay : éditeur, hébergement, propriété intellectuelle et limites de responsabilité sur les informations maritimes publiées.";

export const Route = createFileRoute("/mentions-legales")({
  head: () => seoHead(title, description, "/mentions-legales"),
  component: LegalPage,
});

function LegalPage() {
  return (
    <SiteLayout>
      <PageHero
        overline="Informations légales"
        title="Mentions légales"
        intro="BledWay (www.bledway.com) est un service d'information indépendant sur les traversées maritimes entre l'Europe et l'Algérie."
      />
      <LegalSections
        updated={LEGAL_UPDATED}
        sections={[
          {
            id: "editeur",
            title: "Éditeur",
            body: (
              <p>
                BledWay est édité à titre non professionnel par un particulier. Comme le permet la
                loi pour la confiance dans l'économie numérique (LCEN) du 21 juin 2004, il a choisi
                de ne pas rendre publique son identité : ses coordonnées ont été communiquées à ses
                hébergeurs. Pour le joindre, y compris pour une demande concernant vos données ou un
                contenu illicite : la page <PageLink to="/contact">Contact</PageLink>.
              </p>
            ),
          },
          {
            id: "hebergement",
            title: "Hébergement",
            body: (
              <ul>
                <li>
                  <strong>Site</strong> : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723,
                  États-Unis (vercel.com).
                </li>
                <li>
                  <strong>Base de données et comptes</strong> : Supabase Inc. (supabase.com).
                </li>
                <li>
                  <strong>Nom de domaine</strong> : OVH SAS, 2 rue Kellermann, 59100 Roubaix, France
                  (ovhcloud.com).
                </li>
              </ul>
            ),
          },
          {
            id: "sources",
            title: "Sources des informations",
            body: (
              <p>
                Horaires issus des programmes publiés par les compagnies et vérifiés par l'équipe,
                positions issues du signal AIS des navires, état de la mer fourni par Open-Meteo,
                informations partagées par les voyageurs. La démarche est détaillée dans la{" "}
                <PageLink to="/methode-editoriale">méthode éditoriale</PageLink>.
              </p>
            ),
          },
          {
            id: "responsabilite",
            title: "Responsabilité",
            body: (
              <p>
                Les horaires, durées et disponibilités publiés sont donnés à titre indicatif. Seules
                les compagnies maritimes et les autorités portuaires font foi. BledWay ne vend aucun
                billet et ne garantit pas l'exactitude des informations transmises par des tiers.
                Voir les <PageLink to="/conditions-utilisation">conditions d'utilisation</PageLink>.
              </p>
            ),
          },
          {
            id: "propriete",
            title: "Propriété intellectuelle et crédits",
            body: (
              <ul>
                <li>
                  Textes, illustrations, personnages et logo : BledWay, reproduction interdite sans
                  accord.
                </li>
                <li>
                  Noms et logos des compagnies et des navires : propriété de leurs détenteurs,
                  utilisés pour les identifier.
                </li>
                <li>
                  Fond de carte : OpenFreeMap, données © contributeurs OpenStreetMap (licence ODbL).
                </li>
                <li>Prévisions marines : Open-Meteo (licence CC BY 4.0).</li>
              </ul>
            ),
          },
          {
            id: "donnees",
            title: "Données personnelles",
            body: (
              <p>
                Voir la <PageLink to="/confidentialite">politique de confidentialité</PageLink>.
              </p>
            ),
          },
        ]}
      />
    </SiteLayout>
  );
}
