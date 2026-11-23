import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  CalendarDays,
  Clock3,
  ExternalLink,
  Info,
  Map as MapIcon,
  Ship,
  Wallet,
} from "lucide-react";
import { LineAlertNotice } from "@/components/panel/VesselAlert";
import { LineCalendar } from "@/components/panel/LineCalendar";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { VesselCard } from "@/components/panel/VesselCard";
import { durationRange } from "@/components/panel/LineOverview";
import { BookingLink } from "@/components/panel/shared";
import { absoluteUrl, seoHead } from "@/lib/seo/site";
import { Breadcrumbs, FaqSection, StructuredData } from "@/components/editorial/Editorial";
import {
  DepartureRows,
  heroChip,
  heroPrimary,
  heroSecondary,
  KeyFacts,
  PortTile,
  SectionTitle,
  ShowcaseHero,
  ShowcaseMap,
  type Fact,
} from "@/components/editorial/Showcase";
import { CONFIRM_NOTE, lineFaq, lineSummary } from "@/lib/seo/answers";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { deName, formatDate, formatDuration } from "@/lib/ferry/format";
import { lineStats } from "@/lib/ferry/lineStats";
import { lineBenchmark, seasonFares, weeklyPace } from "@/lib/ferry/showcase";
import { portTimeZone, zoneLabel } from "@/lib/ferry/time";
import { safeExternalUrl } from "@/components/panel/shared";

export const Route = createFileRoute("/lignes/$slug")({
  loader: async ({ context, params }) => {
    const [routes, ports] = await Promise.all([
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(portsQuery),
    ]);
    const route = routes.find((item) => item.slug === params.slug);
    if (!route) throw notFound();
    const [companies] = await Promise.all([
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(vesselsQuery),
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()),
    ]);
    const from = ports.find((port) => port.id === route.departure_port_id);
    const to = ports.find((port) => port.id === route.arrival_port_id);
    const benchmark = from && to ? lineBenchmark(from, to) : null;
    return {
      from: from?.name ?? "—",
      to: to?.name ?? "—",
      duration: route.typical_duration_minutes
        ? formatDuration(route.typical_duration_minutes)
        : null,
      operators: companies
        .filter((company) => route.company_ids.includes(company.id))
        .map((company) => company.name),
      price: benchmark ? { foot: benchmark.foot, car: benchmark.withCar } : null,
      slug: route.slug,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Ligne indisponible — BledWay" }, { name: "robots", content: "noindex" }],
      };
    }
    const { from, to, duration, operators, price } = loaderData;
    const title = `Ferry ${from} — ${to} : horaires, durée, prix, compagnies | BledWay`;
    const description = [
      `Ferry ${from} → ${to}`,
      duration ? `environ ${duration} de traversée` : null,
      operators.length ? operators.join(", ") : null,
      price ? `repère dès ${price.foot} € à pied, ${price.car} € avec voiture` : null,
      "prochains départs datés",
    ]
      .filter(Boolean)
      .join(" · ");
    return seoHead(title, `${description}.`, `/lignes/${loaderData.slug}`);
  },
  component: LignePage,
});

function LignePage() {
  const { slug } = Route.useParams();
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const { data: departures } = useSuspenseQuery(upcomingDeparturesQuery());

  const route = routes.find((item) => item.slug === slug);
  if (!route) return null;
  const from = ports.find((port) => port.id === route.departure_port_id);
  const to = ports.find((port) => port.id === route.arrival_port_id);
  const fromName = from?.name ?? "—";
  const toName = to?.name ?? "—";
  const lineDepartures = departures.filter((departure) => departure.route_id === route.id);
  const stats = lineStats({ departures: lineDepartures, companies, vessels });
  const operators = companies.filter(
    (company) =>
      route.company_ids.includes(company.id) ||
      lineDepartures.some((departure) => departure.company_id === company.id),
  );
  const timeZone = portTimeZone(from);
  const reverse = routes.find(
    (item) =>
      item.departure_port_id === route.arrival_port_id &&
      item.arrival_port_id === route.departure_port_id,
  );
  const nextDepartures = lineDepartures.slice(0, 8);
  const next = stats.upcoming
    ? lineDepartures.find((departure) => departure.status !== "cancelled")
    : undefined;
  const pace = weeklyPace(lineDepartures);
  const benchmark = from && to ? lineBenchmark(from, to) : null;
  const fares = from && to ? seasonFares(from, to) : null;
  const durationMin = stats.operators.reduce<number | null>(
    (min, item) =>
      item.minMinutes === null
        ? min
        : min === null
          ? item.minMinutes
          : Math.min(min, item.minMinutes),
    null,
  );
  const durationMax = stats.operators.reduce<number | null>(
    (max, item) =>
      item.maxMinutes === null
        ? max
        : max === null
          ? item.maxMinutes
          : Math.max(max, item.maxMinutes),
    null,
  );
  const lineVessels = stats.vessels.filter((vessel) => vessel.status === "active");
  const siblingLines = routes.filter(
    (item) =>
      item.id !== route.id &&
      item.id !== reverse?.id &&
      (item.departure_port_id === route.departure_port_id ||
        item.arrival_port_id === route.arrival_port_id),
  );
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";

  const facts: Fact[] = [];
  const range = durationRange(durationMin, durationMax);
  if (range || route.typical_duration_minutes)
    facts.push({
      icon: Clock3,
      label: "Durée",
      value: range ?? formatDuration(route.typical_duration_minutes),
      hint: range ? "Selon le départ et le navire" : "Durée typique, estimation",
    });
  if (pace)
    facts.push({
      icon: CalendarDays,
      label: pace.kind === "average" ? "Départs par semaine" : "Départs sous 7 jours",
      value: pace.kind === "average" ? `≈ ${pace.value}` : String(pace.value),
      hint:
        pace.kind === "average"
          ? `Moyenne des ${pace.weeks} prochaines semaines`
          : "Calendrier publié à court terme",
    });
  if (benchmark)
    facts.push({
      icon: Wallet,
      label: "Prix repère",
      value: `${benchmark.withCar} €`,
      hint: `Aller simple avec voiture · ${benchmark.foot} € à pied (relevé sept.–oct. 2026)`,
    });
  if (operators.length)
    facts.push({
      icon: Building2,
      label: operators.length > 1 ? "Compagnies" : "Compagnie",
      value: (
        <span className="flex flex-wrap items-center gap-2">
          {operators.length}
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {operators.slice(0, 3).map((company) => (
              <CompanyBadge
                key={company.id}
                name={company.name}
                logoUrl={company.logo_url}
                size={22}
              />
            ))}
          </span>
        </span>
      ),
      hint: operators.map((company) => company.name).join(", "),
    });

  const summary = lineSummary(
    fromName,
    toName,
    route.typical_duration_minutes,
    operators.map((company) => company.name),
  );
  const terminal = (port: typeof from) =>
    port
      ? {
          "@type": "BoatTerminal",
          name: `Port ${deName(port.name)}`,
          url: absoluteUrl(`/ports/${port.slug}`),
          address: {
            "@type": "PostalAddress",
            addressCountry: port.country_code,
            addressLocality: port.city ?? port.name,
          },
          geo: { "@type": "GeoCoordinates", latitude: port.latitude, longitude: port.longitude },
        }
      : undefined;
  const provider = operators.map((company) => ({
    "@type": "Organization",
    name: company.name,
    ...(safeExternalUrl(company.website_url) ? { url: safeExternalUrl(company.website_url) } : {}),
  }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Ferry ${fromName} → ${toName}`,
    url: absoluteUrl(`/lignes/${route.slug}`),
    inLanguage: "fr",
    description: summary,
    mainEntity: {
      "@type": "BoatTrip",
      name: `Ferry ${fromName} → ${toName}`,
      departureBoatTerminal: terminal(from),
      arrivalBoatTerminal: terminal(to),
      provider,
      ...(route.typical_duration_minutes
        ? {
            description: `Durée typique estimée : ${formatDuration(route.typical_duration_minutes)}.`,
          }
        : {}),
    },
    ...(nextDepartures.length
      ? {
          hasPart: {
            "@type": "ItemList",
            name: `Prochains départs ${fromName} → ${toName}`,
            itemListElement: nextDepartures
              .filter((departure) => departure.status !== "cancelled")
              .map((departure, index) => {
                const company = companies.find((item) => item.id === departure.company_id);
                const vessel = vessels.find((item) => item.id === departure.vessel_id);
                return {
                  "@type": "ListItem",
                  position: index + 1,
                  item: {
                    "@type": "BoatTrip",
                    name: `${fromName} → ${toName}${vessel ? ` · ${vessel.name}` : ""}`,
                    departureTime: departure.departure_at,
                    ...(departure.arrival_at ? { arrivalTime: departure.arrival_at } : {}),
                    ...(company
                      ? { provider: { "@type": "Organization", name: company.name } }
                      : {}),
                  },
                };
              }),
          },
        }
      : {}),
  };

  return (
    <SiteLayout>
      <StructuredData value={jsonLd} />
      <Breadcrumbs
        items={[
          { name: "Lignes", path: "/lignes" },
          { name: `${fromName} → ${toName}`, path: `/lignes/${route.slug}` },
        ]}
      />

      <ShowcaseHero
        overline={`Ligne maritime · ${from?.country_name ?? ""} → ${to?.country_name ?? ""}`}
        title={`Ferry ${fromName} → ${toName}`}
        intro={<p>{summary}</p>}
        chips={
          <>
            {next ? (
              <span className={heroChip}>
                <span className="size-2 rounded-full bg-[#0e7a43]" aria-hidden />
                Prochain départ : {formatDate(next.departure_at, timeZone)}
              </span>
            ) : null}
            {route.distance_km ? <span className={heroChip}>{route.distance_km} km</span> : null}
            <span className={heroChip}>Heures en {zoneLabel(timeZone)}</span>
          </>
        }
        actions={
          <>
            <Link
              to="/"
              search={{ select: "route", id: route.id } as never}
              className={heroPrimary}
            >
              <MapIcon className="size-4" aria-hidden /> Suivre la ligne sur la carte
            </Link>
            {reverse ? (
              <Link to="/lignes/$slug" params={{ slug: reverse.slug }} className={heroSecondary}>
                <ArrowLeftRight className="size-4" aria-hidden /> Sens inverse : {toName} →{" "}
                {fromName}
              </Link>
            ) : null}
          </>
        }
        visual={
          <ShowcaseMap
            className="h-full"
            routes={routes}
            ports={ports}
            routeIds={[route.id]}
            selectedRouteId={route.id}
          />
        }
      />

      <KeyFacts facts={facts} label={`La ligne ${fromName} → ${toName} en chiffres`} />

      <div className="mt-4 empty:hidden">
        <LineAlertNotice departures={lineDepartures} vessels={vessels} />
      </div>

      <section className="mt-12" aria-labelledby="prochains-departs">
        <SectionTitle
          id="prochains-departs"
          overline="Calendrier"
          title="Prochains départs"
          aside={
            stats.lastAt ? `Publiés jusqu'au ${formatDate(stats.lastAt, timeZone)}` : undefined
          }
        >
          Touchez un départ pour le voir sur la carte, avec sa position en direct quand le navire
          est en mer.
        </SectionTitle>
        <DepartureRows
          departures={nextDepartures}
          companies={companies}
          vessels={vessels}
          ports={ports}
          routes={routes}
          timeZone={timeZone}
          empty="Aucun départ publié pour le moment sur cette ligne. Les compagnies ouvrent leurs calendriers par saison : revenez bientôt ou suivez la ligne sur la carte."
        />
      </section>

      {operators.length ? (
        <section className="mt-12" aria-labelledby="compagnies">
          <SectionTitle id="compagnies" overline="Réserver" title="Les compagnies de la ligne">
            La réservation se fait directement auprès de la compagnie. {CONFIRM_NOTE}
          </SectionTitle>
          <div
            className={`mt-5 grid grid-cols-1 gap-4 ${operators.length > 1 ? "md:grid-cols-2" : ""} ${operators.length === 3 || operators.length > 4 ? "lg:grid-cols-3" : ""}`}
          >
            {operators.map((company) => {
              const entry = stats.operators.find((item) => item.company.id === company.id);
              const companyRange = entry ? durationRange(entry.minMinutes, entry.maxMinutes) : null;
              return (
                <article
                  key={company.id}
                  className="flex min-w-0 flex-col rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
                >
                  <div className="flex items-center gap-3">
                    <CompanyBadge name={company.name} logoUrl={company.logo_url} size={44} />
                    <h3 className="min-w-0 font-display text-lg font-bold text-[#0f2a3d]">
                      {company.name}
                    </h3>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-secondary/70 px-3 py-2.5">
                      <dt className="text-xs text-muted-foreground">Départs publiés</dt>
                      <dd className="font-display text-lg font-bold">{entry?.count ?? 0}</dd>
                    </div>
                    <div className="rounded-xl bg-secondary/70 px-3 py-2.5">
                      <dt className="text-xs text-muted-foreground">Durée</dt>
                      <dd className="font-display text-lg font-bold">
                        {companyRange ?? formatDuration(route.typical_duration_minutes)}
                      </dd>
                    </div>
                  </dl>
                  {entry?.vessels.length ? (
                    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                      <Ship className="size-4 text-[#0e7a43]" aria-hidden />
                      {entry.vessels.map((vessel) => vessel.name).join(" · ")}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-col gap-2 pt-5">
                    <BookingLink company={company} />
                    <Link
                      to="/"
                      search={{ select: "company", id: company.id } as never}
                      className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-[#0e7a43] hover:underline"
                    >
                      Sa flotte sur la carte <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {fares ? (
        <section className="mt-12" aria-labelledby="prix-saison">
          <SectionTitle id="prix-saison" overline="Budget" title="Combien ça coûte selon la saison">
            Estimation BledWay d'un aller simple pour 1 adulte, à partir du relevé publié sur cette
            ligne. Ce ne sont pas des prix disponibles : le devis de la compagnie fait foi.
          </SectionTitle>
          <div className="mt-5 overflow-hidden rounded-3xl border border-border bg-card">
            <div className="hidden grid-cols-[1.3fr_1fr_1fr] gap-4 border-b border-border bg-secondary/60 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Période</span>
              <span>À pied</span>
              <span>Avec une berline</span>
            </div>
            <ul className="divide-y divide-border">
              {fares.map(({ season, foot, car }) => {
                const max = fares[fares.length - 1]!.car.amount;
                return (
                  <li
                    key={season.season}
                    className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-[1.3fr_1fr_1fr] sm:items-center sm:gap-4"
                  >
                    <span>
                      <span className="block font-semibold text-[#0f2a3d]">{season.label}</span>
                      <span className="text-xs text-muted-foreground">{season.months}</span>
                    </span>
                    <span className="flex items-baseline justify-between gap-2 sm:block">
                      <span className="text-xs text-muted-foreground sm:hidden">À pied</span>
                      <span className="font-display text-lg font-bold">~{foot.amount} €</span>
                    </span>
                    <span>
                      <span className="flex items-baseline justify-between gap-2 sm:block">
                        <span className="text-xs text-muted-foreground sm:hidden">
                          Avec une berline
                        </span>
                        <span className="font-display text-lg font-bold text-[#0e7a43]">
                          ~{car.amount} €
                        </span>
                      </span>
                      <span className="mt-1.5 block h-1.5 rounded-full bg-secondary">
                        <span
                          className="block h-1.5 rounded-full bg-gradient-to-r from-[#0e7a43] to-[#f2b705]"
                          style={{ width: `${Math.round((car.amount / max) * 100)}%` }}
                        />
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="flex items-start gap-2 border-t border-border bg-[#f1f8f4] px-5 py-3 text-xs leading-5 text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-[#0e7a43]" aria-hidden />
              <span>
                Relevé Direct Ferries de septembre–octobre 2026 : {benchmark!.foot} € à pied,{" "}
                {benchmark!.withCar} € avec voiture.{" "}
                <a
                  href={benchmark!.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#0e7a43] underline"
                >
                  Voir le relevé <ExternalLink className="inline size-3" aria-hidden />
                </a>{" "}
                ·{" "}
                <a href="/barometre-prix" className="font-semibold text-[#0e7a43] underline">
                  Méthode et baromètre des prix
                </a>
              </span>
            </p>
          </div>
        </section>
      ) : null}

      <section className="mt-12" aria-labelledby="jours-depart">
        <SectionTitle id="jours-depart" overline="Rythme" title="Jours et heures de départ">
          Les jours de la semaine où la ligne part, d'après le calendrier publié.
        </SectionTitle>
        <div className="mt-4">
          <LineCalendar departures={lineDepartures} companies={companies} timeZone={timeZone} />
        </div>
      </section>

      {lineVessels.length ? (
        <section className="mt-12" aria-labelledby="navires">
          <SectionTitle id="navires" overline="À bord" title="Les navires de la ligne">
            Les bateaux programmés sur {fromName} → {toName}, du plus fréquent au plus rare.
          </SectionTitle>
          <div
            className={`mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 ${lineVessels.length % 2 ? "lg:grid-cols-3" : ""}`}
          >
            {lineVessels.map((vessel) => (
              <VesselCard key={vessel.id} vessel={vessel} ports={ports} routes={[route]} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12" aria-labelledby="ports">
        <SectionTitle
          id="ports"
          overline="Aux deux bouts"
          title="Les ports et les lignes voisines"
        />
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {from ? <PortTile port={from} caption="Départ" /> : null}
          {to ? <PortTile port={to} caption="Arrivée" /> : null}
        </div>
        {reverse || siblingLines.length ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {reverse ? (
              <li>
                <Link
                  to="/lignes/$slug"
                  params={{ slug: reverse.slug }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#0f2a3d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f2a3d]/90"
                >
                  <ArrowLeftRight className="size-3.5" aria-hidden /> {toName} → {fromName}
                </Link>
              </li>
            ) : null}
            {siblingLines.map((item) => (
              <li key={item.id}>
                <Link
                  to="/lignes/$slug"
                  params={{ slug: item.slug }}
                  className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:border-[#0e7a43]/40 hover:bg-[#f1f8f4]"
                >
                  {portName(item.departure_port_id)} → {portName(item.arrival_port_id)}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <FaqSection
        path={`/lignes/${route.slug}`}
        faq={lineFaq({
          from: fromName,
          to: toName,
          fromSlug: from?.slug,
          toSlug: to?.slug,
          minutes: route.typical_duration_minutes,
          operators: operators.map((company) => company.name),
          hasReverse: Boolean(reverse),
        })}
      />

      <nav
        aria-label="Pour aller plus loin"
        className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {[
          {
            href: "/preparer-mon-voyage",
            title: "Préparer mon voyage",
            text: "Papiers, voiture, budget : pas à pas",
          },
          {
            href: "/barometre-prix",
            title: "Baromètre des prix",
            text: "Repères par ligne et par saison",
          },
          {
            href: "/questions-frequentes",
            title: "Questions fréquentes",
            text: "Les réponses courtes et sourcées",
          },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="group rounded-2xl border border-border bg-card p-4 transition hover:border-[#0e7a43]/40"
          >
            <span className="flex items-center justify-between font-semibold text-[#0f2a3d]">
              {item.title}
              <ArrowRight
                className="size-4 text-[#0e7a43] transition group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">{item.text}</span>
          </a>
        ))}
      </nav>
    </SiteLayout>
  );
}
