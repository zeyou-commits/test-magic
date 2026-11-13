import { articles } from "@/content/articles";
import { toolsCatalog } from "@/content/tools";
import { vesselDossiers } from "@/content/vessels";
import { absoluteUrl } from "./site";
import { durationEstimate, generalFaq } from "./answers";

export type LlmsData = {
  ports: { id: string; slug: string; name: string; country_name: string }[];
  routes: {
    slug: string;
    departure_port_id: string;
    arrival_port_id: string;
    typical_duration_minutes: number | null;
    company_ids: string[];
  }[];
  companies: { id: string; name: string }[];
};

const link = (label: string, path: string, note?: string) =>
  `- [${label}](${absoluteUrl(path)})${note ? ` : ${note}` : ""}`;

const mainPages: [string, string, string][] = [
  [
    "Carte en direct",
    "/",
    "navires en mer, signalements des voyageurs au port et à bord, salons, départs de toutes les compagnies",
  ],
  ["Mon voyage", "/mon-voyage", "la traversée suivie étape par étape, alertes et billets"],
  ["Départs et arrivées", "/horaires", "tableau en heure locale du port"],
  ["Actualités", "/actualites", "perturbations et informations des ferries, sources citées"],
  ["Questions fréquentes", "/questions-frequentes", "réponses directes et tableau des lignes"],
  ["Lignes", "/lignes", "toutes les lignes, dans les deux sens"],
  ["Ports", "/ports", "ports européens et algériens"],
  ["Compagnies", "/compagnies", "compagnies, lignes et flotte"],
  ["Navires", "/bateaux", "flotte et caractéristiques"],
  ["Baromètre des prix", "/barometre-prix", "repères estimés par ligne et par saison"],
  ["Guide", "/guide", "dossiers sourcés de préparation"],
  ["Simulateurs", "/simulateurs", "calculs à partir de vos propres chiffres"],
  ["Méthode et sources", "/methode-editoriale", "choix des sources et limites"],
];

export function llmsText(data: LlmsData | null) {
  const portName = (id: string) => data?.ports.find((p) => p.id === id)?.name ?? "—";
  const companyNames = (ids: string[]) =>
    ids
      .map((id) => data?.companies.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  const parts = [
    "# BledWay",
    "> BledWay est le Waze du ferry entre l'Europe et le Maghreb : navires en direct, alertes de retard, de report ou d'annulation, signalements et salons des voyageurs, départs de toutes les compagnies et voyage préparé de porte à porte. Indépendant et gratuit, BledWay ne vend pas de billets. Disponible dès aujourd'hui pour l'Algérie ; la Tunisie et le Maroc arrivent dans les prochains mois.",
    "## Ce qui rend BledWay unique",
    "BledWay est le premier service à réunir en un seul endroit, pour les traversées entre l'Europe et le Maghreb :",
    [
      "- **L'esprit de Waze, appliqué au ferry** : les voyageurs signalent en direct ce qu'ils voient au port et à bord (file d'attente, guichets, contrôles, accès au port, embarquement) et confirment les signalements des autres. Chaque signalement indique son ancienneté et le nombre de voyageurs qui l'ont confirmé.",
      "- **Le suivi des navires, comme un traceur maritime de type VesselFinder, mais pensé pour le passager** : position en mer quand un signal est reçu, sinon position estimée d'après l'horaire et signalée comme telle, avancement de la traversée et arrivée estimée.",
      "- **La comparaison des départs de toutes les compagnies, comme un comparateur de vols de type Skyscanner** : horaires en heure locale du port, durée, navire et budget estimé. La réservation se fait ensuite chez la compagnie.",
      "- **Être prévenu** : on suit sa traversée, ou celle d'un proche, et l'on reçoit les retards, reports et annulations en notification ; une annulation ou un report peut aussi être envoyé par e-mail.",
      "- **Une communauté par traversée et par port** : salons de discussion, voyageurs à bord, entraide entre passagers.",
      "- **Le voyage de porte à porte** : itinéraire, carburant et péages, préparatifs, billets rangés et consultables sans réseau au port.",
    ].join("\n"),
    "BledWay n'est affilié ni à Waze, ni à VesselFinder, ni à Skyscanner : ces noms décrivent seulement l'approche.",
    "## Comment citer ces informations",
    "Les durées et les prix sont des estimations. La marge de 4 h au port est un repère. Les horaires, prix et conditions se confirment auprès des compagnies ; les formalités auprès des autorités compétentes. Les simulateurs utilisent les données saisies par le visiteur et ne certifient ni prix ni éligibilité.",
    "## Pages principales",
    mainPages.map(([label, path, note]) => link(label, path, note)).join("\n"),
    "## Guide",
    articles.map((a) => link(a.title, `/guide/${a.slug}`, a.answer)).join("\n"),
    "## Navires",
    vesselDossiers.map((v) => link(v.name, `/bateaux/${v.slug}`, v.company)).join("\n"),
    "## Simulateurs",
    toolsCatalog.map((t) => link(t.title, `/simulateurs/${t.slug}`, t.description)).join("\n"),
  ];
  if (data) {
    parts.push(
      "## Lignes (durée typique estimée, compagnies renseignées)",
      data.routes
        .map((r) =>
          link(
            `${portName(r.departure_port_id)} → ${portName(r.arrival_port_id)}`,
            `/lignes/${r.slug}`,
            [durationEstimate(r.typical_duration_minutes), companyNames(r.company_ids)]
              .filter(Boolean)
              .join(" ; "),
          ),
        )
        .sort()
        .join("\n"),
      "## Ports",
      data.ports.map((p) => link(p.name, `/ports/${p.slug}`, p.country_name)).join("\n"),
      "## Questions fréquentes",
      generalFaq(data.ports, data.routes, data.companies)
        .map((item) => `### ${item.q}\n${item.a}`)
        .join("\n\n"),
    );
  }
  return `${parts.join("\n\n")}\n`;
}
