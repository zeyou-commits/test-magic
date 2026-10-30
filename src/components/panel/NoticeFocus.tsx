import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bell, Clock, Megaphone, Ship, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { relativeAge } from "@/lib/ferry/flash";
import { noticeKind, type NoticeKind } from "@/lib/notifications/noticeStyle";

const supabase = typedSupabase as unknown as SupabaseClient;

export const noticeLook: Record<NoticeKind, { icon: LucideIcon; tone: string; label: string }> = {
  alert: { icon: TriangleAlert, tone: "critical", label: "Alerte" },
  warning: { icon: Clock, tone: "warning", label: "À vérifier" },
  trip: { icon: Ship, tone: "brand", label: "Votre traversée" },
  community: { icon: Megaphone, tone: "community", label: "Voyageurs" },
  info: { icon: Bell, tone: "official", label: "Information" },
};

/** Le message reçu, en tête de la fiche ouverte depuis une notification : rien n'est à rechercher. */
export function NoticeFocus({ noticeId }: { noticeId: string }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [closed, setClosed] = useState(false);
  const { data: notice } = useQuery({
    queryKey: ["notice-focus", noticeId, user?.id],
    enabled: Boolean(user),
    retry: false,
    queryFn: async () => {
      const { data } = await supabase
        .from("bw_notifications")
        .select("id,title,body,created_at,read_at,event_key")
        .eq("id", noticeId)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data as {
        id: string;
        title: string;
        body: string;
        created_at: string;
        read_at: string | null;
        event_key: string;
      } | null;
    },
  });
  useEffect(() => {
    if (!notice || notice.read_at || !user) return;
    void supabase
      .from("bw_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notice.id)
      .eq("user_id", user.id)
      .then(() => client.invalidateQueries({ queryKey: ["my-notifications", user.id] }));
  }, [notice, user, client]);
  if (!notice || closed) return null;
  const look = noticeLook[noticeKind(notice.event_key, notice.title)];
  const Icon = look.icon;
  return (
    <div className="bw-flash-row mb-3" data-tone={look.tone} data-open="true" role="status">
      <div className="bw-flash-row__head" role="presentation">
        <span className="bw-flash-row__icon" aria-hidden>
          <Icon size={15} />
        </span>
        <span className="bw-flash-row__text">
          <strong>{notice.title}</strong>
          <small>
            <span className="bw-flash-row__kind">{look.label}</span> ·{" "}
            {relativeAge(notice.created_at)}
          </small>
        </span>
        <button type="button" aria-label="Masquer ce message" onClick={() => setClosed(true)}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="bw-flash-row__body">
        <p>{notice.body}</p>
      </div>
    </div>
  );
}
