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
            <LoaderCircle className="size-5 animate-spin" aria-hidden /> Chargement du profil…
          </p>
        ) : !data ? (
          <>
            <DialogTitle>Profil indisponible</DialogTitle>
            <DialogDescription>
              Ce profil n’existe plus ou n’est pas encore activé.
            </DialogDescription>
          </>
        ) : (
          <div className="bw-profile">
            <div className="bw-profile__head">
              <TravellerAvatar card={data} size={84} moodLabel static />
              <DialogTitle className="bw-profile__name">{data.pseudo}</DialogTitle>
              <DialogDescription>
                Voyageur·se BledWay{data.since ? ` depuis ${data.since}` : ""}
                {data.me ? " · c’est vous" : ""}
              </DialogDescription>
            </div>
            <dl className="bw-profile__stats">
              <div>
                <dt>
                  <Megaphone size={14} aria-hidden /> Contributions
                </dt>
                <dd>{data.contributions}</dd>
              </div>
              <div>
                <dt>
                  <CheckCheck size={14} aria-hidden /> Confirmées
                </dt>
                <dd>{data.confirmed}</dd>
              </div>
              <div>
                <dt>
                  <Heart size={14} aria-hidden /> Mercis
                </dt>
                <dd>{data.thanks ?? 0}</dd>
              </div>
              <div>
                <dt>
                  <Waves size={14} aria-hidden /> Traversées
                </dt>
                <dd>{data.trips}</dd>
              </div>
            </dl>
            {data.favorite_vessel || data.favorite_port ? (
              <ul className="bw-profile__favs">
                {data.favorite_vessel ? (
                  <li>
                    <Ship size={15} aria-hidden /> Navire préféré{" "}
                    <strong>{data.favorite_vessel}</strong>
                  </li>
                ) : null}
                {data.favorite_port ? (
                  <li>
                    <Anchor size={15} aria-hidden /> Port préféré{" "}
                    <strong>{data.favorite_port}</strong>
                  </li>
                ) : null}
              </ul>
            ) : null}
            {data.badges.length ? (
              <div className="bw-profile__badges" aria-label="Badges">
                {data.badges.map((badge) => (
                  <span key={badge.code}>
                    <Award size={13} aria-hidden /> {badge.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="bw-profile__empty">
                Les badges arrivent avec les premières contributions : signaler, confirmer, donner
                son avis.
              </p>
            )}
            {data.confirmations ? (
              <p className="bw-profile__note">
                A confirmé {data.confirmations} info{data.confirmations > 1 ? "s" : ""} d’autres
                voyageurs.
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
