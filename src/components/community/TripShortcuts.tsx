import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { tripTravellersQuery } from "@/lib/community/travellers";
import { enterRoom } from "@/lib/ferry/chat";
import { FLASH_SELECT_EVENT } from "@/components/panel/FlashCenter";
import { TravellerAvatar } from "./TravellerAvatar";
import { tr } from "@/lib/i18n";

/**
 * Sur la fiche d'un passager ouverte depuis une traversée (carte, salon, liste à bord) : le salon
 * de cette traversée en un toucher, et les autres voyageurs visibles à bord, qu'on ouvre à leur tour.
 * Seuls ceux qui acceptent d'apparaître (bw_trip_travellers).
 */
export function TripShortcuts({
  departureId,
  handle,
  onRoom,
  onOpen,
}: {
  departureId: string;
  /** Le passager de la fiche : il n'est pas répété dans la liste. */
  handle: string;
  onRoom: () => void;
  onOpen: (handle: string) => void;
}) {
  const { user } = useAuth();
  const list = useQuery(tripTravellersQuery(departureId, user?.id));
  const others = (list.data?.travellers ?? []).filter(
    (traveller) => traveller.step === "onboard" && traveller.handle !== handle,
  );
  const aboard = (list.data?.travellers ?? []).some(
    (traveller) => traveller.step === "onboard" && traveller.handle === handle,
  );
  return (
    <section className="bw-trip-shortcuts">
      <button
        type="button"
        className="bw-trip-shortcuts__room"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent(FLASH_SELECT_EVENT, { detail: { type: "departure", id: departureId } }),
          );
          enterRoom("crossing", departureId);
          onRoom();
        }}
      >
        <MessagesSquare size={17} aria-hidden />
        {tr("ui.tripShortcuts.salon")}
      </button>
      {others.length ? (
        <>
          <h3>
            {tr("ui.tripShortcuts.aussiABord")} · {others.length}
          </h3>
          <ul>
            {others.map((traveller) => (
              <li key={traveller.handle}>
                <button type="button" onClick={() => onOpen(traveller.handle)}>
                  <TravellerAvatar card={traveller} size={48} static />
                  <span>{traveller.me ? tr("ui.tripShortcuts.vous") : traveller.pseudo}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : aboard && list.isSuccess ? (
        <p>{tr("ui.tripShortcuts.seulABord")}</p>
      ) : null}
    </section>
  );
}
