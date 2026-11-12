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
import { tr } from "@/lib/i18n";

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
          aria-label={tr("ui.tripShare.partagerCetteTraverseeEtSon")}
          title={tr("ui.tripShare.partagerLeSuivi")}
        >
          <Share2 size={17} aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="bw-trip-share-dialog">
        <DialogHeader>
          <DialogTitle>{tr("ui.tripShare.partagerLeSuiviDeLa")}</DialogTitle>
          <DialogDescription>
            {tr("ui.tripShare.votreProchePourraConsulterL")}
          </DialogDescription>
        </DialogHeader>
        <p className="font-semibold">
          {from} → {to}
        </p>
        <p className="text-sm text-muted-foreground">
          {tr("ui.tripShare.leLienOuvreToujoursCette")}
        </p>
        <ShareButtons
          label={tr("ui.tripShare.envoyerLeSuiviAUn")}
          title={`${from} → ${to} · suivi BledWay`}
          text={tripShareText(from, to, departureAt, timeZone)}
          getUrl={() => tripShareUrl(window.location.href, departureId)}
        />
      </DialogContent>
    </Dialog>
  );
}
