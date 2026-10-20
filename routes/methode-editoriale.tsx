import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  Breadcrumbs,
  ContentSection,
  EditorialHero,
  textLink,
} from "@/components/editorial/Editorial";
import { EDITORIAL_DATE, seoHead } from "@/lib/seo/site";
import type { Section } from "@/content/types";
export const Route = createFileRoute("/methode-editoriale")({
  head: () =>
    seoHead(
      "Sources, calculs et méthode éditoriale | Batogo",
      "Comment Batogo distingue sources officielles, dossiers documentaires, informations évolutives et calculs personnels pour préparer un voyage en Algérie.",
      "/methode-editoriale",
    ),
  component: Method,
});
const sections: Section[] = [
  {
    id: "sources",
    title: "Des références identifiables",
    paragraphs: [
      "Les nouveaux dossiers documentaires privilégient les autorités pour les formalités, les transporteurs pour leurs services et les gestionnaires pour les accès. Les liens sont placés à la fin de chaque dossier avec une note de portée. Une publication ancienne peut attester l'existence d'un lieu sans confirmer ses conditions actuelles.",
      "Le travail éditorial de ce lot est daté du 17 octobre 2026. Il ne constitue pas une visite des lieux, un essai à bord ou une certification juridique. Les contenus d'organisation et les exemples sont rédigés pour aider à préparer les bonnes questions.",
    ],
  },
  {
    id: "dates",
    title: "Des informations qui n'évoluent pas au même rythme",
    paragraphs: [
      "La taille d'un navire, son affectation du jour, un horaire de ferry et une règle d'importation sont des informations différentes. Une fiche de caractéristiques ne confirme pas une place disponible. Le billet et les communications du transporteur restent la référence de votre départ.",
      "Pour une décision douanière, faites confirmer le régime et les règles applicables au moment de l'opération par le service compétent. Le texte fondateur de 2023 ne constitue pas à lui seul une consolidation exhaustive de tous les textes ultérieurs.",
    ],
  },
  {
    id: "calculs",
    title: "Des simulateurs dont les hypothèses restent visibles",
    paragraphs: [
      "Les outils de ce lot calculent localement à partir des champs saisis. Ils ne récupèrent pas de prix de billets, de taux de change ou de barème fiscal. Les exemples sont fictifs et identifiés comme tels. L'outil d'âge ne statue pas sur l'éligibilité d'un véhicule.",
      "Le budget d'importation affiche un résultat incomplet si la fiscalité ou la conversion ne sont pas renseignées. Le partage de frais inclut le conducteur dans les occupants. La comparaison des voyages attend des montants totaux pour le groupe et le périmètre choisi.",
    ],
  },
  {
    id: "independance",
    title: "Une information indépendante, sans classement inventé",
    paragraphs: [
      "Batogo ne se présente pas comme une autorité douanière ou une compagnie maritime. Les nouvelles fiches de covoiturage ne classent pas les lieux par notoriété ou fréquentation, faute de mesure disponible. Aucun avis de voyageur, score ou témoignage n'a été fabriqué pour ces dossiers.",
      "La page Contact indique les canaux disponibles et la préparation d'une correction : URL, passage concerné et référence datée. Le contact pour les nouveaux dossiers reste à renseigner. Évitez d'envoyer des documents personnels qui ne sont pas nécessaires à la correction.",
    ],
  },
];
function Method() {
  return (
    <SiteLayout>
      <Breadcrumbs items={[{ name: "Méthode éditoriale", path: "/methode-editoriale" }]} />
      <EditorialHero
        label="La confiance se documente"
        title="Ce que nos informations permettent de décider"
        intro="Préparer un voyage exige des repères utiles et des limites explicites. Voici comment lire les dossiers, les sources et les résultats des nouveaux outils Batogo."
      />
      <div className="max-w-3xl">
        <time dateTime={EDITORIAL_DATE} className="text-sm text-muted-foreground">
          Version éditoriale du 17 octobre 2026
        </time>
        {sections.map((s) => (
          <ContentSection key={s.id} section={s} />
        ))}
        <p className="mt-8">
          <a href="/contact" className={textLink}>
            Contact et signalements
          </a>
        </p>
      </div>
    </SiteLayout>
  );
}
