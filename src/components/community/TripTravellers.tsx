import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Smile } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { tripTravellersQuery } from "@/lib/community/travellers";
import { MoodPicker } from "./MoodPicker";
import { TravellerAvatar } from "./TravellerAvatar";

const SHOWN = 7;

/**
 * « Sur cette traversée » : les cabas des voyageurs (ceux qui l'acceptent) avec leur humeur.
 * Le voyageur lui-même y choisit son humeur, suggérée selon le moment du voyage.
 */
export function TripTravellers({
  departureId,
  departureAt,
  arrivalAt,
}: {
  departureId: string;
  departureAt: string;
  arrivalAt: string | null;
}) {
  const { user } = useAuth();
  const data = useQuery(tripTravellersQuery(departureId, user?.id)).data;
  const [picking, setPicking] = useState(false);
  if (!data || !data.total) return null;
  const me = data.travellers.find((traveller) => traveller.me);
  const now = Date.now();
  const moment =
    me?.step ??
    (now < Date.parse(departureAt)
      ? "avant"
      : arrivalAt && now > Date.parse(arrivalAt)
        ? "arrived"
        : "onboard");
  const shown = data.travellers.slice(0, SHOWN);
  const more = data.total - shown.length;
  return (
    <section className="bw-trip-people" aria-label="Voyageurs de cette traversée">
      <div className="bw-trip-people__head">
        <strong>
          {data.total} voyageur{data.total > 1 ? "s" : ""} sur cette traversée
        </strong>
        {me ? (
          <button type="button" onClick={() => setPicking(true)}>
            <Smile size={14} aria-hidden /> {me.mood ? "Mon humeur" : "Partager mon humeur"}
          </button>
        ) : null}
      </div>
      <div className="bw-trip-people__row">
        {shown.map((traveller) => (
          <span
            key={traveller.handle}
            className="bw-trip-people__item"
            data-me={traveller.me || undefined}
          >
            <TravellerAvatar card={traveller} size={40} />
            <small>{traveller.me ? "Vous" : traveller.pseudo}</small>
          </span>
        ))}
        {more > 0 ? (
          <span
            className="bw-trip-people__more"
            title="Voyageurs qui préfèrent rester discrets ou non affichés"
          >
            +{more}
          </span>
        ) : null}
      </div>
      {me ? (
        <MoodPicker
          open={picking}
          onOpenChange={setPicking}
          moment={moment}
          current={me.mood?.code ?? null}
        />
      ) : null}
    </section>
  );
}
