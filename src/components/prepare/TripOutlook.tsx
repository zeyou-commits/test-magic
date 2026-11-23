import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BedDouble,
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  Coins,
  FileText,
  Fuel,
  Gift,
  Lightbulb,
  Loader2,
  Plus,
  Ship,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
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
  type BudgetExtras,
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

/** Les frais de papiers de la liste (visa, dossier…), avec le libellé de chaque ligne. */
export type PapersFees = { eur: number; items: { label: string; eur: number }[] };

/**
 * Le budget du voyage, en chiffres : bateau aller, bateau retour (prix moyens de la ligne, ajustés
 * à la saison, aux voyageurs, au véhicule), essence et péages jusqu'au port, frais de papiers
 * connus, et les dépenses que le voyageur ajoute lui-même. Le même calcul sert au bloc
 * « Votre budget » et à la ligne Budget du récap.
 */
export function tripBudget(
  plan: CompanionPlan,
  fromChoice: PortChoice,
  toPort: Port,
  people: { adults: number; children: number },
  papers: PapersFees | null = null,
) {
  const out = planFare(plan, fromChoice.port, toPort, people);
  const back = plan.returnDate
    ? planFare({ ...plan, date: plan.returnDate, window: null }, fromChoice.port, toPort, people)
    : null;
  // La route jusqu'au port : la distance à vol d'oiseau, allongée d'un quart pour la route.
  const roadKm = plan.vehicle !== "none" && fromChoice.km !== null ? fromChoice.km * 1.25 : 0;
  const trips = back ? 2 : 1;
  const fuelRaw = roadKm * (FUEL_L_PER_100 / 100) * FUEL_EURO_PER_L * trips;
  const tollsRaw = plan.country === "FR" ? roadKm * TOLL_EURO_PER_KM * trips : 0;
  // Le port à côté de chez soi : pas de ligne « ≈ 0 € ».
  const onRoad = fuelRaw + tollsRaw >= 15;
  const fuel = onRoad ? fuelRaw : 0;
  const tolls = onRoad ? tollsRaw : 0;
  const road = fuel + tolls;
  const fees = papers?.eur ?? 0;
  const extras = plan.extras ?? {};
  const own = (extras.hotel ?? 0) + (extras.food ?? 0) + (extras.onsite ?? 0);
  const fixed = fees + own;
  return {
    out,
    back,
    road,
    fuel,
    tolls,
    roadKm: onRoad ? roadKm : 0,
    trips,
    fees,
    own,
    total: out.amount + (back?.amount ?? 0) + road + fixed,
    low: out.low + (back?.low ?? 0) + road * 0.85 + fixed,
    high: out.high + (back?.high ?? 0) + road * 1.15 + fixed,
  };
}

/** « Environ 3 000 €, bateau, route et papiers, aller et retour », pour la ligne Budget du récap. */
export const budgetSummary = (b: ReturnType<typeof tripBudget>) => {
  const parts = [
    "bateau",
    b.road ? "route" : null,
    b.fees ? "papiers" : null,
    b.own ? "vos dépenses" : null,
  ]
    .filter(Boolean)
    .join(", ")
    .replace(/, ([^,]+)$/, " et $1");
  return `Environ ${nice(b.total)}, ${parts}${b.back ? ", aller et retour" : ", aller"}`;
};

type Slice = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  amount: number;
  /** En mots simples : comment ce chiffre est obtenu. */
  how: ReactNode;
  mine?: boolean;
};

const EXTRA_FIELDS: {
  key: keyof BudgetExtras;
  label: string;
  icon: LucideIcon;
  color: string;
  hint: string;
}[] = [
  {
    key: "hotel",
    label: "Hôtel d'étape",
    icon: BedDouble,
    color: "#e2725b",
    hint: "Une nuit sur la route, à l'aller ou au retour.",
  },
  {
    key: "food",
    label: "Repas et pauses",
    icon: UtensilsCrossed,
    color: "#c9579b",
    hint: "Sur la route et à bord : le prix du bateau ne les compte pas.",
  },
  {
    key: "onsite",
    label: "Au bled",
    icon: Gift,
    color: "#3aa8a0",
    hint: "Cadeaux, sorties, essence en Algérie…",
  },
];

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);
const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/** Le camembert (anneau) : une part par poste, le total au centre. */
function BudgetDonut({ slices, total }: { slices: Slice[]; total: number }) {
  let offset = 0;
  const gap = slices.length > 1 ? 0.8 : 0;
  return (
    <div className="bw-bdonut">
      <svg viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r="46" className="bw-bdonut__track" />
        {slices.map((slice) => {
          const share = total > 0 ? (slice.amount / total) * 100 : 0;
          const dash = Math.max(0, share - gap);
          const el = (
            <circle
              key={slice.key}
              cx="60"
              cy="60"
              r="46"
              pathLength={100}
              stroke={slice.color}
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += share;
          return el;
        })}
      </svg>
      <span className="bw-bdonut__center">
        <b>{nice(total)}</b>
        <small>au total</small>
      </span>
    </div>
  );
}

/**
 * « Votre budget » : un chiffre arrondi d'abord, le camembert des postes, puis chaque poste
 * expliqué en mots simples (on touche une ligne pour voir le calcul). Le voyageur peut ajouter
 * ses propres dépenses : elles entrent dans le total et dans le camembert.
 */
export function TripBudget({
  plan,
  fromChoice,
  toPort,
  people,
  onDetail,
  papers = null,
  onExtras,
}: {
  plan: CompanionPlan;
  fromChoice: PortChoice | null;
  toPort: Port | null;
  people: { adults: number; children: number };
  onDetail: () => void;
  papers?: PapersFees | null;
  /** Fourni : le voyageur peut ajouter ses dépenses (hôtel, repas, sur place). */
  onExtras?: (extras: BudgetExtras) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!fromChoice || !toPort) return null;
  const b = tripBudget(plan, fromChoice, toPort, people, papers);
  const line = `${fromChoice.port.name} → ${toPort.name}`;
  const vehicle = VEHICLES.find((v) => v.id === plan.vehicle);
  const who = [
    countOf(Math.max(1, people.adults), "adulte"),
    people.children ? countOf(people.children, "enfant") : null,
  ]
    .filter(Boolean)
    .join(", ");
  const withWhat =
    plan.vehicle === "none" ? "sans voiture" : `et la ${vehicle?.label.toLowerCase() ?? "voiture"}`;
  const outDay = planHasWhen(plan) ? dayMonth(planDay(plan)) : null;
  const km = Math.round(b.roadKm).toLocaleString("fr-FR");
  const extras = plan.extras ?? {};
  const slices: Slice[] = [
    {
      key: "boat",
      label: "La traversée",
      icon: Ship,
      color: "#1f6fb2",
      amount: b.out.amount + (b.back?.amount ?? 0),
      how: (
        <>
          Aller {line}
          {outDay ? ` le ${outDay}` : ""} : ≈ {nice(b.out.amount)} (
          {seasonLabels[b.out.season].toLowerCase()}).
          {b.back ? (
            <>
              {" "}
              Retour{plan.returnDate ? ` le ${dayMonth(plan.returnDate)}` : ""} : ≈{" "}
              {nice(b.back.amount)} ({seasonLabels[b.back.season].toLowerCase()}).
            </>
          ) : (
            " Pas de retour choisi : il n'est pas compté."
          )}{" "}
          C'est le prix moyen de la ligne pour {who} {withWhat}.
        </>
      ),
    },
    ...(b.fuel
      ? [
          {
            key: "fuel",
            label: "L'essence",
            icon: Fuel,
            color: "#e0a030",
            amount: b.fuel,
            how: (
              <>
                {plan.home?.name ?? "Chez vous"} → {fromChoice.port.name} : environ {km} km
                {b.trips > 1 ? ", à faire 2 fois (aller et retour)" : ""}. Une voiture moyenne
                consomme {FUEL_L_PER_100} L aux 100 km, à{" "}
                {FUEL_EURO_PER_L.toLocaleString("fr-FR")} € le litre.
              </>
            ),
          },
        ]
      : []),
    ...(b.tolls
      ? [
          {
            key: "tolls",
            label: "Les péages",
            icon: Coins,
            color: "#8a6bd1",
            amount: b.tolls,
            how: (
              <>
                Les autoroutes françaises coûtent environ {Math.round(TOLL_EURO_PER_KM * 100)}{" "}
                centimes par kilomètre : {km} km{b.trips > 1 ? " × 2" : ""}.
              </>
            ),
          },
        ]
      : []),
    ...(b.fees && papers
      ? [
          {
            key: "papers",
            label: "Les papiers",
            icon: FileText,
            color: "#2e9e6a",
            amount: b.fees,
            how: (
              <>
                Les frais connus de votre liste :{" "}
                {papers.items.map((item) => `${item.label} (${euros(item.eur)})`).join(", ")}. Les
                papiers sans tarif officiel publié ne sont pas comptés.
              </>
            ),
          },
        ]
      : []),
    ...EXTRA_FIELDS.filter((field) => (extras[field.key] ?? 0) > 0).map((field) => ({
      key: field.key,
      label: field.label,
      icon: field.icon,
      color: field.color,
      amount: extras[field.key]!,
      how: <>Le montant que vous avez indiqué. {field.hint}</>,
      mine: true,
    })),
  ];
  const biggest = [...slices].sort((x, y) => y.amount - x.amount)[0]!;
  // Une longue route jusqu'au port : la nuit d'étape mérite d'être prévue.
  const driveHours = b.roadKm / 90;
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
      <div className="bw-tbudget__chart">
        <BudgetDonut slices={slices} total={b.total} />
        <ul className="bw-tbudget__legend">
          {slices.map((slice) => {
            const Icon = slice.icon;
            return (
              <li key={slice.key} style={{ "--k": slice.color } as CSSProperties}>
                <details>
                  <summary>
                    <span className="bw-tbudget__ico" aria-hidden>
                      <Icon size={15} />
                    </span>
                    <span className="bw-tbudget__lbl">
                      {slice.label}
                      {slice.mine ? <em>ajouté par vous</em> : null}
                    </span>
                    <span className="bw-tbudget__amt">
                      {nice(slice.amount)}
                      <small>{pct(slice.amount, b.total)} %</small>
                    </span>
                    <ChevronDown size={14} className="bw-tbudget__chev" aria-hidden />
                  </summary>
                  <p className="bw-tbudget__how">{slice.how}</p>
                </details>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="bw-tbudget__tip">
        <Lightbulb size={16} aria-hidden />
        <span>
          Sur {nice(b.total)}, la plus grosse part est <b>{biggest.label.toLowerCase()}</b> (
          {pct(biggest.amount, b.total)} %). Touchez une ligne pour voir le calcul.
        </span>
      </p>
      {onExtras ? (
        <div className="bw-tbudget__own">
          <button
            type="button"
            className="bw-tbudget__ownbtn"
            aria-expanded={editing}
            onClick={() => setEditing((v) => !v)}
          >
            <Plus size={15} aria-hidden />
            <span className="flex-1 text-left">
              {b.own ? `Mes autres dépenses : ${nice(b.own)}` : "Ajouter mes autres dépenses"}
            </span>
            <ChevronDown size={14} className={editing ? "rotate-180" : ""} aria-hidden />
          </button>
          {editing ? (
            <div className="bw-tbudget__fields">
              {EXTRA_FIELDS.map((field) => {
                const Icon = field.icon;
                return (
                  <label key={field.key} style={{ "--k": field.color } as CSSProperties}>
                    <span className="bw-tbudget__ico" aria-hidden>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b>{field.label}</b>
                      <small>
                        {field.key === "hotel" && driveHours >= 7
                          ? `Environ ${Math.round(driveHours)} h de route jusqu'au port : une nuit d'étape peut être utile.`
                          : field.hint}
                      </small>
                    </span>
                    <span className="bw-tbudget__input">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={10}
                        placeholder="0"
                        value={extras[field.key] ?? ""}
                        onChange={(event) => {
                          const value = Math.max(0, Math.round(Number(event.target.value) || 0));
                          onExtras({ ...extras, [field.key]: value || undefined });
                        }}
                        aria-label={`${field.label}, en euros`}
                      />
                      €
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="bw-tbudget__note">
        Le prix réel peut aller de {nice(b.low)} à {nice(b.high)} selon la compagnie, la date et
        votre place à bord.{" "}
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
