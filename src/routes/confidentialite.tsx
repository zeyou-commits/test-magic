import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { LEGAL_UPDATED, LegalSections, PageLink } from "@/components/layout/LegalPage";

const title = "Politique de confidentialité — BledWay";
const description =
  "Quelles données BledWay collecte, pourquoi, combien de temps elles sont gardées, qui les traite et comment exercer vos droits (RGPD).";

export const Route = createFileRoute("/confidentialite")({
  head: () => seoHead(title, description, "/confidentialite"),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <SiteLayout>
      <PageHero
        overline="Confidentialité"
        title="Vos données sur BledWay"
        intro="Le minimum nécessaire, gardé le moins longtemps possible, jamais revendu. Voici le détail, conformément au RGPD."
      />
      <LegalSections
        updated={LEGAL_UPDATED}
        sections={[
          {
            id: "responsable",
            title: "Qui est responsable de vos données",
            body: (
              <p>
                L'éditeur de BledWay, dont l'identité figure dans les{" "}
                <PageLink to="/mentions-legales">mentions légales</PageLink>. Pour toute question
                sur vos données : la page <PageLink to="/contact">Contact</PageLink>.
              </p>
            ),
          },
          {
            id: "sans-compte",
            title: "Sans compte",
            body: (
              <>
                <p>
                  Vous pouvez consulter la carte, les départs, les lignes, les ports et lire les
                  salons sans créer de compte.
                </p>
                <ul>
                  <li>
                    <strong>Mesure d'audience</strong> : pages vues et étapes de recherche, comptées
                    de façon anonyme, sans cookie, sans adresse IP, sans compte.
                  </li>
                  <li>
                    <strong>Préférences gardées sur votre appareil</strong> (stockage local du
                    navigateur) : traversée suivie, trajet de porte à porte, filtres, bandeaux
                    fermés. Le trajet de porte à porte ne nous est pas envoyé une fois calculé. Vous
                    effacez ces préférences en vidant les données du site dans votre navigateur.
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: "compte",
            title: "Avec un compte",
            body: (
              <ul>
                <li>
                  <strong>Compte</strong> : adresse e-mail et mot de passe (jamais stocké en clair),
                  ou connexion Google (adresse e-mail, nom, photo).
                </li>
                <li>
                  <strong>Profil voyageur</strong> : pseudo, avatar, couleur, humeur. C'est tout ce
                  que voient les autres : ni nom, ni e-mail, ni dates de voyage.
                </li>
                <li>
                  <strong>Traversées suivies</strong> et réglages de notifications.
                </li>
                <li>
                  <strong>Contributions</strong> : avis, notes, signalements, messages des salons,
                  questions et réponses, réactions, avec leur date.
                </li>
              </ul>
            ),
          },
          {
            id: "position",
            title: "Votre position",
            body: (
              <>
                <p>
                  Signaler une situation, confirmer un signalement ou écrire dans le salon d'un port
                  demande votre position, pour vérifier que vous êtes sur place.{" "}
                  <strong>Elle sert à ce seul contrôle et n'est pas enregistrée.</strong> Vous
                  pouvez refuser : le signalement est alors transmis à l'équipe pour vérification.
                </p>
                <p>
                  Pour corriger les pannes de localisation, un journal technique est gardé 14 jours
                  : résultat de la demande, type d'appareil et de navigateur, compte s'il est
                  connecté. Il ne contient jamais vos coordonnées.
                </p>
              </>
            ),
          },
          {
            id: "finalites",
            title: "Pourquoi, et sur quelle base",
            body: (
              <ul>
                <li>
                  <strong>Faire fonctionner le service</strong> (compte, traversées suivies, salons)
                  : exécution des conditions d'utilisation.
                </li>
                <li>
                  <strong>Modérer et protéger la communauté</strong> (charte, signalements, lutte
                  contre les abus) : intérêt légitime et obligations légales.
                </li>
                <li>
                  <strong>Améliorer la fiabilité des informations</strong> (mesure d'audience
                  anonyme, journal technique) : intérêt légitime.
                </li>
                <li>
                  <strong>Notifications</strong> sur votre téléphone ou ordinateur : votre
                  consentement, retirable à tout moment.
                </li>
              </ul>
            ),
          },
          {
            id: "durees",
            title: "Combien de temps",
            body: (
              <ul>
                <li>
                  <strong>Messages des salons de traversée</strong> : effacés 30 jours après la
                  traversée. <strong>Salons de port et questions de ligne</strong> : 30 jours après
                  l'envoi.
                </li>
                <li>
                  <strong>Messages privés</strong> : effacés 7 jours après la traversée, ou 30 jours
                  en cas de signalement.
                </li>
                <li>
                  <strong>Avis</strong> : tant qu'ils sont publiés, ou jusqu'à leur suppression par
                  vous ou par la modération.
                </li>
                <li>
                  <strong>Signalements</strong> : affichés quelques heures selon la situation, puis
                  gardés pour mesurer la fiabilité des informations.
                </li>
                <li>
                  <strong>Journal technique de localisation</strong> : 14 jours.
                </li>
                <li>
                  <strong>Compte et profil</strong> : jusqu'à la suppression du compte.
                </li>
              </ul>
            ),
          },
          {
            id: "destinataires",
            title: "Qui traite vos données",
            body: (
              <>
                <p>
                  Seule l'équipe BledWay (administration et modération) y accède, dans la limite de
                  son rôle. <strong>Aucune revente, aucune publicité ciblée.</strong> Nous faisons
                  appel à des prestataires techniques :
                </p>
                <ul>
                  <li>
                    <strong>Vercel</strong> : hébergement du site.
                  </li>
                  <li>
                    <strong>Supabase</strong> : base de données, comptes et e-mails de connexion.
                  </li>
                  <li>
                    <strong>Google</strong> : connexion avec Google si vous la choisissez, et
                    polices de caractères chargées par votre navigateur.
                  </li>
                  <li>
                    <strong>Services de notification</strong> de votre navigateur (Google, Apple,
                    Mozilla…) : acheminement des notifications que vous avez acceptées.
                  </li>
                  <li>
                    <strong>Open-Meteo</strong> : état de la mer. Votre navigateur l'interroge avec
                    les coordonnées du trajet : il reçoit votre adresse IP, jamais votre position ni
                    votre compte.
                  </li>
                  <li>
                    <strong>OpenFreeMap</strong> : fond de carte, chargé par votre navigateur.
                  </li>
                  <li>
                    <strong>Photon et OSRM</strong> : calcul du trajet de porte à porte. Nos
                    serveurs leur transmettent les villes saisies, sans votre adresse IP ni votre
                    compte.
                  </li>
                </ul>
                <p>
                  Certains de ces prestataires sont établis hors de l'Union européenne, notamment
                  aux États-Unis. Ces transferts s'appuient sur les garanties prévues par le RGPD
                  (clauses contractuelles types de la Commission européenne ou cadre de protection
                  des données UE–États-Unis, selon le prestataire).
                </p>
              </>
            ),
          },
          {
            id: "salons",
            title: "Salons, messages privés et modération",
            body: (
              <>
                <p>
                  Les messages des salons sont lisibles par les visiteurs du site, sous votre
                  pseudo. Ils sont soumis à la{" "}
                  <PageLink to="/charte">charte de la communauté</PageLink> et peuvent être relus
                  par l'équipe et par un outil de modération automatique.
                </p>
                <p>
                  Les messages privés entre voyageurs ne sont relus ni par l'équipe ni par l'outil
                  de modération. Ils ne sont lus que si l'un des deux participants signale la
                  conversation.
                </p>
              </>
            ),
          },
          {
            id: "securite",
            title: "Sécurité",
            body: (
              <p>
                Connexions chiffrées (HTTPS), mots de passe jamais stockés en clair, accès aux
                données limité par des règles de sécurité au niveau de la base. Votre identifiant de
                compte n'est jamais rendu public.
              </p>
            ),
          },
          {
            id: "droits",
            title: "Vos droits",
            body: (
              <>
                <p>
                  Vous pouvez à tout moment accéder à vos données, les rectifier, les effacer, en
                  limiter l'usage, vous opposer à un traitement fondé sur l'intérêt légitime,
                  récupérer vos données (portabilité) et retirer votre consentement aux
                  notifications.
                </p>
                <ul>
                  <li>
                    <strong>Depuis « Mon profil »</strong> : pseudo, avatar, notifications,
                    traversées suivies, avis non encore publiés.
                  </li>
                  <li>
                    <strong>Pour tout le reste</strong>, dont la suppression complète du compte : la
                    page <PageLink to="/contact">Contact</PageLink>. Réponse sous un mois au plus.
                  </li>
                </ul>
                <p>
                  Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL
                  (cnil.fr).
                </p>
              </>
            ),
          },
          {
            id: "mineurs",
            title: "Mineurs",
            body: (
              <p>
                Il faut avoir au moins 15 ans pour créer un compte et écrire dans les salons. En
                dessous, la consultation reste possible sans compte.
              </p>
            ),
          },
          {
            id: "evolution",
            title: "Évolution de cette politique",
            body: (
              <p>
                Cette page évolue avec le service ; la date de mise à jour figure en tête. Un
                changement important est annoncé sur le site.
              </p>
            ),
          },
        ]}
      />
    </SiteLayout>
  );
}
