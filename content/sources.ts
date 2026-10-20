import type { Source } from "./types";
export const sources: Record<string, Source> = {
  decree: {
    name: "Journal officiel algérien n° 11 du 22 février 2023, décret 23-74, pages 6–7",
    url: "https://www.joradp.dz/FTP/jo-francais/2023/F2023011.pdf",
    note: "Texte fondateur : définition de l'âge, résidents, dossier et conformité. À confronter aux textes et instructions applicables au jour de l'opération.",
  },
  customs: {
    name: "Douane algérienne — Importation de véhicules",
    url: "https://www.douane.gov.dz/spip.php?rubrique220",
    note: "Portail officiel pour choisir le régime, accéder aux informations et à la simulation douanière. Le site peut être temporairement indisponible.",
  },
  identity: {
    name: "CORSICA linea — Pièces d'identité et formalités",
    url: "https://www.corsicalinea.com/informations/pieces-didentite-et-billet/",
    note: "Exigences de la compagnie. Les conditions d'entrée relèvent aussi des autorités compétentes.",
  },
  boarding: {
    name: "CORSICA linea — Enregistrement et embarquement",
    url: "https://www.corsicalinea.com/informations/embarquement/",
    note: "Consignes propres à cette compagnie ; vérifier le billet pour le départ choisi.",
  },
  marseille: {
    name: "CORSICA linea — Accès au port de Marseille",
    url: "https://www.corsicalinea.com/informations/embarquement/itineraire-port-marseille/",
    note: "Accès officiels publiés par l'opérateur ; utiliser la porte figurant sur la convocation.",
  },
  sete: {
    name: "CORSICA linea — Accès au port de Sète",
    url: "https://www.corsicalinea.com/informations/embarquement/itineraire-port-sete/",
    note: "Informations d'accès de l'opérateur. Ne pas confondre gare SNCF et terminal maritime.",
  },
  children: {
    name: "CORSICA linea — Voyager avec des enfants",
    url: "https://www.corsicalinea.com/informations/voyager-avec-des-enfants/",
    note: "Services et conditions de transport à vérifier pour le navire et le billet retenus.",
  },
  animals: {
    name: "CORSICA linea — Voyager avec un animal",
    url: "https://www.corsicalinea.com/informations/voyage-avec-des-animaux/",
    note: "Le transport maritime et les formalités sanitaires d'entrée et de retour sont deux vérifications distinctes.",
  },
  nicoli: {
    name: "CORSICA linea — Fiche officielle du Jean Nicoli",
    url: "https://www.corsicalinea.com/a-bord/nos-ferries/jean-nicoli/",
    note: "Caractéristiques de la version française consultée ; capacités annoncées, sans garantie de disponibilité commerciale.",
  },
  casanova: {
    name: "CORSICA linea — Fiche officielle du Danielle Casanova",
    url: "https://www.corsicalinea.com/a-bord/nos-ferries/danielle-casanova/",
    note: "La capacité garage publiée est de 650 voitures : ne pas reprendre automatiquement les 700 voitures d'anciennes fiches.",
  },
  mediterranee: {
    name: "CORSICA linea — Fiche officielle du Méditerranée",
    url: "https://www.corsicalinea.com/a-bord/nos-ferries/mediterranee/",
    note: "Présentation des équipements de l'opérateur. Une présentation du navire ne confirme pas son affectation à une date donnée.",
  },
  badji: {
    name: "OSK Design — Projet M.V. Badji Mokhtar III",
    url: "https://www.oskdesign.com/case/mv-badji-mokhatar-iii",
    note: "Source du concepteur naval : client Algérie Ferries, projet RoPax de 2021. Ne confirme pas l'exploitation actuelle.",
  },
  grans: {
    name: "VINCI Autoroutes — Parking de covoiturage de Grans–Salon-de-Provence",
    url: "https://www.vinci-autoroutes.com/fr/actualites/services-et-aires/clement-beaune-en-visite-sur-le-parking-de-covoiturage-de-grans-salon/",
    note: "Publication de 2022 attestant ce parking sur l'A54. Conditions actuelles à vérifier auprès du gestionnaire.",
  },
  gallargues: {
    name: "VINCI Autoroutes — Parking de covoiturage de Gallargues",
    url: "https://www.vinci-autoroutes.com/fr/actualites/services-et-aires/parking-covoiturage-gallargues-autoroute-A9/",
    note: "Publication de 2021 situant le parking entre Montpellier et Nîmes. Ce n'est pas une mesure de fréquentation actuelle.",
  },
  avignon: {
    name: "VINCI Autoroutes — Parking de covoiturage d'Avignon Nord",
    url: "https://www.vinci-autoroutes.com/fr/actualites/services-et-aires/nouveau-parking-covoiturage-avignon-nord-a7/",
    note: "Publication de novembre 2024 situant le parking à l'échangeur d'Avignon Nord sur l'A7.",
  },
  narbonne: {
    name: "Aude Tourisme — Aire de covoiturage à Narbonne",
    url: "https://www.audetourisme.com/en/fiche/narbonne/aire-de-covoiturage_TFOCOMMLAR011V50XWAA/",
    note: "Fiche de l'organisme touristique départemental. Consulter sa localisation avant de fixer le rendez-vous.",
  },
  national: {
    name: "Point d'accès national — Base nationale des lieux de covoiturage",
    url: "https://www.data.gouv.fr/datasets/base-nationale-des-lieux-de-covoiturage",
    note: "Référence pour enrichir et actualiser un annuaire ; les informations proviennent de contributeurs et gestionnaires multiples.",
  },
};
