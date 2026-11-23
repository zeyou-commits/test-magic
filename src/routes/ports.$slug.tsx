import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Map as MapIcon,
  Navigation,
  Route as RouteIcon,
} from "lucide-react";
import { absoluteUrl, seoHead } from "@/lib/seo/site";
import { Breadcrumbs, FaqSection, StructuredData } from "@/components/editorial/Editorial";
import {
  DepartureRows,
  heroChip,
  heroPrimary,
  KeyFacts,
  SectionTitle,
  ShowcaseHero,
  ShowcaseMap,
  type Fact,
} from "@/components/editorial/Showcase";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { BookingLink } from "@/components/panel/shared";
import { portFaq } from "@/lib/seo/answers";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import {
  deName,
  facilityLabels,
  formatDate,
  formatDuration,
  isFacilityFilled,
  ratingOnlyFacilities,
} from "@/lib/ferry/format";
import { portPhotoQuery } from "@/lib/ferry/vesselPhoto";
import { weeklyPace } from "@/lib/ferry/showcase";
import { portTimeZone, zoneLabel } from "@/lib/ferry/time";
import { tr } from "@/lib/i18n";

export const Route = createFileRoute("/ports/$slug")({
  loader: async ({ context, params }) => {
    const ports = await context.queryClient.ensureQueryData(portsQuery);
    const port = ports.find((item) => item.slug === params.slug);
    if (!port) throw notFound();
    const [routes] = await Promise.all([
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(vesselsQuery),
      context.queryClient.ensureQueryData(upcomingDeparturesQuery()),
    ]);
    const connected = [
      ...new Set(
        routes
          .filter(
            (route) => route.departure_port_id === port.id || route.arrival_port_id === port.id,
          )
          .map(
            (route) =>
              ports.find(
                (item) =>
                  item.id ===
                  (route.departure_port_id === port.id
                    ? route.arrival_port_id
                    : route.departure_port_id),
              )?.name,
          )
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    return { name: port.name, country: port.country_name, slug: port.slug, connected };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Port indisponible — BledWay" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `Ferry ${loaderData.name} (${loaderData.country}) : lignes, départs, services | BledWay`;
    const description = `Port ${deName(loaderData.name)} : ferries vers ${loaderData.connected.join(", ") || "les ports reliés"}, prochains départs datés, compagnies, durées et services du port.`;
    return seoHead(title, description, `/ports/${loaderData.slug}`);
  },
  component: PortPage,
});

function PortPage() {
  const { slug } = Route.useParams();
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const { data: departures } = useSuspenseQuery(upcomingDeparturesQuery());

  const port = ports.find((item) => item.slug === slug);
  const photo = useQuery({ ...portPhotoQuery(port ?? { id: "", name: "", photo_url: null }) }).data;
  if (!port) return null;
  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";
  const portRoutes = routes.filter(
    (route) => route.departure_port_id === port.id || route.arrival_port_id === port.id,
  );
  const outbound = portRoutes.filter((route) => route.departure_port_id === port.id);
  const inbound = portRoutes.filter((route) => route.arrival_port_id === port.id);
  const outboundIds = new Set(outbound.map((route) => route.id));
  const portDepartures = departures.filter((departure) => outboundIds.has(departure.route_id));
  const nextDepartures = portDepartures.slice(0, 8);
  const timeZone = portTimeZone(port);
  const facilities = Object.entries(port.facilities ?? {}).filter(
    ([key, value]) => !ratingOnlyFacilities.has(key) && isFacilityFilled(value),
  );
  const operators = companies.filter((company) =>
    portRoutes.some(
      (route) =>
        route.company_ids.includes(company.id) ||
        portDepartures.some(
          (departure) => departure.company_id === company.id && departure.route_id === route.id,
        ),
    ),
  );
  const connectedIds = [
    ...new Set(
      portRoutes.map((route) =>
        route.departure_port_id === port.id ? route.arrival_port_id : route.departure_port_id,
      ),
    ),
  ];
  const pace = weeklyPace(portDepartures);

  const facts: Fact[] = [
    {
      icon: RouteIcon,
      label: "Lignes",
      value: String(portRoutes.length),
      hint: `${outbound.length} au départ · ${inbound.length} à l'arrivée`,
    },
    {
      icon: Navigation,
      label: "Ports reliés",
      value: String(connectedIds.length),
      hint: connectedIds.map(portName).join(", "),
    },
  ];
  if (pace)
    facts.push({
      icon: CalendarDays,
      label: pace.kind === "average" ? "Départs par semaine" : "Départs sous 7 jours",
      value: pace.kind === "average" ? `≈ ${pace.value}` : String(pace.value),
      hint:
        pace.kind === "average"
          ? `Au départ du port, moyenne des ${pace.weeks} prochaines semaines`
          : "Au départ du port",
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

  const lineCard = (route: (typeof portRoutes)[number]) => {
    const lineCompanies = companies.filter(
      (company) =>
        route.company_ids.includes(company.id) ||
        departures.some(
          (departure) => departure.route_id === route.id && departure.company_id === company.id,
        ),
    );
    const next = departures.find(
      (departure) => departure.route_id === route.id && departure.status !== "cancelled",
    );
    const fromPort = ports.find((item) => item.id === route.departure_port_id);
    return (
      <li key={route.id}>
        <Link
          to="/lignes/$slug"
          params={{ slug: route.slug }}
          className="group flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-[#0e7a43]/35 hover:shadow-md"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="font-display text-lg font-bold text-[#0f2a3d]">
              {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
            </span>
            <ArrowRight
              className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#0e7a43]"
              aria-hidden
            />
          </span>
          <span className="mt-1 text-sm text-muted-foreground">
            {route.typical_duration_minutes
              ? `Environ ${formatDuration(route.typical_duration_minutes)}`
              : "Durée à confirmer"}
            {next
              ? ` · prochain départ le ${formatDate(next.departure_at, portTimeZone(fromPort))}`
              : " · aucun départ publié"}
          </span>
          {lineCompanies.length ? (
            <span className="mt-auto flex flex-wrap items-center gap-2 pt-3">
              {lineCompanies.map((company) => (
                <CompanyBadge
                  key={company.id}
                  name={company.name}
                  logoUrl={company.logo_url}
                  size={20}
                />
              ))}
            </span>
          ) : null}
        </Link>
      </li>
    );
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BoatTerminal",
    name: `Port ${deName(port.name)}`,
    url: absoluteUrl(`/ports/${port.slug}`),
    description: `Gare maritime ${deName(port.name)} (${port.country_name}) : ${portRoutes.length} ligne${portRoutes.length > 1 ? "s" : ""} de ferry vers ${connectedIds.map(portName).join(", ")}.`,
    address: {
      "@type": "PostalAddress",
      addressCountry: port.country_code,
      ...(port.city ? { addressLocality: port.city } : {}),
    },
    geo: { "@type": "GeoCoordinates", latitude: port.latitude, longitude: port.longitude },
    ...(port.photo_url?.startsWith("https://") ? { image: port.photo_url } : {}),
    subjectOf: portRoutes.map((route) => ({
      "@type": "BoatTrip",
      name: `Ferry ${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`,
      url: absoluteUrl(`/lignes/${route.slug}`),
    })),
  };

  return (
    <SiteLayout>
      <StructuredData value={jsonLd} />
      <Breadcrumbs
        items={[
          { name: "Ports", path: "/ports" },
          { name: port.name, path: `/ports/${port.slug}` },
        ]}
      />
      <ShowcaseHero
        overline={`Port · ${port.country_name}${port.city && port.city !== port.name ? ` · ${port.city}` : ""}`}
        title={`Ferry au port ${deName(port.name)}`}
        intro={
          <p>
            {port.notes ??
              `Lignes maritimes, prochains départs, compagnies et services du port ${deName(port.name)}.`}
          </p>
        }
        chips={
          <>
            {connectedIds.slice(0, 6).map((id) => (
              <span key={id} className={heroChip}>
                ⇄ {portName(id)}
              </span>
            ))}
            <span className={heroChip}>Heures en {zoneLabel(timeZone)}</span>
          </>
        }
        actions={
          <Link to="/" search={{ select: "port", id: port.id } as never} className={heroPrimary}>
            <MapIcon className="size-4" aria-hidden />{" "}
            {tr("ui.pagePortsSlug.voirLesProchainsDepartsSur")}
          </Link>
        }
        visual={
          <ShowcaseMap
            className="h-full"
            routes={routes}
            ports={ports}
            routeIds={portRoutes.map((route) => route.id)}
          />
        }
      />
      {port.status === "inactive" ? (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {tr("ui.pagePortsSlug.cePortEstTemporairementFerme")}
        </p>
      ) : null}

      <KeyFacts facts={facts} label={`Le port ${deName(port.name)} en chiffres`} />

      <section className="mt-12" aria-labelledby="prochains-departs">
        <SectionTitle
          id="prochains-departs"
          overline="Calendrier"
          title={`Prochains départs ${deName(port.name)}`}
        >
          Toutes lignes confondues. Touchez un départ pour le voir sur la carte.
        </SectionTitle>
        <DepartureRows
          departures={nextDepartures}
          companies={companies}
          vessels={vessels}
          ports={ports}
          routes={routes}
          timeZone={timeZone}
          showRoute
          empty="Aucun départ publié pour le moment au départ de ce port."
        />
      </section>

      <section className="mt-12" aria-labelledby="lignes">
        <SectionTitle id="lignes" overline="Lignes" title={`Les lignes ${deName(port.name)}`} />
        {outbound.length ? (
          <>
            <h3 className="mt-5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Au départ
            </h3>
            <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {outbound.map(lineCard)}
            </ul>
          </>
        ) : null}
        {inbound.length ? (
          <>
            <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              À l'arrivée
            </h3>
            <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inbound.map(lineCard)}
            </ul>
          </>
        ) : null}
        {portRoutes.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {tr("ui.pagePortsSlug.aucuneLigneEnregistreePourCe")}
          </p>
        ) : null}
      </section>

      {facilities.length > 0 || photo?.url ? (
        <section className="mt-12" aria-labelledby="services">
          <SectionTitle
            id="services"
            overline="Sur place"
            title={tr("ui.pagePortsSlug.servicesDuPort")}
          />
          <div
            className={`mt-5 grid grid-cols-1 gap-4 ${photo?.url ? "lg:grid-cols-[1fr_1.4fr]" : ""}`}
          >
            {photo?.url ? (
              <figure className="overflow-hidden rounded-2xl border border-border bg-card">
                <img
                  src={photo.url}
                  alt={`Le port ${deName(port.name)}`}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full object-cover"
                />
                {photo.credit || photo.license ? (
                  <figcaption className="px-3 py-2 text-[11px] text-muted-foreground">
                    {[photo.credit, photo.license].filter(Boolean).join(" · ")}
                    {photo.pageUrl ? (
                      <>
                        {" · "}
                        <a
                          href={photo.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          Source
                        </a>
                      </>
                    ) : null}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}
            {facilities.length ? (
              <dl className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2">
                {facilities.map(([key, value]) => (
                  <div key={key} className="rounded-2xl border border-border bg-card px-4 py-3">
                    <dt className="text-sm font-semibold text-[#0f2a3d]">
                      {facilityLabels[key] ?? key}
                    </dt>
                    <dd className="mt-0.5 text-sm text-muted-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </section>
      ) : null}

      {operators.length > 0 ? (
        <section className="mt-12" aria-labelledby="compagnies">
          <SectionTitle
            id="compagnies"
            overline="Réserver"
            title={tr("ui.pagePortsSlug.compagniesPresentes")}
          >
            La réservation se fait directement auprès de la compagnie.
          </SectionTitle>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {operators.map((company) => (
              <div
                key={company.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <CompanyBadge name={company.name} logoUrl={company.logo_url} size={36} />
                  <p className="font-display font-semibold text-[#0f2a3d]">{company.name}</p>
                </div>
                <div className="mt-auto">
                  <BookingLink company={company} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <FaqSection
        path={`/ports/${port.slug}`}
        faq={portFaq({
          name: port.name,
          country: port.country_name,
          connected: connectedIds.map(portName),
          operators: operators.map((company) => company.name),
          inactive: port.status === "inactive",
        })}
      />

      <nav
        aria-label="Pour aller plus loin"
        className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {[
          { href: "/ports", title: "Tous les ports", text: "Europe et Algérie, sur une carte" },
          {
            href: "/routes-du-bled",
            title: "Routes du bled",
            text: "La route jusqu'au port, avec les haltes",
          },
          {
            href: "/preparer-mon-voyage",
            title: "Préparer mon voyage",
            text: "Papiers, voiture, budget : pas à pas",
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
