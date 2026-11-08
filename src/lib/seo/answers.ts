import { articles } from "@/content/articles";
import { PRICE_BENCHMARKS } from "@/lib/ferry/pricing";
import { deName, formatDuration } from "@/lib/ferry/format";

/** Réponses factuelles construites uniquement à partir des données publiées sur le site. */
export type Faq = { q: string; a: string };
type PortFact = { id: string; slug: string; name: string; country_name: string };
type RouteFact = {
  slug: string;
  departure_port_id: string;
  arrival_port_id: string;
  typical_duration_minutes: number | null;
  company_ids: string[];
};
type CompanyFact = { id: string; name: string };

export const CONFIRM_NOTE =
  "Horaires, prix et conditions se confirment auprès de la compagnie avant de réserver.";

const list = (items: string[]) =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
const uniqueSorted = (items: string[]) =>
  [...new Set(items)].sort((a, b) => a.localeCompare(b, "fr"));
const articleAnswer = (slug: string) => articles.find((item) => item.slug === slug)?.answer ?? "";

export const durationEstimate = (minutes: number | null | undefined) =>
  minutes && minutes > 0 ? `environ ${formatDuration(minutes)}` : null;

export function benchmarkFor(fromSlug?: string, toSlug?: string) {
  return fromSlug && toSlug ? PRICE_BENCHMARKS[`${fromSlug}|${toSlug}`] : undefined;
}

export function lineSummary(from: string, to: string, minutes: number | null, operators: string[]) {
  const duration = durationEstimate(minutes);
  return [
    duration
      ? `La traversée en ferry ${from} → ${to} dure ${duration} (durée typique, estimation).`
      : null,
    operators.length
      ? `Compagnie${operators.length > 1 ? "s" : ""} renseignée${operators.length > 1 ? "s" : ""} sur cette ligne : ${list(operators)}.`
      : null,
    CONFIRM_NOTE,
  ]
    .filter(Boolean)
    .join(" ");
}

export function lineFaq(input: {
  from: string;
  to: string;
  fromSlug: string | undefined;
  toSlug: string | undefined;
  minutes: number | null;
  operators: string[];
  hasReverse: boolean;
}): Faq[] {
  const { from, to, minutes, operators } = input;
  const faq: Faq[] = [];
  const duration = durationEstimate(minutes);
  if (duration) {
    faq.push({
      q: `Combien de temps dure le ferry ${from} → ${to} ?`,
      a: `Comptez ${duration} de traversée. C'est une durée typique, donnée à titre d'estimation : la durée réelle dépend du départ et du navire. Vérifiez-la sur votre billet.`,
    });
  }
  if (operators.length) {
    faq.push({
      q: `Quelles compagnies assurent ${from} → ${to} ?`,
      a: `BledWay renseigne ${list(operators)} sur cette ligne. L'offre varie selon la saison : confirmez le départ auprès de la compagnie.`,
    });
  }
  const benchmark = benchmarkFor(input.fromSlug, input.toSlug);
  if (benchmark) {
    faq.push({
      q: `Combien coûte le ferry ${from} → ${to} ?`,
      a: `Repères d'aller simple relevés sur Direct Ferries en septembre–octobre 2026 : environ ${benchmark.foot} € sans véhicule et ${benchmark.withCar} € avec une voiture. Ce sont des estimations, pas des prix disponibles : le devis de la compagnie fait foi.`,
    });
  }
  faq.push({
    q: `À quelle heure arriver au port pour ${from} → ${to} ?`,
    a: "BledWay retient un repère de 4 h avant le départ pour préparer le trajet. L'heure limite qui s'applique est celle indiquée par la compagnie sur votre billet.",
  });
  if (input.hasReverse) {
    faq.push({
      q: `Existe-t-il une ligne dans l'autre sens ?`,
      a: `Oui, BledWay présente aussi la ligne ${to} → ${from}. La durée, les jours de départ et les prix peuvent différer d'un sens à l'autre.`,
    });
  }
  return faq;
}

export function portFaq(input: {
  name: string;
  country: string;
  connected: string[];
  operators: string[];
  inactive: boolean;
}): Faq[] {
  const { name, connected, operators } = input;
  const faq: Faq[] = [];
  if (connected.length) {
    faq.push({
      q: `Quels ports sont reliés à ${name} en ferry ?`,
      a: input.inactive
        ? `Ce port est indiqué comme temporairement fermé sur BledWay. Les ports reliés en temps normal : ${list(connected)}.`
        : `Depuis ou vers ${name}, BledWay présente des lignes avec ${list(connected)}. ${CONFIRM_NOTE}`,
    });
  }
  if (operators.length) {
    faq.push({
      q: `Quelles compagnies desservent le port ${deName(name)} ?`,
      a: `Compagnies renseignées sur les lignes de ce port : ${list(operators)}.`,
    });
  }
  return faq;
}

export function generalFaq(
  ports: PortFact[],
  routes: RouteFact[],
  companies: CompanyFact[],
): Faq[] {
  const used = new Set(routes.flatMap((r) => [r.departure_port_id, r.arrival_port_id]));
  const served = ports.filter((port) => used.has(port.id));
  const algerian = served.filter((port) => port.country_name === "Algérie");
  const european = served.filter((port) => port.country_name !== "Algérie");
  const countries = uniqueSorted(european.map((port) => port.country_name));
  const operating = companies.filter((c) => routes.some((r) => r.company_ids.includes(c.id)));
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const timed = routes
    .filter((r) => r.typical_duration_minutes)
    .sort((a, b) => a.typical_duration_minutes! - b.typical_duration_minutes!);
  const shortest = timed[0];
  const longest = timed[timed.length - 1];
  const prices = Object.values(PRICE_BENCHMARKS).map((item) => item.withCar);

  return [
    {
      q: "Qu'est-ce que BledWay ?",
      a: "BledWay est le « Waze du ferry » entre l'Europe et l'Algérie : suivi des navires en direct, alertes en cas de retard, de report ou d'annulation, signalements et salons des voyageurs, comparaison des départs de toutes les compagnies et préparation du voyage de porte à porte. Service indépendant et gratuit, dans les deux sens : BledWay ne vend pas de billets.",
    },
    {
      q: "Comment savoir si mon ferry pour l'Algérie est en retard ou annulé ?",
      a: "Suivez votre traversée sur BledWay en touchant le cœur : les retards, reports et annulations vous sont envoyés en notification, et une annulation ou un report peut aussi vous être envoyé par e-mail. Confirmez toujours auprès de la compagnie.",
    },
    {
      q: "Comment savoir s'il y a la queue au port avant d'y aller ?",
      a: "Sur la carte BledWay, les voyageurs déjà sur place signalent en direct la file d'attente, l'ouverture des guichets, les contrôles ou l'accès au port, comme sur Waze pour la route. Chaque signalement indique depuis quand il a été fait et combien de voyageurs l'ont confirmé.",
    },
    {
      q: "Où suivre un ferry entre l'Europe et l'Algérie en temps réel ?",
      a: "La carte BledWay affiche les navires des lignes Europe–Algérie : leur position en mer quand un signal est reçu, sinon une position estimée d'après l'horaire, toujours signalée comme telle, avec l'avancement de la traversée et l'arrivée estimée.",
    },
    {
      q: "Comment comparer les ferries de toutes les compagnies ?",
      a: "« Trouver ma traversée » rassemble sur un même écran les départs de toutes les compagnies renseignées : horaire en heure locale, durée, navire et budget estimé. La réservation se fait ensuite chez la compagnie.",
    },
    {
      q: "Peut-on échanger avec les autres passagers de sa traversée ?",
      a: "Oui. Chaque traversée et chaque port ont leur salon sur BledWay : on y voit qui voyage, on pose ses questions et on s'entraide, au port comme à bord.",
    },
    {
      q: "Quelles compagnies de ferry relient l'Europe à l'Algérie ?",
      a: `BledWay renseigne ${operating.length} compagnies : ${list(uniqueSorted(operating.map((c) => c.name)))}. Toutes ne desservent pas les mêmes ports.`,
    },
    {
      q: "De quels ports européens partir pour l'Algérie ?",
      a: `Les ports européens présentés sont ${list(uniqueSorted(european.map((p) => p.name)))}, en ${list(countries)}.`,
    },
    {
      q: "Quels ports algériens sont desservis par ferry ?",
      a: `Les lignes présentées desservent ${list(uniqueSorted(algerian.map((p) => p.name)))}.`,
    },
    ...(shortest && longest
      ? [
          {
            q: "Combien de temps dure une traversée entre l'Europe et l'Algérie ?",
            a: `Selon la ligne et le sens, entre ${durationEstimate(shortest.typical_duration_minutes)} (${portName(shortest.departure_port_id)} → ${portName(shortest.arrival_port_id)}) et ${durationEstimate(longest.typical_duration_minutes)} (${portName(longest.departure_port_id)} → ${portName(longest.arrival_port_id)}). Ce sont des durées typiques, données à titre d'estimation.`,
          },
        ]
      : []),
    {
      q: "Combien coûte un ferry entre l'Europe et l'Algérie avec une voiture ?",
      a: `Les repères d'aller simple avec voiture relevés sur Direct Ferries en septembre–octobre 2026 vont d'environ ${Math.min(...prices)} € à ${Math.max(...prices)} € selon la ligne et le sens. Ce sont des estimations : passagers, cabine et frais ne sont pas toujours comparables, et le devis de la compagnie fait foi.`,
    },
    {
      q: "Quelle période choisir pour payer moins cher ?",
      a: "La demande est la plus forte de la mi-juillet à la fin août. Janvier à mars et novembre sont en général plus calmes, avec parfois moins de traversées. Cette échelle est indicative et ne constitue pas un historique de prix.",
    },
    {
      q: "Combien de temps avant le départ faut-il arriver au port ?",
      a: "BledWay retient un repère de 4 h avant le départ, et autant après l'arrivée pour sortir du port. L'heure limite qui s'applique est celle indiquée par la compagnie sur votre billet.",
    },
    {
      q: "Les horaires affichés sur BledWay sont-ils garantis ?",
      a: "Non. Ils servent à préparer le voyage et peuvent changer. Confirmez toujours votre départ auprès de la compagnie.",
    },
    {
      q: "Peut-on réserver son billet sur BledWay ?",
      a: "Non. BledWay ne vend pas de billets : la réservation et le paiement se font auprès de la compagnie ou du distributeur indiqué.",
    },
    {
      q: "Qu'est-ce que le TPD pour une voiture immatriculée à l'étranger ?",
      a: "Le TPD est le titre de passage en douane. La douane algérienne permet de le souscrire à distance sur son portail ALCES (alces.douane.gov.dz), avant le voyage.",
    },
    {
      q: "Que préparer pour partir en ferry avec sa voiture ?",
      a: articleAnswer("voyage-algerie-voiture-checklist"),
    },
    {
      q: "Par où commencer pour importer une voiture de moins de 3 ans en Algérie ?",
      a: articleAnswer("importer-voiture-moins-3-ans-algerie"),
    },
    { q: "Cabine ou fauteuil : comment choisir ?", a: articleAnswer("cabine-ou-fauteuil-ferry") },
    {
      q: "Que prévoir pour voyager avec des enfants ?",
      a: articleAnswer("ferry-algerie-enfants-famille"),
    },
    {
      q: "Que vérifier pour prendre le ferry avec un animal ?",
      a: articleAnswer("ferry-algerie-animaux"),
    },
    {
      q: "Que prévoir à l'arrivée au port en Algérie ?",
      a: articleAnswer("arrivee-algerie-port-formalites"),
    },
  ];
}
