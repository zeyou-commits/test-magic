import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  ArrowLeft,
  Award,
  CheckCheck,
  Heart,
  LoaderCircle,
  Lock,
  Mail,
  Megaphone,
  Pencil,
  Ship,
  Waves,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DmRequest, PrivateMessages } from "@/components/panel/PrivateMessages";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { OPEN_PROFILE_EVENT, publicProfileQuery } from "@/lib/community/travellers";
import { dmInboxQuery } from "@/lib/ferry/privateMessages";
import { EditableAvatar, focusAvatarPicker } from "./EditableAvatar";
import { MyTravellerEditor } from "./MyTravellerEditor";
import { TravellerAvatar } from "./TravellerAvatar";
import { tr } from "@/lib/i18n";

const supabase = typedSupabase as unknown as SupabaseClient;

type Target = { handle: string; departureId: string | null };
type View = "profile" | "edit" | "dm-request" | "dm";

/** Une traversée où nous sommes tous les deux passagers (script du 07/01/2027) ; sinon rien. */
const dmWayQuery = (handle: string | null, userId: string | undefined) => ({
  queryKey: ["bw-dm-way", handle, userId ?? "anonyme"] as const,
  enabled: Boolean(handle && userId),
  retry: false,
  staleTime: 60_000,
  queryFn: async (): Promise<{ departure: string | null } | null> => {
    const { data, error } = await supabase.rpc("bw_dm_way", { p_handle: handle });
    return error ? null : (data as { departure: string | null });
  },
});

/**
 * Profil public d'un voyageur, ouvert depuis un avatar n'importe où sur le site.
 * Indicateurs cumulés seulement : jamais de dates de voyage ni d'information d'identité.
 * Sur sa propre fiche : modifier son profil et son avatar sur place. Sur celle d'un autre
 * passager de la même traversée : lui écrire en privé.
 */
export function ProfileHost() {
  const { user } = useAuth();
  const [target, setTarget] = useState<Target | null>(null);
  const [view, setView] = useState<View>("profile");
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<Partial<Target>>).detail;
      setTarget(
        detail?.handle ? { handle: detail.handle, departureId: detail.departureId ?? null } : null,
      );
      setView("profile");
    };
    window.addEventListener(OPEN_PROFILE_EVENT, open);
    return () => window.removeEventListener(OPEN_PROFILE_EVENT, open);
  }, []);
  const handle = target?.handle ?? null;
  const profile = useQuery(publicProfileQuery(handle));
  const data = profile.data;
  const other = Boolean(data && !data.me && user);
  const inbox = useQuery({ ...dmInboxQuery(user?.id), enabled: Boolean(user && other) }).data;
  const way = useQuery({
    ...dmWayQuery(handle, user?.id),
    enabled: Boolean(other && !target?.departureId),
  }).data;
  // Une conversation déjà ouverte avec cette personne : on y retourne plutôt que d'en redemander une.
  const thread = inbox?.find((item) => item.other.handle === handle) ?? null;
  const departureId = target?.departureId ?? way?.departure ?? null;
  const close = () => {
    setTarget(null);
    setView("profile");
  };
  const back = (
    <button type="button" className="bw-profile__back" onClick={() => setView("profile")}>
      <ArrowLeft size={16} aria-hidden />{tr("ui.profileHost.retourALaFiche")}
    </button>
  );
  return (
    <Dialog open={Boolean(handle)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="bw-profile-dialog" data-view={view}>
        {profile.isPending ? (
          <p className="bw-profile__loading" role="status">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            {tr("ui.profileHost.chargementDuProfil")}
          </p>
        ) : !data ? (
          <>
            <DialogTitle>{tr("ui.profileHost.profilIndisponible")}</DialogTitle>
            <DialogDescription>{tr("ui.profileHost.ceProfilNExistePlus")}</DialogDescription>
          </>
        ) : view === "edit" && data.me ? (
          <div className="bw-profile__panel">
            {back}
            <DialogTitle className="bw-profile__name">{tr("ui.profileHost.monProfilVoyageur")}</DialogTitle>
            <DialogDescription className="sr-only">
              {tr("ui.profileHost.avatarCouleurPseudoEtVisibilite")}
            </DialogDescription>
            <MyTravellerEditor />
          </div>
        ) : view === "dm-request" && departureId ? (
          <div className="bw-profile__panel bw-profile__panel--dm">
            <DialogTitle className="sr-only">{tr("ui.profileHost.messagePriveA")}{data.pseudo}</DialogTitle>
            <DialogDescription className="sr-only">
              {tr("ui.profileHost.uneDemandeAAccepterPuis")}
            </DialogDescription>
            <DmRequest
              departureId={departureId}
              card={data}
              onCancel={() => setView("profile")}
              onDone={() => setView("dm")}
            />
          </div>
        ) : view === "dm" ? (
          <div className="bw-profile__panel bw-profile__panel--dm">
            <DialogTitle className="sr-only">{tr("ui.profileHost.messagesPrives")}</DialogTitle>
            <DialogDescription className="sr-only">
              {tr("ui.profileHost.vosConversationsPriveesEntrePassagers")}
            </DialogDescription>
            <PrivateMessages
              key={thread?.id ?? "liste"}
              initialThread={thread?.id ?? null}
              onBack={() => setView("profile")}
            />
          </div>
        ) : (
          <div className="bw-profile">
            <div className="bw-profile__head">
              {data.me ? (
                // Comme sur les réseaux sociaux : on touche son avatar pour le changer.
                <EditableAvatar
                  onEdit={() => {
                    setView("edit");
                    focusAvatarPicker();
                  }}
                >
                  <TravellerAvatar card={data} size={84} moodLabel static />
                </EditableAvatar>
              ) : (
                <TravellerAvatar card={data} size={84} moodLabel static />
              )}
              <DialogTitle className="bw-profile__name">{data.pseudo}</DialogTitle>
              <DialogDescription>
                {tr("ui.profileHost.voyageurSeBledway")}
                {data.since ? ` depuis ${data.since}` : ""}
                {data.me ? tr("ui.profileHost.cEstVous") : ""}
              </DialogDescription>
              {data.me ? (
                <div className="bw-profile__actions">
                  <button type="button" data-primary onClick={() => setView("edit")}>
                    <Pencil size={15} aria-hidden />{tr("ui.profileHost.modifierMonProfil")}
                  </button>
                  <a href="/compte" onClick={close}>
                    {tr("ui.profileHost.monEspace")}
                  </a>
                </div>
              ) : other ? (
                <div className="bw-profile__actions">
                  {thread ? (
                    <button type="button" data-primary onClick={() => setView("dm")}>
                      <Mail size={15} aria-hidden />{tr("ui.profileHost.ouvrirLaConversation")}
                      {thread.unread ? <b>{thread.unread}</b> : null}
                    </button>
                  ) : departureId ? (
                    <button type="button" data-primary onClick={() => setView("dm-request")}>
                      <Mail size={15} aria-hidden />{tr("ui.profileHost.messagePrive")}
                    </button>
                  ) : (
                    <p className="bw-profile__hint">
                      <Lock size={13} aria-hidden />{tr("ui.profileHost.lesMessagesPrivesSOuvrent")}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <dl className="bw-profile__stats">
              <div>
                <dt>
                  <Megaphone size={14} aria-hidden />
                  {tr("ui.profileHost.contributions")}
                </dt>
                <dd>{data.contributions}</dd>
              </div>
              <div>
                <dt>
                  <CheckCheck size={14} aria-hidden />
                  {tr("ui.profileHost.confirmees")}
                </dt>
                <dd>{data.confirmed}</dd>
              </div>
              <div>
                <dt>
                  <Heart size={14} aria-hidden />
                  {tr("ui.profileHost.mercis")}
                </dt>
                <dd>{data.thanks ?? 0}</dd>
              </div>
              <div>
                <dt>
                  <Waves size={14} aria-hidden />
                  {tr("ui.profileHost.traversees")}
                </dt>
                <dd>{data.trips}</dd>
              </div>
            </dl>
            {data.favorite_vessel || data.favorite_port ? (
              <ul className="bw-profile__favs">
                {data.favorite_vessel ? (
                  <li>
                    <Ship size={15} aria-hidden />
                    {tr("ui.profileHost.navirePrefere")} <strong>{data.favorite_vessel}</strong>
                  </li>
                ) : null}
                {data.favorite_port ? (
                  <li>
                    <Anchor size={15} aria-hidden />
                    {tr("ui.profileHost.portPrefere")} <strong>{data.favorite_port}</strong>
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
              <p className="bw-profile__empty">{tr("ui.profileHost.lesBadgesArriventAvecLes")}</p>
            )}
            {data.confirmations ? (
              <p className="bw-profile__note">
                {tr("ui.profileHost.aConfirme")}
                {data.confirmations}
                {tr("ui.profileHost.info")}
                {data.confirmations > 1 ? "s" : ""}
                {tr("ui.profileHost.dAutresVoyageurs")}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
