import { BadgeCheck, MessageCircleQuestion } from "lucide-react";
import type { Port, Vessel } from "@/lib/ferry/types";
import { VesselThumb } from "./LineOverview";

/**
 * La fenêtre « à bord » en image plutôt qu'en phrases : le vrai rendu du navire sur la mer, la 504
 * au premier plan (avec un « ? » tant qu'on demande, une coche une fois à bord), puis le trajet
 * avec son avancement quand il est connu.
 */
export function AboardScene({
  vessel,
  from,
  to,
  percent,
  aboard,
  atQuay = false,
  verified,
}: {
  vessel: Pick<Vessel, "id" | "name" | "photo_url"> | null;
  from: Port | null;
  to: Port | null;
  percent: number | null;
  aboard: boolean;
  /** « Encore à quai » : le navire ne tangue pas, l'avancement n'est pas affiché. */
  atQuay?: boolean;
  verified: boolean;
}) {
  return (
    <div className="bw-aboard-scene" data-quay={atQuay || undefined} aria-hidden>
      <div className="bw-aboard-scene__sea">
        <span className="bw-aboard-scene__ship">
          <VesselThumb vessel={vessel} width={168} towardRight />
        </span>
        <span className="bw-aboard-scene__waves" />
        <span className="bw-aboard-scene__car">
          <img src="/cabas/persos/voiture_504.webp" alt="" width={74} height={74} />
          <i data-state={verified ? "verified" : aboard ? "aboard" : "ask"}>
            {aboard ? <BadgeCheck size={16} /> : <MessageCircleQuestion size={16} />}
          </i>
        </span>
      </div>
      {from && to ? (
        <div className="bw-aboard-scene__route">
          <b>{from.name}</b>
          <span className="bw-aboard-scene__track">
            <span style={{ width: `${atQuay ? 0 : (percent ?? 0)}%` }} />
            {percent !== null && !atQuay ? (
              <em style={{ left: `${percent}%` }}>{percent} %</em>
            ) : null}
          </span>
          <b>{to.name}</b>
        </div>
      ) : null}
    </div>
  );
}
