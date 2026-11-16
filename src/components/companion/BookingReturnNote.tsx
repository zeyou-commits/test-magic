import { Bw504Button, Bw504Note } from "@/components/companion/Bw504Note";
import { useBookingReturn } from "@/lib/companion/bookingReturn";

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
          ? "T'as pris ton billet ?"
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
            Oui, j'ajoute mon billet
          </Bw504Button>
          <Bw504Button onClick={dismiss}>Pas encore</Bw504Button>
        </>
      }
    >
      Ajoute-le : je garde un œil sur ton navire et, avec les notifications, je te préviens d'un
      retard signalé.
    </Bw504Note>
  );
}
