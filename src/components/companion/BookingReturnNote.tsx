import { Bw504Button, Bw504Note } from "@/components/companion/Bw504Note";
import { useBookingReturn } from "@/lib/companion/bookingReturn";
import { tr } from "@/lib/i18n";

/** De retour du site d'une compagnie : la 504 propose d'ajouter le billet pour le suivi. */
export function BookingReturnNote({ className = "" }: { className?: string }) {
  const { back, dismiss } = useBookingReturn();
  if (!back) return null;
  return (
    <Bw504Note
      tone="win"
      className={className}
      // Site inconnu : « sur la compagnie » sonnait faux.
      title={
        back.site === "la compagnie"
          ? tr("ui.bookingReturnNote.tAsPrisTonBillet")
          : `T'as pris ton billet sur ${back.site} ?`
      }
      actions={
        <>
          <Bw504Button
            primary
            onClick={() => {
              dismiss();
              window.location.assign("/compte");
            }}
          >
            {tr("ui.bookingReturnNote.ouiJAjouteMonBillet")}
          </Bw504Button>
          <Bw504Button onClick={dismiss}>{tr("ui.bookingReturnNote.pasEncore")}</Bw504Button>
        </>
      }
    >
      {tr("ui.bookingReturnNote.ajouteLeJeGardeUn")}
    </Bw504Note>
  );
}
