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
import {
  planDay,
  planFare,
  planHasWhen,
  planWhenLabel,
  seasonLabels,
  type CompanionPlan,
  type PortChoice,
} from "@/lib/ferry/companion";
import type { Port } from "@/lib/ferry/types";
import { VEHICLES } from "@/components/panel/TripProfile";
import {
  FUEL_EURO_PER_L,
  FUEL_L_PER_100,
  TOLL_EURO_PER_KM,
  travelDays,
} from "@/components/prepare/RouteTop3";

const dayLabel = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" })
    .format(new Date(`${key}T12:00:00`))
    .replace(/\./g, "")
    .replace(/^./, (c) => c.toUpperCase());
const longDay = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${key}T12:00:00`))
    .replace(/^1 /, "1er ");

/** Arrondi lisible : à la centaine (à la dizaine sous 200 €). */
const roundNice = (n: number) => (n < 200 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100);
const nice = (n: number) => `${roundNice(n).toLocaleString("fr-FR")} €`;
const dayMonth = (key: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" })
    .format(new Date(`${key}T12:00:00`))
    .replace(/^1 /, "1er ");
const countOf = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/**
 * Le budget du voyage, en chiffres : bateau aller, bateau retour (prix moyens de la ligne, ajustés
 * à la saison, aux voyageurs, au véhicule), essence et péages jusqu'au port. Le même calcul sert
 * au bloc « Votre budget » et à la ligne Budget du récap.
 */
export function tripBudget(
  plan: CompanionPlan,
  fromChoice: PortChoice,
  toPort: Port,
  people: { adults: number; children: number },
) {
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
  return {
    out,
    back,
    road,
    total: out.amount + (back?.amount ?? 0) + road,
    low: out.low + (back?.low ?? 0) + road * 0.85,
    high: out.high + (back?.high ?? 0) + road * 1.15,
  };
}

/** « Environ 3 000 € », pour la ligne Budget du récap. */
export const budgetSummary = (b: ReturnType<typeof tripBudget>) =>
  `Environ ${nice(b.total)}, bateau${b.road ? " et route" : ""}${b.back ? ", aller et retour" : ", aller"}`;

/**
 * « Votre budget » : un chiffre arrondi d'abord, puis ce qu'il comprend, poste par poste, en mots
 * simples. La fourchette dit seulement pourquoi le prix peut bouger.
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
  const b = tripBudget(plan, fromChoice, toPort, people);
  const line = `${fromChoice.port.name} → ${toPort.name}`;
  const lineBack = `${toPort.name} → ${fromChoice.port.name}`;
  const vehicle = VEHICLES.find((v) => v.id === plan.vehicle);
  const who = [
    countOf(Math.max(1, people.adults), "adulte"),
    people.children ? countOf(people.children, "enfant") : null,
  ]
    .filter(Boolean)
    .join(", ");
  const withWhat = plan.vehicle === "none" ? "sans voiture" : `et la ${vehicle?.label.toLowerCase() ?? "voiture"}`;
  const outDay = planHasWhen(plan) ? dayMonth(planDay(plan)) : null;
  const items: { key: string; label: string; detail: string; amount: number }[] = [
    {
      key: "out",
      label: "Le bateau à l'aller",
      detail: [line, outDay, seasonLabels[b.out.season].toLowerCase()].filter(Boolean).join(" · "),
      amount: b.out.amount,
    },
    ...(b.back
      ? [
          {
            key: "back",
            label: "Le bateau au retour",
            detail: [lineBack, plan.returnDate ? dayMonth(plan.returnDate) : null, seasonLabels[b.back.season].toLowerCase()]
              .filter(Boolean)
              .join(" · "),
            amount: b.back.amount,
          },
        ]
      : []),
    ...(b.road
      ? [
          {
            key: "road",
            label: plan.country === "FR" ? "L'essence et les péages" : "L'essence",
            detail: `${plan.home?.name ?? "Chez vous"} ↔ ${fromChoice.port.name}${b.back ? ", aller et retour" : ""}`,
            amount: b.road,
          },
        ]
      : []),
  ];
  return (
    <section className="bw-tbudget" aria-labelledby="budget-estime">
      <p className="bw-tbudget__head">
        <Wallet size={16} aria-hidden />
        <span id="budget-estime">Votre budget</span>
      </p>
      <p className="bw-tbudget__total">Environ {nice(b.total)}</p>
      <p className="bw-tbudget__who">
        Pour {who} {withWhat}, {b.back ? "aller et retour" : "l'aller seulement"}.
      </p>
      <div className="bw-tbudget__bar" aria-hidden>
        {items.map((item) => (
          <span key={item.key} data-k={item.key} style={{ flexGrow: item.amount }} />
        ))}
      </div>
      <ul className="bw-tbudget__items">
        {items.map((item) => (
          <li key={item.key} data-k={item.key}>
            <span className="bw-tbudget__dot" aria-hidden />
            <span className="min-w-0">
              <b>{item.label}</b>
              <small>{item.detail}</small>
            </span>
            <span className="bw-tbudget__amount">≈ {nice(item.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="bw-tbudget__note">
        Le prix réel peut aller de {nice(b.low)} à {nice(b.high)} selon la compagnie, la date et
        votre place à bord. Les repas à bord et la route en Algérie ne sont pas comptés.{" "}
        <button type="button" onClick={onDetail}>
          D'où viennent ces chiffres ?
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
  // Sans date choisie, pas de « départs publiés » sur un mois que le voyageur n'a pas donné.
  if (!fromName || !toName || !planHasWhen(plan)) return null;
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
