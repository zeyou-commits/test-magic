import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  Award,
  CheckCheck,
  Heart,
  LoaderCircle,
  Megaphone,
  Ship,
  Waves,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { OPEN_PROFILE_EVENT, publicProfileQuery } from "@/lib/community/travellers";
import { TravellerAvatar } from "./TravellerAvatar";
import { tr } from "@/lib/i18n";

/**
 * Profil public d'un voyageur, ouvert depuis un avatar n'importe où sur le site.
 * Indicateurs cumulés seulement : jamais de dates de voyage ni d'information d'identité.
 */
export function ProfileHost() {
  const [handle, setHandle] = useState<string | null>(null);
  useEffect(() => {
    const open = (event: Event) =>
      setHandle((event as CustomEvent<{ handle: string }>).detail?.handle ?? null);
    window.addEventListener(OPEN_PROFILE_EVENT, open);
    return () => window.removeEventListener(OPEN_PROFILE_EVENT, open);
  }, []);
  const profile = useQuery(publicProfileQuery(handle));
  const data = profile.data;
  return (
    <Dialog open={Boolean(handle)} onOpenChange={(open) => !open && setHandle(null)}>
      <DialogContent className="bw-profile-dialog">
        {profile.isPending ? (
          <p className="bw-profile__loading" role="status">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />{tr("ui.profileHost.chargementDuProfil")}
          </p>
        ) : !data ? (
          <>
            <DialogTitle>{tr("ui.profileHost.profilIndisponible")}</DialogTitle>
            <DialogDescription>
              {tr("ui.profileHost.ceProfilNExistePlus")}
            </DialogDescription>
          </>
        ) : (
          <div className="bw-profile">
            <div className="bw-profile__head">
              <TravellerAvatar card={data} size={84} moodLabel static />
              <DialogTitle className="bw-profile__name">{data.pseudo}</DialogTitle>
              <DialogDescription>
                {tr("ui.profileHost.voyageurSeBledway")}{data.since ? ` depuis ${data.since}` : ""}
                {data.me ? tr("ui.profileHost.cEstVous") : ""}
              </DialogDescription>
            </div>
            <dl className="bw-profile__stats">
              <div>
                <dt>
                  <Megaphone size={14} aria-hidden />{tr("ui.profileHost.contributions")}
                </dt>
                <dd>{data.contributions}</dd>
              </div>
              <div>
                <dt>
                  <CheckCheck size={14} aria-hidden />{tr("ui.profileHost.confirmees")}
                </dt>
                <dd>{data.confirmed}</dd>
              </div>
              <div>
                <dt>
                  <Heart size={14} aria-hidden />{tr("ui.profileHost.mercis")}
                </dt>
                <dd>{data.thanks ?? 0}</dd>
              </div>
              <div>
                <dt>
                  <Waves size={14} aria-hidden />{tr("ui.profileHost.traversees")}
                </dt>
                <dd>{data.trips}</dd>
              </div>
            </dl>
            {data.favorite_vessel || data.favorite_port ? (
              <ul className="bw-profile__favs">
                {data.favorite_vessel ? (
                  <li>
                    <Ship size={15} aria-hidden />{tr("ui.profileHost.navirePrefere")}{" "}
                    <strong>{data.favorite_vessel}</strong>
                  </li>
                ) : null}
                {data.favorite_port ? (
                  <li>
                    <Anchor size={15} aria-hidden />{tr("ui.profileHost.portPrefere")}{" "}
                    <strong>{data.favorite_port}</strong>
                  </li>
                ) : null}
              </ul>
            ) : null}
            {data.badges.length ? (
              <div className="bw-profile__badges" aria-label={tr("ui.profileHost.badges")}>
                {data.badges.map((badge) => (
                  <span key={badge.code}>
                    <Award size={13} aria-hidden /> {badge.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="bw-profile__empty">
                {tr("ui.profileHost.lesBadgesArriventAvecLes")}
              </p>
            )}
            {data.confirmations ? (
              <p className="bw-profile__note">
                {tr("ui.profileHost.aConfirme")}{data.confirmations}{tr("ui.profileHost.info")}{data.confirmations > 1 ? "s" : ""}{tr("ui.profileHost.dAutresVoyageurs")}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
