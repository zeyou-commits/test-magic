import type { CompanyOverview } from "@/lib/ferry/companyOverview";
import type { Company, Vessel } from "@/lib/ferry/types";
import { intlLocale, placeName, tr } from "@/lib/i18n";

/**
 * Questions fréquentes des pages de catalogue (compagnie, navire, route du bled). Chaque réponse est
 * calculée à partir des données publiées : aucune ne promet ni n'invente un chiffre absent.
 */
export type Faq = { q: string; a: string }[];

const number = (value: number) => value.toLocaleString(intlLocale());
const decimal = (value: number) => value.toLocaleString(intlLocale(), { maximumFractionDigits: 1 });
const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${tr("ui.catalogFaq.et")} ${items.at(-1)}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(intlLocale(), { day: "numeric", month: "long", timeZone: "Europe/Paris" });
const host = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

export function companyFaq(
  company: Company,
  overview: CompanyOverview,
  portName: (id: string) => string,
  year = new Date().getFullYear(),
): Faq {
  const faq: Faq = [];
  const name = company.name;
  const lines = overview.lines.map(
    (l) => `${placeName(portName(l.route.departure_port_id))} → ${placeName(portName(l.route.arrival_port_id))}`,
  );
  if (lines.length)
    faq.push({
      q: tr("ui.catalogFaq.quellesLignesCompagnie", { name }),
      a: tr("ui.catalogFaq.quellesLignesCompagnieR", { name, n: lines.length, lines: list(lines) }),
    });
  faq.push({
    q: tr("ui.catalogFaq.combienParSemaine", { name }),
    a:
      overview.perWeek > 0 && overview.next
        ? tr("ui.catalogFaq.combienParSemaineR", {
            n: decimal(overview.perWeek),
            next: day(overview.next.departure_at),
          })
        : tr("ui.catalogFaq.aucunProgramme", { name }),
  });
  if (overview.fleet.length) {
    const fleet = [...overview.fleet]
      .sort((a, b) => (b.passenger_capacity ?? 0) - (a.passenger_capacity ?? 0))
      .map((v) =>
        v.build_year ? tr("ui.catalogFaq.navireAnnee", { name: v.name, year: v.build_year }) : v.name,
      );
    faq.push({
      q: tr("ui.catalogFaq.quelsNavires", { name }),
      a: tr("ui.catalogFaq.quelsNaviresR", { name, n: fleet.length, fleet: list(fleet) }),
    });
  }
  if (overview.averageAge !== null && overview.oldest && overview.youngest)
    faq.push({
      q: tr("ui.catalogFaq.ageFlotte", { name }),
      a: tr("ui.catalogFaq.ageFlotteR", {
        n: overview.averageAge,
        young: overview.youngest.name,
        youngYear: overview.youngest.build_year ?? year,
        old: overview.oldest.name,
        oldYear: overview.oldest.build_year ?? year,
      }),
    });
  const site = host(company.booking_url ?? company.website_url);
  faq.push({
    q: tr("ui.catalogFaq.reserver", { name }),
    a: site
      ? tr("ui.catalogFaq.reserverR", { name, site })
      : tr("ui.catalogFaq.reserverSansSite", { name }),
  });
  return faq;
}

export function vesselFaq(
  vessel: Vessel,
  company: Company | undefined,
  lines: string[],
  nextDeparture: { at: string; line: string } | null,
  year = new Date().getFullYear(),
): Faq {
  const faq: Faq = [];
  const name = vessel.name;
  if (company)
    faq.push({
      q: tr("ui.catalogFaq.quelleCompagnie", { name }),
      a: tr("ui.catalogFaq.quelleCompagnieR", { name, company: company.name }),
    });
  if (lines.length)
    faq.push({
      q: tr("ui.catalogFaq.quellesLignesNavire", { name }),
      a: tr("ui.catalogFaq.quellesLignesNavireR", {
        name,
        lines: list(lines),
        next: nextDeparture
          ? tr("ui.catalogFaq.prochainDepartNavire", { day: day(nextDeparture.at), line: nextDeparture.line })
          : "",
      }),
    });
  if (vessel.passenger_capacity || vessel.car_capacity)
    faq.push({
      q: tr("ui.catalogFaq.capacite", { name }),
      a: [
        vessel.passenger_capacity
          ? tr("ui.catalogFaq.capacitePassagers", { n: number(vessel.passenger_capacity) })
          : null,
        vessel.car_capacity ? tr("ui.catalogFaq.capaciteVehicules", { n: number(vessel.car_capacity) }) : null,
        vessel.cabin_capacity ? tr("ui.catalogFaq.capaciteCabines", { n: number(vessel.cabin_capacity) }) : null,
      ]
        .filter(Boolean)
        .join(" "),
    });
  if (vessel.build_year && vessel.build_year <= year)
    faq.push({
      q: tr("ui.catalogFaq.ageNavire", { name }),
      a: tr("ui.catalogFaq.ageNavireR", {
        name,
        year: vessel.build_year,
        age: year - vessel.build_year,
        builder: vessel.builder ? tr("ui.catalogFaq.chantier", { builder: vessel.builder }) : "",
      }),
    });
  faq.push({
    q: tr("ui.catalogFaq.ouEst", { name }),
    a: tr("ui.catalogFaq.ouEstR", { name }),
  });
  return faq;
}

export function bledRouteFaq(input: {
  name: string;
  from: string;
  to: string;
  km: number;
  hours: number;
  counts: { carburant: number; priere: number; dormir: number; manger: number };
  halal: number;
  port: string | null;
}): Faq {
  const { from, to } = input;
  const h = Math.floor(input.hours);
  const m = Math.round((input.hours - h) * 60);
  const faq: Faq = [
    {
      q: tr("ui.catalogFaq.combienDeTemps", { from, to }),
      a: tr("ui.catalogFaq.combienDeTempsR", {
        km: number(input.km),
        duree: m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`,
      }),
    },
  ];
  if (input.counts.carburant)
    faq.push({
      q: tr("ui.catalogFaq.ouFaireLePlein", { from, to }),
      a: tr("ui.catalogFaq.ouFaireLePleinR", { n: input.counts.carburant }),
    });
  if (input.counts.priere)
    faq.push({
      q: tr("ui.catalogFaq.ouPrier", { from, to }),
      a: tr("ui.catalogFaq.ouPrierR", { n: input.counts.priere }),
    });
  if (input.counts.manger)
    faq.push({
      q: tr("ui.catalogFaq.ouManger", { from, to }),
      a: tr("ui.catalogFaq.ouMangerR", { n: input.counts.manger, halal: input.halal }),
    });
  if (input.counts.dormir)
    faq.push({
      q: tr("ui.catalogFaq.ouDormir", { from, to }),
      a: tr("ui.catalogFaq.ouDormirR", { n: input.counts.dormir }),
    });
  if (input.port)
    faq.push({
      q: tr("ui.catalogFaq.quelFerry", { port: input.port }),
      a: tr("ui.catalogFaq.quelFerryR", { port: input.port }),
    });
  return faq;
}
