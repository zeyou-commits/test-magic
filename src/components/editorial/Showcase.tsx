import { lazy, Suspense, useState, type ReactNode } from "react";
import { ClientOnly, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, type LucideIcon } from "lucide-react";
import { deName, formatDateParts, formatDuration, formatTime } from "@/lib/ferry/format";
import { departureMinutes } from "@/lib/ferry/lineStats";
import { portTimeZone } from "@/lib/ferry/time";
import { portPhotoQuery } from "@/lib/ferry/vesselPhoto";
import type { Company, Departure, Port, RouteLine, Vessel } from "@/lib/ferry/types";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { VesselThumb } from "@/components/panel/LineOverview";
import { VesselAlertTag } from "@/components/panel/VesselAlert";

/*
 * Grammaire commune des pages publiques Ligne, Port et Navire :
 * un en-tête avec la carte, une rangée de chiffres clés, des départs datés cliquables,
 * des cartes compagnie avec logo. Tous les chiffres viennent de la base ou des calculs existants.
 */

const BoardMap = lazy(() => import("@/components/board/BoardMap"));

/** Le tracé sur la vraie carte BledWay (chargée seulement dans le navigateur). */
export function ShowcaseMap({
  routes,
  ports,
  routeIds,
  selectedRouteId = null,
  className = "",
}: {
  routes: RouteLine[];
  ports: Port[];
  routeIds: string[];
  selectedRouteId?: string | null;
  className?: string;
}) {
  const fallback = (
    <div className="bw-show-map-fallback h-full w-full" aria-hidden>
      <svg viewBox="0 0 400 240" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <path
          d="M40 190 C 140 40, 260 40, 360 70"
          fill="none"
          stroke="#0e7a43"
          strokeWidth="4"
          strokeDasharray="10 9"
          strokeLinecap="round"
          opacity=".55"
        />
        <circle cx="40" cy="190" r="8" fill="#0e7a43" />
        <circle cx="360" cy="70" r="8" fill="#0f2a3d" />
      </svg>
    </div>
  );
  return (
    <div
      className={`relative overflow-hidden bg-[#dcebf2] [&_.maplibregl-ctrl-attrib]:!max-w-[75%] [&_.maplibregl-ctrl-attrib]:!rounded-md [&_.maplibregl-ctrl-attrib]:!bg-white/75 [&_.maplibregl-ctrl-attrib]:!px-1.5 [&_.maplibregl-ctrl-attrib]:!py-0 [&_.maplibregl-ctrl-attrib]:!text-[9px] [&_.maplibregl-ctrl-attrib]:!leading-4 ${className}`}
    >
      <ClientOnly fallback={fallback}>
        <Suspense fallback={fallback}>
          <BoardMap
            routes={routes}
            ports={ports}
            routeIds={routeIds}
            selectedRouteId={selectedRouteId}
            selectedAlert={false}
          />
        </Suspense>
      </ClientOnly>
    </div>
  );
}

/** En-tête : texte à gauche, carte (ou visuel) à droite ; carte au-dessus sur téléphone. */
export function ShowcaseHero({
  overline,
  title,
  intro,
  chips,
  actions,
  visual,
}: {
  overline: ReactNode;
  title: string;
  intro?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  visual: ReactNode;
}) {
  return (
    <header className="bw-show-hero mt-5 overflow-hidden rounded-3xl border border-[#0e7a43]/12 bg-card shadow-[0_18px_50px_-30px_rgba(15,42,61,.45)]">
      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        <div className="order-2 flex min-w-0 flex-col justify-center gap-4 bg-gradient-to-br from-[#f1f8f4] via-white to-white p-5 sm:p-8 lg:order-1 lg:p-10">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#0e7a43]">{overline}</p>
          <h1 className="font-display text-[2rem] font-bold leading-[1.05] tracking-tight text-[#0f2a3d] sm:text-5xl">
            {title}
          </h1>
          {intro ? (
            <div className="max-w-xl text-[15px] leading-7 text-muted-foreground">{intro}</div>
          ) : null}
          {chips ? <div className="flex flex-wrap gap-2">{chips}</div> : null}
          {actions ? (
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{actions}</div>
          ) : null}
        </div>
        <div className="order-1 h-64 sm:h-80 lg:order-2 lg:h-auto lg:min-h-[400px]">{visual}</div>
      </div>
    </header>
  );
}

export const heroPrimary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0e7a43] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0b6537] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e7a43]";
export const heroSecondary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white px-5 text-sm font-semibold text-[#0f2a3d] transition hover:border-[#0e7a43]/40 hover:bg-[#f1f8f4]";
export const heroChip =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-[13px] font-medium text-[#0f2a3d]";

export type Fact = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
};

/** Rangée de chiffres clés : 2 colonnes sur téléphone, 4 sur PC. Un chiffre absent n'est pas affiché. */
export function KeyFacts({ facts, label }: { facts: Fact[]; label: string }) {
  if (!facts.length) return null;
  return (
    <section aria-label={label} className="mt-5">
      <dl
        className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${facts.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
      >
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-3.5 transition hover:border-[#0e7a43]/30 sm:p-5"
          >
            <dt className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <span className="grid size-7 place-items-center rounded-lg bg-[#e7f3ec] text-[#0e7a43]">
                <fact.icon className="size-4" aria-hidden />
              </span>
              {fact.label}
            </dt>
            <dd className="mt-3 font-display text-xl font-bold leading-tight text-[#0f2a3d] sm:text-2xl">
              {fact.value}
            </dd>
            {fact.hint ? (
              <dd className="mt-1 text-xs leading-5 text-muted-foreground">{fact.hint}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Titre de section homogène : surtitre vert, titre, phrase d'aide. */
export function SectionTitle({
  id,
  overline,
  title,
  aside,
  children,
}: {
  id: string;
  overline?: string;
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        {overline ? (
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#0e7a43]">{overline}</p>
        ) : null}
        <h2
          id={id}
          className="mt-1 font-display text-2xl font-bold tracking-tight text-[#0f2a3d] sm:text-[1.7rem]"
        >
          {title}
        </h2>
        {children ? (
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{children}</p>
        ) : null}
      </div>
      {aside ? <div className="text-sm text-muted-foreground">{aside}</div> : null}
    </div>
  );
}

/**
 * Départs datés : la date en pavé, l'heure, la compagnie (logo), le navire (son rendu), la durée.
 * Chaque ligne ouvre le départ sur la carte.
 */
export function DepartureRows({
  departures,
  companies,
  vessels,
  ports,
  routes,
  timeZone,
  showRoute = false,
  empty,
}: {
  departures: Departure[];
  companies: Company[];
  vessels: Vessel[];
  ports: Port[];
  routes: RouteLine[];
  timeZone: string;
  /** Sur une page port ou navire, la ligne de chaque départ est rappelée. */
  showRoute?: boolean;
  empty: ReactNode;
}) {
  if (!departures.length)
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-border bg-card px-5 py-6 text-sm text-muted-foreground">
        {empty}
      </p>
    );
  return (
    <ol className="mt-4 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
      {departures.map((departure) => {
        const company = companies.find((item) => item.id === departure.company_id);
        const vessel = vessels.find((item) => item.id === departure.vessel_id);
        const route = routes.find((item) => item.id === departure.route_id);
        const from = route ? ports.find((port) => port.id === route.departure_port_id) : undefined;
        const to = route ? ports.find((port) => port.id === route.arrival_port_id) : undefined;
        const parts = formatDateParts(departure.departure_at, timeZone);
        const minutes = departureMinutes(departure);
        const cancelled = departure.status === "cancelled";
        return (
          <li key={departure.id} className="min-w-0">
            <Link
              to="/"
              search={{ select: "departure", id: departure.id } as never}
              className={`group flex items-center gap-3 rounded-2xl border bg-card p-3 pr-4 transition hover:-translate-y-0.5 hover:border-[#0e7a43]/35 hover:shadow-md sm:gap-4 ${cancelled ? "border-destructive/30 opacity-75" : "border-border"}`}
              aria-label={`Départ du ${parts.weekday} ${parts.shortDate} à ${parts.time}${company ? `, ${company.name}` : ""} : voir sur la carte`}
            >
              <span className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-[#0f2a3d] py-2 text-white">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
                  {parts.weekday}
                </span>
                <span className="font-display text-lg font-bold leading-none">
                  {parts.shortDate.split(" ")[0]}
                </span>
                <span className="text-[11px] text-white/80">
                  {parts.shortDate.split(" ").slice(1).join(" ")}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-lg font-bold text-[#0f2a3d]">
                    {parts.time}
                  </span>
                  {departure.arrival_at && !cancelled ? (
                    <span className="text-xs text-muted-foreground">
                      → {formatTime(departure.arrival_at, to ? portTimeZone(to) : timeZone)}
                    </span>
                  ) : null}
                  {minutes && !cancelled ? (
                    <span className="text-xs text-muted-foreground">
                      · {formatDuration(minutes)}
                    </span>
                  ) : null}
                  {cancelled ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
                      Annulé
                    </span>
                  ) : departure.status === "modified" ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                      Modifié
                    </span>
                  ) : null}
                </span>
                {showRoute && from && to ? (
                  <span className="block truncate text-sm font-semibold text-[#0f2a3d]">
                    {from.name} → {to.name}
                  </span>
                ) : null}
                <span className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                  {company ? (
                    <CompanyBadge name={company.name} logoUrl={company.logo_url} size={18} />
                  ) : null}
                  <span className="truncate">
                    {company?.name ?? "Compagnie à confirmer"}
                    {vessel ? ` · ${vessel.name}` : ""}
                  </span>
                  <VesselAlertTag vesselId={vessel?.id} />
                </span>
              </span>
              {vessel ? (
                <span className="hidden shrink-0 sm:block">
                  <VesselThumb vessel={vessel} width={76} />
                </span>
              ) : null}
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#0e7a43]"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** Carte d'un port : sa photo (celle de la base, sinon Wikimedia Commons), son pays, un lien. */
export function PortTile({ port, caption }: { port: Port; caption?: string }) {
  const photo = useQuery(portPhotoQuery(port)).data ?? null;
  const [failed, setFailed] = useState(false);
  return (
    <Link
      to="/ports/$slug"
      params={{ slug: port.slug }}
      className="group relative flex min-h-36 overflow-hidden rounded-2xl border border-border bg-[#0f2a3d] text-white"
    >
      {photo?.url && !failed ? (
        <img
          src={photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-105"
        />
      ) : null}
      <span className="absolute inset-0 bg-gradient-to-t from-[#0f2a3d] via-[#0f2a3d]/45 to-transparent" />
      <span className="relative mt-auto flex w-full items-end justify-between gap-3 p-4">
        <span>
          {caption ? (
            <span className="block text-xs font-semibold uppercase tracking-wider text-white/75">
              {caption}
            </span>
          ) : null}
          <span className="block font-display text-xl font-bold">Port {deName(port.name)}</span>
          <span className="flex items-center gap-1 text-sm text-white/80">
            <MapPin className="size-3.5" aria-hidden /> {port.city ?? port.name},{" "}
            {port.country_name}
          </span>
        </span>
        <ArrowRight className="size-5 shrink-0 transition group-hover:translate-x-1" aria-hidden />
      </span>
    </Link>
  );
}
