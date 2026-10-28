import { Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { tripShareText, tripShareUrl } from "@/lib/ferry/tripShare";
import { ShareButtons } from "./ShareButtons";

export function TripShare({
  departureId,
  from,
  to,
  departureAt,
  timeZone,
}: {
  departureId: string;
  from: string;
  to: string;
  departureAt: string;
  timeZone: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="bw-trip-share-trigger"
          aria-label="Partager cette traversée et son suivi"
          title="Partager le suivi"
        >
          <Share2 size={17} aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="bw-trip-share-dialog">
        <DialogHeader>
          <DialogTitle>Partager le suivi de la traversée</DialogTitle>
          <DialogDescription>
            Votre proche pourra consulter l’avancement et les informations publiques sans se
            connecter.
          </DialogDescription>
        </DialogHeader>
        <p className="font-semibold">
          {from} → {to}
        </p>
        <p className="text-sm text-muted-foreground">
          Le lien ouvre toujours cette traversée. Il ne contient ni votre profil, ni vos préparatifs
          personnels.
        </p>
        <ShareButtons
          label="Envoyer le suivi à un proche"
          title={`${from} → ${to} · suivi BledWay`}
          text={tripShareText(from, to, departureAt, timeZone)}
          getUrl={() => tripShareUrl(window.location.href, departureId)}
        />
      </DialogContent>
    </Dialog>
  );
}
