import { articles } from "@/content/articles";
import { PRICE_BENCHMARKS } from "@/lib/ferry/pricing";
import { deName, formatDuration } from "@/lib/ferry/format";
import { PROMISE, TICKETING } from "./pitch";
import { intlLocale, placeName, tr } from "@/lib/i18n/translate";

// La promesse en minuscule initiale, dans la langue affichée (le français reste la source dans pitch.ts).
const promiseLower = () => {
  const text = tr("ui.libSeoAnswers.promesse", { promise: PROMISE });
  return text.charAt(0).toLowerCase() + text.slice(1);
};

/** Réponses factuelles construites uniquement à partir des données publiées sur le site. */
/** `note` : précision affichée sous la réponse (renvoi d'astérisque), reprise dans les données structurées. */
export type Faq = { q: string; a: string; note?: string };
type PortFact = { id: string; slug: string; name: string; country_name: string };
type RouteFact = {
  slug: string;
  departure_port_id: string;
  arrival_port_id: string;
  typical_duration_minutes: number | null;
  company_ids: string[];
};
type CompanyFact = { id: string; name: string };

export const confirmNote = () => tr("ui.libSeoAnswers.confirmNote");

// « A, B et C » dans la langue affichée ; les noms de ports suivent la langue.
const list = (items: string[]) =>
  new Intl.ListFormat(intlLocale(), { type: "conjunction" }).format(items.map((item) => placeName(item)));
const uniqueSorted = (items: string[]) =>
  [...new Set(items)].sort((a, b) => a.localeCompare(b, "fr"));
const articleAnswer = (slug: string) => articles.find((item) => item.slug === slug)?.answer ?? "";

export const durationEstimate = (minutes: number | null | undefined) =>
  minutes && minutes > 0 ? tr("ui.libSeoAnswers.environ", { duration: formatDuration(minutes) }) : null;

export function benchmarkFor(fromSlug?: string, toSlug?: string) {
  return fromSlug && toSlug ? PRICE_BENCHMARKS[`${fromSlug}|${toSlug}`] : undefined;
}

export function lineSummary(from: string, to: string, minutes: number | null, operators: string[]) {
  const duration = durationEstimate(minutes);
  return [
    duration
      ? tr("ui.libSeoAnswers.laTraverseeEnFerryDure", { from, to, duration })
      : null,
    operators.length
      ? tr("ui.libSeoAnswers.compagnieRenseigneeSurCetteLigne", { v: operators.length > 1 ? "s" : "", v2: operators.length > 1 ? "s" : "", list: list(operators) })
      : null,
    confirmNote(),
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
      q: tr("ui.libSeoAnswers.combienDeTempsDureLe", { from, to }),
      a: tr("ui.libSeoAnswers.comptezDeTraverseeCEst", { duration }),
    });
  }
  if (operators.length) {
    faq.push({
      q: tr("ui.libSeoAnswers.quellesCompagniesAssurent", { from, to }),
      a: tr("ui.libSeoAnswers.bledwayRenseigneSurCetteLigne", { list: list(operators) }),
    });
  }
  const benchmark = benchmarkFor(input.fromSlug, input.toSlug);
  if (benchmark) {
    faq.push({
      q: tr("ui.libSeoAnswers.combienCouteLeFerry", { from, to }),
      a: tr("ui.libSeoAnswers.reperesDAllerSimpleReleves", { foot: benchmark.foot, withCar: benchmark.withCar }),
    });
  }
  faq.push({
    q: tr("ui.libSeoAnswers.aQuelleHeureArriverAu", { from, to }),
    a: tr("ui.libSeoAnswers.bledwayRetientUnRepereDe"),
  });
  if (input.hasReverse) {
    faq.push({
      q: tr("ui.libSeoAnswers.existeTIlUneLigne"),
      a: tr("ui.libSeoAnswers.ouiBledwayPresenteAussiLa", { to, from }),
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
      q: tr("ui.libSeoAnswers.quelsPortsSontReliesA", { name }),
      a: input.inactive
        ? tr("ui.libSeoAnswers.cePortEstIndiqueComme", { list: list(connected) })
        : tr("ui.libSeoAnswers.depuisOuVersBledwayPresente", { name, list: list(connected), CONFIRMNOTE: confirmNote() }),
    });
  }
  if (operators.length) {
    faq.push({
      q: tr("ui.libSeoAnswers.quellesCompagniesDesserventLePort", { deName: deName(name) }),
      a: tr("ui.libSeoAnswers.compagniesRenseigneesSurLesLignes", { list: list(operators) }),
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
      q: tr("ui.libSeoAnswers.quEstCeQueBledway"),
      a: tr("ui.libSeoAnswers.bledwayCEstLeWaze", { PROMISELOWER: promiseLower(), whatIs: TICKETING.whatIs }),
      note: tr("ui.libSeoAnswers.lAlgerieDesAujourdHui"),
    },
    {
      q: tr("ui.libSeoAnswers.commentSavoirSiMonFerry"),
      a: tr("ui.libSeoAnswers.suivezVotreTraverseeSurBledway"),
    },
    {
      q: tr("ui.libSeoAnswers.commentSavoirSIlY"),
      a: tr("ui.libSeoAnswers.surLaCarteBledwayLes"),
    },
    {
      q: tr("ui.libSeoAnswers.ouSuivreUnFerryEntre"),
      a: tr("ui.libSeoAnswers.laCarteBledwayAfficheLes"),
    },
    {
      q: tr("ui.libSeoAnswers.commentComparerLesFerriesDe"),
      a: tr("ui.libSeoAnswers.reserverUneTraverseeRassembleSur") + TICKETING.afterCompare,
    },
    {
      q: tr("ui.libSeoAnswers.peutOnEchangerAvecLes"),
      a: tr("ui.libSeoAnswers.ouiChaqueTraverseeEtChaque"),
    },
    {
      q: tr("ui.libSeoAnswers.quellesCompagniesDeFerryRelient"),
      a: tr("ui.libSeoAnswers.bledwayRenseigneCompagniesToutesNe", { length: operating.length, list: list(uniqueSorted(operating.map((c) => c.name))) }),
    },
    {
      q: tr("ui.libSeoAnswers.deQuelsPortsEuropeensPartir"),
      a: tr("ui.libSeoAnswers.lesPortsEuropeensPresentesSont", { list: list(uniqueSorted(european.map((p) => p.name))), list2: list(countries) }),
    },
    {
      q: tr("ui.libSeoAnswers.quelsPortsAlgeriensSontDesservis"),
      a: tr("ui.libSeoAnswers.lesLignesPresenteesDesservent", { list: list(uniqueSorted(algerian.map((p) => p.name))) }),
    },
    ...(shortest && longest
      ? [
          {
            q: tr("ui.libSeoAnswers.combienDeTempsDureUne"),
            a: tr("ui.libSeoAnswers.selonLaLigneEtLe", { durationEstimate: durationEstimate(shortest.typical_duration_minutes), portName: portName(shortest.departure_port_id), portName2: portName(shortest.arrival_port_id), durationEstimate2: durationEstimate(longest.typical_duration_minutes), portName3: portName(longest.departure_port_id), portName4: portName(longest.arrival_port_id) }),
          },
        ]
      : []),
    {
      q: tr("ui.libSeoAnswers.combienCouteUnFerryEntre"),
      a: tr("ui.libSeoAnswers.lesReperesDAllerSimple", { v: Math.min(...prices), v2: Math.max(...prices) }),
    },
    {
      q: tr("ui.libSeoAnswers.quellePeriodeChoisirPourPayer"),
      a: tr("ui.libSeoAnswers.laDemandeEstLaPlus"),
    },
    {
      q: tr("ui.libSeoAnswers.combienDeTempsAvantLe"),
      a: tr("ui.libSeoAnswers.bledwayRetientUnRepereDe2"),
    },
    {
      q: tr("ui.libSeoAnswers.lesHorairesAffichesSurBledway"),
      a: tr("ui.libSeoAnswers.nonIlsServentAPreparer"),
    },
    {
      q: tr("ui.libSeoAnswers.peutOnReserverSonBillet"),
      a: TICKETING.faqAnswer,
    },
    {
      q: tr("ui.libSeoAnswers.quEstCeQueLe"),
      a: tr("ui.libSeoAnswers.leTpdEstLeTitre"),
    },
    {
      q: tr("ui.libSeoAnswers.quePreparerPourPartirEn"),
      a: articleAnswer("voyage-algerie-voiture-checklist"),
    },
    {
      q: tr("ui.libSeoAnswers.parOuCommencerPourImporter"),
      a: articleAnswer("importer-voiture-moins-3-ans-algerie"),
    },
    { q: tr("ui.libSeoAnswers.cabineOuFauteuilCommentChoisir"), a: articleAnswer("cabine-ou-fauteuil-ferry") },
    {
      q: tr("ui.libSeoAnswers.quePrevoirPourVoyagerAvec"),
      a: articleAnswer("ferry-algerie-enfants-famille"),
    },
    {
      q: tr("ui.libSeoAnswers.queVerifierPourPrendreLe"),
      a: articleAnswer("ferry-algerie-animaux"),
    },
    {
      q: tr("ui.libSeoAnswers.quePrevoirALArrivee"),
      a: articleAnswer("arrivee-algerie-port-formalites"),
    },
  ];
}
