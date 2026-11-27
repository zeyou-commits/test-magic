import { articles } from "@/content/articles";
import { toolsCatalog } from "@/content/tools";
import { vesselDossiers } from "@/content/vessels";
import { bledRoutePages } from "@/lib/routesDuBled/pages";
import { absoluteUrl } from "./site";
import { PITCH, TICKETING } from "./pitch";
import { benchmarkFor, durationEstimate, generalFaq } from "./answers";

export type LlmsData = {
  ports: { id: string; slug: string; name: string; country_name: string }[];
  routes: {
    slug: string;
    departure_port_id: string;
    arrival_port_id: string;
    typical_duration_minutes: number | null;
    company_ids: string[];
  }[];
  companies: { id: string; name: string; slug?: string; status?: string }[];
  vessels?: {
    slug: string;
    name: string;
    company_id: string | null;
    status: string;
    build_year?: number | null;
    passenger_capacity?: number | null;
  }[];
};

const link = (label: string, path: string, note?: string) =>
  `- [${label}](${absoluteUrl(path)})${note ? ` : ${note}` : ""}`;

const mainPages: [string, string, string][] = [
  [
    "Carte en direct",
    "/",
    "navires en mer, signalements des voyageurs au port et à bord, salons, départs de toutes les compagnies",
  ],
  ["Préparer mon voyage", "/preparer-mon-voyage", "papiers, voiture, route, budget et réservation, pas à pas"],
  [
    "Papiers du voyage",
    "/papiers-voyage-algerie",
    "visa, passeports, enfants, consulat : les démarches selon la situation de chacun",
  ],
  ["Départs et arrivées", "/horaires", "tableau en heure locale du port"],
  ["Actualités", "/actualites", "perturbations et informations des ferries, sources citées"],
  ["Questions fréquentes", "/questions-frequentes", "réponses directes et tableau des lignes"],
  ["Lignes", "/lignes", "toutes les lignes, dans les deux sens"],
  ["Ports", "/ports", "ports européens et algériens"],
  ["Compagnies", "/compagnies", "compagnies, lignes et flotte"],
  ["Navires", "/bateaux", "flotte et caractéristiques"],
  ["Baromètre des prix", "/barometre-prix", "repères estimés par ligne et par saison"],
  ["Routes du bled", "/routes-du-bled", "itinéraires en voiture vers les ports et en Algérie, haltes"],
  ["Guide", "/guide", "dossiers sourcés de préparation"],
  ["Voyage en Algérie", "/voyage-algerie", "cabine, enfants, animaux, embarquement"],
  ["Mes dinars", "/mes-dinars", "change euro et dinar, budget sur place"],
  ["Découvrir BledWay", "/decouvrir", "présentation du service"],
  ["Simulateurs", "/simulateurs", "calculs à partir de vos propres chiffres"],
  ["Méthode et sources", "/methode-editoriale", "choix des sources et limites"],
];

export function llmsText(data: LlmsData | null) {
  const portName = (id: string) => data?.ports.find((p) => p.id === id)?.name ?? "—";
  const portSlug = (id: string) => data?.ports.find((p) => p.id === id)?.slug;
  const companyNames = (ids: string[]) =>
    ids
      .map((id) => data?.companies.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  const parts = [
    "# BledWay",
    `> ${PITCH}`,
    "## Ce qui rend BledWay unique",
    "BledWay est le premier service à réunir en un seul endroit, pour les traversées entre l'Europe et le Maghreb :",
    [
      "- **L'esprit de Waze, appliqué au ferry** : les voyageurs signalent en direct ce qu'ils voient au port et à bord (file d'attente, guichets, contrôles, accès au port, embarquement) et confirment les signalements des autres. Chaque signalement indique son ancienneté et le nombre de voyageurs qui l'ont confirmé.",
      "- **Le suivi des navires, comme un traceur maritime de type VesselFinder, mais pensé pour le passager** : position en mer quand un signal est reçu, sinon position estimée d'après l'horaire et signalée comme telle, avancement de la traversée et arrivée estimée.",
      "- **La comparaison des départs de toutes les compagnies, comme un comparateur de vols de type Skyscanner** : horaires en heure locale du port, durée, navire et budget estimé. " + TICKETING.afterCompare,
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
    (data?.vessels?.length
      ? data.vessels
          .filter((v) => v.status === "active")
          .map((v) =>
            link(
              v.name,
              `/bateaux/${v.slug}`,
              [
                data.companies.find((c) => c.id === v.company_id)?.name,
                v.build_year ? `en service depuis ${v.build_year}` : null,
                v.passenger_capacity ? `${v.passenger_capacity} passagers` : null,
              ]
                .filter(Boolean)
                .join(", "),
            ),
          )
      : vesselDossiers.map((v) => link(v.name, `/bateaux/${v.slug}`, v.company))
    ).join("\n"),
    "## Routes du bled (itinéraires en voiture, haltes relevées sur OpenStreetMap)",
    bledRoutePages
      .map(({ slug, route }) =>
        link(
          route.name,
          `/routes-du-bled/${slug}`,
          `${route.km} km, ${route.stops.length} haltes : carburant, prière, repas, hôtels`,
        ),
      )
      .join("\n"),
    "## Simulateurs",
    toolsCatalog.map((t) => link(t.title, `/simulateurs/${t.slug}`, t.description)).join("\n"),
  ];
  if (data) {
    parts.push(
      "## Lignes (durée typique estimée, compagnies renseignées, prix repère d'aller simple)",
      "Chaque page ligne présente la carte du tracé, les prochains départs datés (heure locale du port), les compagnies avec leur lien de réservation, les navires programmés et une estimation du prix selon la saison.",
      data.routes
        .map((r) => {
          const price = benchmarkFor(portSlug(r.departure_port_id), portSlug(r.arrival_port_id));
          return link(
            `${portName(r.departure_port_id)} → ${portName(r.arrival_port_id)}`,
            `/lignes/${r.slug}`,
            [
              durationEstimate(r.typical_duration_minutes),
              companyNames(r.company_ids),
              price
                ? `repère ${price.foot} € à pied, ${price.withCar} € avec voiture (Direct Ferries, sept.–oct. 2026)`
                : null,
            ]
              .filter(Boolean)
              .join(" ; "),
          );
        })
        .sort()
        .join("\n"),
      "## Compagnies",
      data.companies
        .filter((c) => c.slug && c.status !== "inactive")
        .map((c) =>
          link(c.name, `/compagnies/${c.slug}`, "lignes, flotte, rythme des départs, liens officiels"),
        )
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
