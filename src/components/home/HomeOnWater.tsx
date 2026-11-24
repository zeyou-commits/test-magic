import { useQuery } from "@tanstack/react-query";
import { Anchor, ArrowRight, Ship } from "lucide-react";
import type { FleetShip } from "@/lib/ferry/fleet";
import type { Vessel } from "@/lib/ferry/types";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import { vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import { tr } from "@/lib/i18n";

type VesselRef = Pick<Vessel, "id" | "name" | "photo_url">;

/**
 * Le navire tel qu'il apparaît sur la carte : son rendu détouré (fond transparent, jamais rogné).
 * Sans rendu, la vraie photo de sa fiche (ou de Commons), sinon l'icône.
 */
function ShipPhoto({
  vessel,
  name,
  atSea,
}: {
  vessel: VesselRef | undefined;
  name: string;
  atSea: boolean;
}) {
  const cutout = vesselMapIcon(name);
  const photo = useQuery({
    ...vesselPhotoQuery(vessel ?? { id: "", name: "", photo_url: null }),
    enabled: Boolean(vessel) && !cutout,
  }).data;
  if (cutout)
    return (
      <img
        src={`/vessel-visuals/map/${cutout}.webp`}
        alt=""
        width={60}
        height={40}
        loading="lazy"
        decoding="async"
        className="bw-on-water__cutout"
      />
    );
  if (photo?.url)
    return (
      <img
        src={photo.url}
        alt=""
        width={52}
        height={52}
        loading="lazy"
        decoding="async"
        className="bw-on-water__photo"
      />
    );
  return (
    <span className="bw-on-water__icon" data-sea={atSea || undefined} aria-hidden>
      {atSea ? <Ship size={19} /> : <Anchor size={19} />}
    </span>
  );
}

type Info = { dock: string; destination: string };

/**
 * Accueil PC, sur la carte : « Sur l'eau maintenant ». Jusqu'à deux navires en mer et un à quai,
 * pris dans la flotte de la carte (mêmes compteurs que le dock). La position dit sa source :
 * « position réelle » si le signal du navire est reçu, sinon « estimée » d'après l'horaire.
 */
export function HomeOnWater({
  atSea,
  docked,
  infoOf,
  vesselOf,
  onOpen,
  onLive,
  onHover,
}: {
  atSea: FleetShip[];
  docked: FleetShip[];
  infoOf: (ship: FleetShip) => Info;
  vesselOf: (ship: FleetShip) => VesselRef | undefined;
  onOpen: (ship: FleetShip) => void;
  onLive: () => void;
  /** Survol ou focus d'une carte : le navire est mis en avant sur la carte (null à la sortie). */
  onHover: (ship: FleetShip | null) => void;
}) {
  const sea = atSea.slice(0, docked.length ? 2 : 3);
  const ships = [...sea, ...docked.slice(0, 3 - sea.length)];
  if (!ships.length) return null;
  return (
    <div className="bw-on-water" role="region" aria-label={tr("ui.homeOnWater.surLEauMaintenant")}>
      <p className="bw-on-water__title">{tr("ui.homeOnWater.surLEauMaintenant")}</p>
      <div className="bw-on-water__row">
        {ships.map((ship) => {
          const info = infoOf(ship);
          const atSeaNow = ship.state === "sea";
          return (
            <button
              key={ship.id}
              type="button"
              className="bw-on-water__card"
              onClick={() => {
                onHover(null);
                onOpen(ship);
              }}
              onPointerEnter={() => onHover(ship)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(ship)}
              onBlur={() => onHover(null)}
            >
              <ShipPhoto vessel={vesselOf(ship)} name={ship.name} atSea={atSeaNow} />
              <span className="bw-on-water__text">
                <strong>{ship.name}</strong>
                <span>{atSeaNow ? `${info.dock} → ${info.destination}` : info.dock}</span>
              </span>
              <span className="bw-on-water__badge" data-sea={atSeaNow || undefined}>
                {atSeaNow
                  ? ship.source === "live"
                    ? tr("ui.homeOnWater.positionReelle")
                    : tr("ui.homeOnWater.positionEstimee")
                  : tr("ui.homeOnWater.aQuai")}
              </span>
            </button>
          );
        })}
        <button type="button" className="bw-on-water__live" onClick={onLive}>
          {tr("ui.homeOnWater.carteEnDirect")}
          <ArrowRight size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
