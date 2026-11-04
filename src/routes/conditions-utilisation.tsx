import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { LEGAL_UPDATED, LegalSections, PageLink } from "@/components/layout/LegalPage";

const title = "Conditions d'utilisation — BledWay";
const description =
  "Conditions d'utilisation de BledWay : accès au service, compte, contenus publiés par les voyageurs, modération et responsabilité.";

export const Route = createFileRoute("/conditions-utilisation")({
  head: () => seoHead(title, description, "/conditions-utilisation"),
  component: TermsPage,
});

function TermsPage() {
  return (
    <SiteLayout>
      <PageHero
        overline="Informations légales"
        title="Conditions d'utilisation"
        intro="Les règles d'usage de BledWay, service d'information indépendant et gratuit sur les traversées entre l'Europe et l'Algérie."
      />
      <LegalSections
        updated={LEGAL_UPDATED}
        sections={[
          {
            id: "service",
            title: "Le service",
            body: (
              <>
                <p>
                  BledWay rassemble des horaires, des positions de navires, l'état de la mer et des
                  informations partagées par les voyageurs : carte, départs et arrivées, salons,
                  questions par ligne, avis, signalements, préparation du voyage.
                </p>
                <ul>
                  <li>
                    <strong>Gratuit</strong>, sans abonnement.
                  </li>
                  <li>
                    <strong>BledWay ne vend aucun billet</strong> et n'agit pas pour le compte des
                    compagnies. Les liens vers des sites de réservation mènent à des services tiers,
                    avec leurs propres conditions.
                  </li>
                  <li>
                    Le service peut évoluer, être suspendu pour maintenance ou interrompu en tout ou
                    partie.
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: "fiabilite",
            title: "Des informations indicatives",
            body: (
              <>
                <p>
                  Horaires, retards, positions, durées, prix et état de la mer sont donnés à titre
                  indicatif. Ils peuvent être incomplets, en retard ou erronés : le signal des
                  navires peut être interrompu, un horaire peut changer sans préavis.
                </p>
                <p>
                  <strong>
                    Seules les compagnies maritimes et les autorités portuaires font foi.
                  </strong>{" "}
                  Vérifiez toujours votre traversée auprès de la compagnie avant de partir.
                </p>
              </>
            ),
          },
          {
            id: "compte",
            title: "Votre compte",
            body: (
              <ul>
                <li>15 ans minimum pour créer un compte et écrire.</li>
                <li>Un seul compte par personne, avec des informations exactes.</li>
                <li>
                  Vous êtes responsable de vos accès. Prévenez-nous en cas d'usage frauduleux.
                </li>
                <li>
                  Le pseudo ne peut être changé qu'une fois. Il ne doit ni usurper une identité ni
                  contenir votre nom complet.
                </li>
              </ul>
            ),
          },
          {
            id: "contenus",
            title: "Ce que vous publiez",
            body: (
              <>
                <p>
                  Vous restez responsable de vos messages, questions, réponses, avis et
                  signalements. Vous vous engagez à respecter la{" "}
                  <PageLink to="/charte">charte de la communauté</PageLink>, la loi et les droits
                  des autres. Sont notamment interdits :
                </p>
                <ul>
                  <li>propos haineux, injurieux, discriminatoires ou menaçants ;</li>
                  <li>fausses informations volontaires, notamment des signalements inventés ;</li>
                  <li>publicité, démarchage, revente de billets, arnaques ;</li>
                  <li>
                    données personnelles d'autrui (numéro, adresse, plaque, visage reconnaissable)
                    sans son accord.
                  </li>
                </ul>
                <p>
                  Vous autorisez BledWay à afficher, gratuitement, ces contenus sur le service le
                  temps de leur conservation (voir la{" "}
                  <PageLink to="/confidentialite">politique de confidentialité</PageLink>).
                </p>
              </>
            ),
          },
          {
            id: "moderation",
            title: "Modération et signalement",
            body: (
              <>
                <p>
                  Les avis et leurs photos sont relus avant publication. Les salons sont modérés par
                  l'équipe, aidée d'un outil automatique ; une photo de salon est d'abord vérifiée
                  automatiquement sur votre appareil, puis masquée si deux personnes la signalent,
                  en attendant l'avis de l'équipe. BledWay peut refuser, masquer ou retirer un contenu
                  contraire à la charte ou à la loi, et suspendre l'écriture d'un compte,
                  temporairement ou durablement.
                </p>
                <p>
                  Un contenu illicite se signale avec le bouton « Signaler » du message, ou depuis
                  la page <PageLink to="/contact">Contact</PageLink> en indiquant le contenu, son
                  emplacement et la raison. Les signalements sont traités dans les meilleurs délais.
                </p>
              </>
            ),
          },
          {
            id: "propriete",
            title: "Propriété intellectuelle",
            body: (
              <p>
                Le site, ses textes, illustrations, personnages et logo appartiennent à BledWay. Les
                noms et logos des compagnies et des navires appartiennent à leurs détenteurs. Les
                données cartographiques proviennent d'OpenStreetMap (licence ODbL). Toute
                reproduction du site ou extraction de ses données à grande échelle est interdite
                sans accord écrit.
              </p>
            ),
          },
          {
            id: "responsabilite",
            title: "Responsabilité",
            body: (
              <p>
                BledWay ne peut être tenu responsable d'une décision prise sur la seule base des
                informations du site (départ manqué, attente, frais), ni des contenus publiés par
                les voyageurs ou des sites tiers vers lesquels il renvoie, ni d'une indisponibilité
                temporaire du service.
              </p>
            ),
          },
          {
            id: "donnees",
            title: "Données personnelles",
            body: (
              <p>
                Leur usage est décrit dans la{" "}
                <PageLink to="/confidentialite">politique de confidentialité</PageLink>.
              </p>
            ),
          },
          {
            id: "evolution",
            title: "Évolution, droit applicable",
            body: (
              <>
                <p>
                  Ces conditions et la charte peuvent évoluer. Quand la charte change, elle vous est
                  présentée à nouveau avant votre message suivant.
                </p>
                <p>
                  Ces conditions sont régies par le droit français. En cas de litige, une solution
                  amiable est recherchée en premier lieu, via la page{" "}
                  <PageLink to="/contact">Contact</PageLink>.
                </p>
              </>
            ),
          },
        ]}
      />
    </SiteLayout>
  );
}
