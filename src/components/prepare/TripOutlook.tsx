import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck, CalendarClock, Loader2, Wallet } from "lucide-react";
import { SalesAlertForm } from "@/components/panel/SalesAlertForm";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import { buildSailings, daysWithSailings, legSailings } from "@/lib/ferry/trips";
import { formatFareRange } from "@/lib/ferry/pricing";
import {
  planFare,
  planWhenLabel,
  type CompanionPlan,
  type PortChoice,
} from "@/lib/ferry/companion";
import type { Port } from "@/lib/ferry/types";
import {
  FUEL_EURO_PER_L,
  FUEL_L_PER_100,
  TOLL_EURO_PER_KM,
  travelDays,
} from "@/components/prepare/RouteTop3";

const euros = (n: number) =>
  `${Math.round(n / 10) * 10 > 0 ? (Math.round(n / 10) * 10).toLocaleString("fr-FR") : "0"} €`;
const dayLabel = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" })
    .format(new Date(`${key}T12:00:00`))
    .replace(/\./g, "")
    .replace(/^./, (c) => c.toUpperCase());
const longDay = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${key}T12:00:00`))
    .replace(/^1 /, "1er ");

/**
 * Le budget du voyage, estimé : la traversée aller et retour (prix moyens de la ligne, ajustés à
 * la saison, aux voyageurs, au véhicule), puis l'essence et les péages jusqu'au port.
 */
export function TripBudget({
  plan,
  fromChoice,
  toPort,
  people,
  onDetail,
}: {
  plan: CompanionPlan;
  fromChoice: PortChoice | null;
  toPort: Port | null;
  people: { adults: number; children: number };
  onDetail: () => void;
}) {
  if (!fromChoice || !toPort) return null;
  const out = planFare(plan, fromChoice.port, toPort, people);
  const back = plan.returnDate
    ? planFare({ ...plan, date: plan.returnDate, window: null }, fromChoice.port, toPort, people)
    : null;
  // La route jusqu'au port : la distance à vol d'oiseau, allongée d'un quart pour la route.
  const roadKm = plan.vehicle !== "none" && fromChoice.km !== null ? fromChoice.km * 1.25 : 0;
  const tolls = plan.country === "FR" ? TOLL_EURO_PER_KM : 0;
  const roadCost = roadKm * ((FUEL_L_PER_100 / 100) * FUEL_EURO_PER_L + tolls) * (back ? 2 : 1);
  // Le port à côté de chez soi : pas de ligne « ≈ 0 € ».
  const road = roadCost >= 15 ? roadCost : 0;
  const low = out.low + (back?.low ?? 0) + road * 0.85;
  const high = out.high + (back?.high ?? 0) + road * 1.15;
  const rows: [string, string][] = [
    ["Traversée aller", formatFareRange(out)],
    ...(back ? [["Traversée retour", formatFareRange(back)] as [string, string]] : []),
    ...(road
      ? [
          [
            plan.country === "FR" ? "Essence et péages jusqu'au port" : "Essence jusqu'au port",
            `≈ ${euros(road)}`,
          ] as [string, string],
        ]
      : []),
  ];
  return (
    <section className="bw-tbudget" aria-labelledby="budget-estime">
      <p className="bw-tbudget__head">
        <Wallet size={16} aria-hidden />
        <span id="budget-estime">Budget estimé{back ? ", aller et retour" : ", aller"}</span>
      </p>
      <p className="bw-tbudget__total">
        {euros(low)} – {euros(high)}
      </p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="bw-tbudget__note">
        Une estimation, pas un devis. Le prix réel se voit à la réservation.{" "}
        <button type="button" onClick={onDetail}>
          Le détail
        </button>
      </p>
    </section>
  );
}

/** Les départs publiés sur la ligne et la période, et jusqu'où les compagnies ont publié. */
function useLineOutlook(plan: CompanionPlan) {
  const { data: ports = [], isPending: p1 } = useQuery(portsQuery);
  const { data: routes = [], isPending: p2 } = useQuery(routesQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: departures = [], isPending: p3 } = useQuery(upcomingDeparturesQuery());
  return useMemo(() => {
    const span = travelDays(plan);
    if (!plan.fromPortId || !plan.toPortId)
      return { loading: false, span, inSpan: [], near: [], until: null };
    const all = buildSailings(departures, routes, ports, companies, []).filter(
      (sailing) => !sailing.departure.is_demo && sailing.departure.status !== "cancelled",
    );
    const line = legSailings(all, [plan.fromPortId], [plan.toPortId]);
    const days = daysWithSailings(line, null, 1000);
    const inSpan = days.filter((d) => d.day >= span.from && d.day <= span.to);
    const until = days.at(-1)?.day ?? null;
    // Hors de la période : les jours publiés les plus proches, pour proposer autre chose.
    const near = inSpan.length
      ? []
      : [...days]
          .sort(
            (a, b) =>
              Math.abs(Date.parse(a.day) - Date.parse(span.from)) -
              Math.abs(Date.parse(b.day) - Date.parse(span.from)),
          )
          .slice(0, 3)
          .sort((a, b) => a.day.localeCompare(b.day));
    return { loading: p1 || p2 || p3, span, inSpan, near, until };
  }, [plan, ports, routes, companies, departures, p1, p2, p3]);
}

/**
 * Les traversées de la période, dites tout de suite : publiées (et où les voir), pas encore en
 * vente (avec l'alerte d'ouverture des ventes), ou publiées mais pas ces jours-là.
 */
export function SailingsOutlook({
  plan,
  fromName,
  toName,
  onSee,
}: {
  plan: CompanionPlan;
  fromName: string | null;
  toName: string | null;
  onSee: () => void;
}) {
  const { loading, span, inSpan, near, until } = useLineOutlook(plan);
  if (!fromName || !toName) return null;
  // La recherche couvre le jour ± 3 : on le dit, plutôt qu'un seul jour.
  const period =
    plan.date && !plan.window
      ? `autour du ${new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${plan.date}T12:00:00`))}`
      : planWhenLabel(plan);
  const see = (label: string) => (
    <button type="button" onClick={onSee} className="bw-outlook__see">
      {label} <ArrowRight size={15} aria-hidden />
    </button>
  );
  let body;
  if (loading)
    body = (
      <p className="bw-outlook__line" role="status">
        <Loader2 size={15} className="animate-spin text-primary" aria-hidden /> Je regarde les
        départs publiés…
      </p>
    );
  else if (inSpan.length) {
    const total = inSpan.reduce((sum, d) => sum + d.count, 0);
    body = (
      <>
        <p className="bw-outlook__line" data-tone="ok">
          <CalendarCheck size={16} aria-hidden />
          <span>
            <b>
              {total} départ{total > 1 ? "s" : ""} publié{total > 1 ? "s" : ""}
            </b>{" "}
            {fromName} → {toName}, {period}
          </span>
        </p>
        <ul className="bw-outlook__days">
          {inSpan.slice(0, 6).map((d) => (
            <li key={d.day}>{dayLabel(d.day)}</li>
          ))}
        </ul>
        {see("Voir les traversées et les prix")}
      </>
    );
  } else if (!until || until < span.from)
    body = (
      <>
        <div>
          <SalesAlertForm
            periodLabel={planWhenLabel(plan)}
            publishedUntil={until}
            periodStart={span.from}
            periodEnd={span.to}
            fromLabel={fromName}
            toLabel={toName}
          />
        </div>
        <p className="bw-outlook__more">
          <CalendarClock size={14} aria-hidden /> En attendant, lancez vos papiers : les visas, eux,
          n'attendent pas.
        </p>
      </>
    );
  else
    body = (
      <>
        <p className="bw-outlook__line" data-tone="warn">
          <CalendarClock size={16} aria-hidden />
          <span>
            <b>Aucun départ publié {period}</b> sur {fromName} → {toName}.
            {near.length ? " Les jours les plus proches :" : ""}
          </span>
        </p>
        {near.length ? (
          <ul className="bw-outlook__days">
            {near.map((d) => (
              <li key={d.day}>{dayLabel(d.day)}</li>
            ))}
          </ul>
        ) : null}
        {see("Voir les autres dates")}
      </>
    );
  return (
    <section className="bw-outlook" aria-labelledby="outlook-titre">
      <h3 id="outlook-titre">Les traversées de votre période</h3>
      {body}
    </section>
  );
}
