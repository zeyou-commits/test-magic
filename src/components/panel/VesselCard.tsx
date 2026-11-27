import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BedDouble, CalendarDays, CarFront, Gauge, Layers, MoveHorizontal, Ruler, Scale, Ship, Users } from "lucide-react";
import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { VesselPhotoBadge } from "@/components/panel/VesselFacts";
import { vesselDossiers } from "@/content/vessels";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import type { Port, RouteLine, Vessel } from "@/lib/ferry/types";
import { tr, intlLocale } from "@/lib/i18n";

export function routeLabel(route: RouteLine, ports: Port[]) {
  const from = ports.find((p) => p.id === route.departure_port_id)?.name ?? "?";
  const to = ports.find((p) => p.id === route.arrival_port_id)?.name ?? "?";
  return `${from} → ${to}`;
}

/** Fiche navire (photo réelle, caractéristiques, lignes) : page Navires et dossiers du guide. */
export function VesselCard({ vessel, routes, ports }: { vessel: Vessel; routes: RouteLine[]; ports: Port[] }) {
  const photo = useQuery(vesselPhotoQuery(vessel)).data;
  const [failed, setFailed] = useState(false);
  const year = new Date().getFullYear();
  const dossier = vesselDossiers.find((d) => d.name.toLowerCase() === vessel.name.toLowerCase());
  const stats = [
    { icon: CalendarDays, label: tr("ui.vesselCard.age"), value: vessel.build_year && vessel.build_year <= year ? `${year - vessel.build_year} ans` : null },
    { icon: Users, label: tr("ui.vesselCard.passagers"), value: vessel.passenger_capacity?.toLocaleString(intlLocale()) },
    { icon: CarFront, label: tr("ui.vesselCard.vehicules"), value: vessel.car_capacity?.toLocaleString(intlLocale()) },
    { icon: Ruler, label: tr("ui.vesselCard.longueur"), value: vessel.length_meters ? `${vessel.length_meters} m` : null },
    { icon: Gauge, label: tr("ui.vesselCard.vitesse"), value: vessel.speed_knots ? `${Math.round(vessel.speed_knots * 1.852)} km/h` : null },
    { icon: BedDouble, label: tr("ui.vesselCard.cabines"), value: vessel.cabin_capacity?.toLocaleString(intlLocale()) },
    { icon: Scale, label: tr("ui.vesselCard.jaugeBrute"), value: vessel.gross_tonnage ? `${vessel.gross_tonnage.toLocaleString(intlLocale())} t` : null },
    { icon: MoveHorizontal, label: tr("ui.vesselCard.largeur"), value: vessel.beam_meters ? `${vessel.beam_meters.toLocaleString(intlLocale())} m` : null },
    { icon: Layers, label: tr("ui.vesselCard.ponts"), value: vessel.deck_count?.toLocaleString(intlLocale()) },
  ].filter((s) => s.value);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border bg-background shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[16/9] overflow-hidden bg-white">
        {photo?.url && !failed ? (
          <img
            src={photo.url}
            alt={vessel.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain p-2 transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Ship size={40} aria-hidden />
          </div>
        )}
        <VesselPhotoBadge vesselId={vessel.id} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-lg font-bold">
          {vessel.name} <VesselAlertTag vesselId={vessel.id} />
        </h3>
        {stats.length ? (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg bg-muted/60 px-2 py-1.5">
                <dt className="flex items-center gap-1 text-[10px] text-muted-foreground max-sm:text-xs">
                  <s.icon size={13} className="text-primary" aria-hidden /> {s.label}
                </dt>
                <dd className="font-bold">{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {routes.length ? (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {routes.map((r) => (
              <li key={r.id}>⚓ {routeLabel(r, ports)}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-3 pt-4 text-sm font-semibold">
          <Link to="/" search={{ select: "vessel", id: vessel.id } as never} className="inline-flex items-center gap-1 text-primary">
            {tr("ui.vesselCard.voirSurLaCarte")}<ArrowRight size={14} />
          </Link>
          {dossier || vessel.status === "active" ? (
            <Link
              to="/bateaux/$slug"
              params={{ slug: dossier?.slug ?? vessel.slug }}
              className="text-muted-foreground hover:text-primary"
            >
              {dossier ? tr("ui.vesselCard.dossierComplet") : tr("ui.vesselCard.ficheNavire")}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
