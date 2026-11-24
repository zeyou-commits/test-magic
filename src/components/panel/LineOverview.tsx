import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock3, Ship, Building2 } from "lucide-react";
import { formatDuration } from "@/lib/ferry/format";
import type { LineStats } from "@/lib/ferry/lineStats";
import { portPhotoQuery, vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import { vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import type { Port, Selection, Vessel } from "@/lib/ferry/types";
import { CompanyBadge } from "./CompanyBadge";
import { MiniFerry } from "./MiniFerry";
import { tr, intlLocale } from "@/lib/i18n";

/** « 22 h » ou « 22 h à 30 h » : seulement des durées publiées. */
export const durationRange = (min: number | null, max: number | null) =>
  min === null
    ? null
    : max === null || max === min
      ? formatDuration(min)
      : `${formatDuration(min)} à ${formatDuration(max)}`;

/**
 * Le vrai visuel du navire : son rendu détouré (carte) s'il existe, sinon sa photo (celle de sa fiche),
 * et le petit ferry dessiné du site seulement quand aucune image n'existe.
 */
export function VesselThumb({
  vessel,
  width = 64,
  towardRight = false,
}: {
  vessel: Pick<Vessel, "id" | "name" | "photo_url"> | null | undefined;
  width?: number;
  /** Les rendus regardent à gauche : on les retourne quand le trajet va vers la droite. */
  towardRight?: boolean;
}) {
  const slug = vessel ? vesselMapIcon(vessel.name) : null;
  const photo = useQuery({
    ...vesselPhotoQuery(vessel ?? { id: "", name: "", photo_url: null }),
    enabled: Boolean(vessel && !slug),
  }).data;
  if (slug)
    return (
      <img
        src={`/vessel-visuals/map/${slug}.webp`}
        alt=""
        width={width}
        height={Math.round(width * 0.5)}
        loading="lazy"
        decoding="async"
        className="bw-line-vessel-img"
        style={towardRight ? { transform: "scaleX(-1)" } : undefined}
      />
    );
  if (photo?.url)
    return (
      <img
        src={photo.url}
        alt=""
        width={width}
        height={Math.round(width * 0.56)}
        loading="lazy"
        decoding="async"
        className="bw-line-vessel-img bw-line-vessel-photo"
        style={{ width, height: Math.round(width * 0.56) }}
      />
    );
  return <MiniFerry size={width} />;
}

function PortDisc({ port, onSelect }: { port: Port; onSelect: (selection: Selection) => void }) {
  const photo = useQuery(portPhotoQuery(port)).data ?? null;
  return (
    <button
      type="button"
      className="bw-line-port"
      onClick={() => onSelect({ type: "port", id: port.id })}
      aria-label={`Ouvrir la fiche du port de ${port.name}`}
    >
      <span className="bw-line-port__disc" title={photo?.credit ?? undefined}>
        {photo?.url ? (
          <img src={photo.url} alt="" loading="lazy" decoding="async" />
        ) : (
          <b aria-hidden>{port.name.slice(0, 1)}</b>
        )}
      </span>
      <strong>{port.name}</strong>
      <small>{port.country_name}</small>
    </button>
  );
}

/** Le trajet en image : les deux ports en médaillon, reliés par la mer, et le navire entre les deux. */
export function LineHero({
  from,
  to,
  typicalMinutes,
  distanceKm,
  vessel,
  onSelect,
}: {
  from: Port;
  to: Port;
  typicalMinutes: number | null;
  distanceKm: number | null;
  vessel: Vessel | null;
  onSelect: (selection: Selection) => void;
}) {
  const facts = [
    typicalMinutes ? `≈ ${formatDuration(typicalMinutes)}` : null,
    distanceKm ? `${distanceKm} km` : null,
  ].filter(Boolean);
  return (
    <div className="bw-line-hero">
      <PortDisc port={from} onSelect={onSelect} />
      <div className="bw-line-hero__sea" aria-hidden>
        <svg viewBox="0 0 200 40" preserveAspectRatio="none">
          <path d="M2 30 Q100 2 198 30" />
        </svg>
        <span className="bw-line-hero__ship">
          <VesselThumb vessel={vessel} width={66} towardRight />
        </span>
        {facts.length ? <span className="bw-line-hero__facts">{facts.join(" · ")}</span> : null}
      </div>
      <PortDisc port={to} onSelect={onSelect} />
    </div>
  );
}

/** Les chiffres de la ligne : une tuile n'apparaît que si sa donnée existe. */
export function LineFigures({ stats, timeZone }: { stats: LineStats; timeZone: string }) {
  const tiles: {
    key: string;
    icon: React.ReactNode;
    value: string;
    label: string;
    extra?: React.ReactNode;
  }[] = [];
  if (stats.upcoming > 0)
    tiles.push({
      key: "upcoming",
      icon: <CalendarClock size={16} />,
      value: String(stats.upcoming),
      label: stats.upcoming > 1 ? "traversées programmées" : "traversée programmée",
      extra: stats.lastAt ? (
        <small>
          {tr("ui.lineOverview.jusquAu")}{" "}
          {new Date(stats.lastAt).toLocaleDateString(intlLocale(), {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone,
          })}
        </small>
      ) : null,
    });
  if (stats.nextWeek > 0)
    tiles.push({
      key: "week",
      icon: <Clock3 size={16} />,
      value: String(stats.nextWeek),
      label: stats.nextWeek > 1 ? "départs dans les 7 jours" : "départ dans les 7 jours",
    });
  if (stats.operators.length)
    tiles.push({
      key: "companies",
      icon: <Building2 size={16} />,
      value: String(stats.operators.length),
      label: stats.operators.length > 1 ? "compagnies" : "compagnie",
      extra: (
        <span className="bw-line-tile__logos">
          {stats.operators.slice(0, 4).map((item) => (
            <CompanyBadge
              key={item.company.id}
              name={item.company.name}
              logoUrl={item.company.logo_url}
              size={16}
            />
          ))}
        </span>
      ),
    });
  if (stats.vessels.length)
    tiles.push({
      key: "vessels",
      icon: <Ship size={16} />,
      value: String(stats.vessels.length),
      label: stats.vessels.length > 1 ? "navires" : "navire",
      extra: (
        <small className="truncate">{stats.vessels.map((vessel) => vessel.name).join(", ")}</small>
      ),
    });
  if (!tiles.length) return null;
  return (
    <ul className="bw-line-tiles" aria-label={tr("ui.lineOverview.laLigneEnChiffres")}>
      {tiles.map((tile) => (
        <li key={tile.key} className="bw-line-tile">
          <span className="bw-line-tile__icon" aria-hidden>
            {tile.icon}
          </span>
          <b>{tile.value}</b>
          <span>{tile.label}</span>
          {tile.extra}
        </li>
      ))}
    </ul>
  );
}
