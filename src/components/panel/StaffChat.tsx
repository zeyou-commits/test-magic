import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, EyeOff, Shield, UserX, VolumeX } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { TravellerCard } from "@/lib/community/travellers";
import { chatRefusal } from "@/lib/ferry/portPassage";
import { tr } from "@/lib/i18n";

const supabase = typedSupabase as unknown as SupabaseClient;

/** L'auteur d'un message : un voyageur, un membre de l'équipe, ou le compte officiel BledWay. */
export type ChatAuthor = TravellerCard & {
  role?: "admin" | "moderator" | null;
  official?: boolean;
};

/** Le repère officiel à côté du nom : on sait tout de suite qui parle pour BledWay. */
export function StaffBadge({ author }: { author: ChatAuthor }) {
  if (author.official)
    return (
      <span className="bw-staff-badge" data-kind="official" title={tr("ui.staffChat.messageOfficielDeBledway")}>
        <BadgeCheck size={12} aria-hidden />{tr("ui.staffChat.officiel")}
      </span>
    );
  if (author.role === "admin")
    return (
      <span className="bw-staff-badge" data-kind="admin" title={tr("ui.staffChat.membreDeLEquipeBledway")}>
        <Shield size={11} aria-hidden />{tr("ui.staffChat.equipeBledway")}
      </span>
    );
  if (author.role === "moderator")
    return (
      <span className="bw-staff-badge" data-kind="moderator" title={tr("ui.staffChat.moderateurBledway")}>
        <Shield size={11} aria-hidden />{tr("ui.staffChat.moderateur")}
      </span>
    );
  return null;
}

export function AuthorAvatar({ author, size }: { author: ChatAuthor; size: number }) {
  if (author.official)
    return (
      <img
        className="bw-official-avatar"
        src="/pwa-icon-192.png"
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  return <TravellerAvatar card={author} size={size} mood={false} />;
}

/** Les décisions de l'équipe sur un message, appliquées en direct à tous les présents. */
export function StaffTools({ id, author }: { id: string; author: ChatAuthor }) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState<1 | 7 | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: ["bw-chat"] });
  const hide = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("bw_chat_set_hidden", { p_message: id, p_hidden: true });
      if (error) throw new Error("Message non masqué. Réessayez.");
    },
    onSuccess: refresh,
  });
  const sanction = useMutation({
    mutationFn: async (days: 1 | 7) => {
      const { data, error } = await supabase.rpc("bw_chat_sanction", {
        p_message: id,
        p_days: days,
      });
      if (error) throw new Error("Action impossible pour le moment. Réessayez.");
      const result = data as { ok: boolean; refused?: string };
      if (!result.ok) throw new Error(chatRefusal(result.refused ?? ""));
    },
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
  });
  const busy = hide.isPending || sanction.isPending;
  const problem = hide.error ?? sanction.error;
  // L'équipe ne se sanctionne pas entre elle depuis un salon.
  const sanctionable = !author.official && !author.role;
  return (
    <div className="bw-staff-tools">
      <button type="button" disabled={busy} onClick={() => hide.mutate()}>
        <EyeOff size={13} aria-hidden />{tr("ui.staffChat.masquer")}
      </button>
      {sanctionable ? (
        confirm ? (
          <span className="bw-staff-tools__confirm">
            {confirm === 1
              ? `${author.pseudo} ne pourra plus écrire pendant 24 h.`
              : `${author.pseudo} est exclu 7 jours et ses messages des dernières 24 h ici sont retirés.`}
            <button type="button" disabled={busy} onClick={() => sanction.mutate(confirm)}>
              {tr("ui.staffChat.confirmer")}
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              {tr("ui.staffChat.annuler")}
            </button>
          </span>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => setConfirm(1)}>
              <VolumeX size={13} aria-hidden />{tr("ui.staffChat.muet24H")}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirm(7)}>
              <UserX size={13} aria-hidden />{tr("ui.staffChat.exclure7J")}
            </button>
          </>
        )
      ) : null}
      {problem ? (
        <span role="alert" className="bw-staff-tools__error">
          {problem.message}
        </span>
      ) : null}
    </div>
  );
}
