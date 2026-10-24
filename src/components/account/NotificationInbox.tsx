import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export function NotificationInbox({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const notices = useQuery({
    queryKey: ["my-notifications", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_notifications")
        .select("id,title,body,created_at,read_at,url")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
  async function markRead(id: string) {
    const { error } = await supabase
      .from("bw_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      toast.error("Impossible de marquer cette notification comme lue.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["my-notifications", userId] });
  }
  return (
    <section className="bw-account-section" aria-labelledby="my-inbox-title">
      <div className="bw-account-section-heading">
        <span className="bw-account-icon">
          <Bell className="size-5" />
        </span>
        <div>
          <h2 id="my-inbox-title">Le fil de mon voyage</h2>
          <p>Les informations utiles, conservées dans votre compte.</p>
        </div>
      </div>
      {notices.isPending ? (
        <div className="h-28 animate-pulse rounded-xl bg-secondary" />
      ) : notices.error ? (
        <p role="alert" className="text-sm text-destructive">
          Les notifications sont indisponibles.
          <button type="button" className="ml-2 underline" onClick={() => void notices.refetch()}>
            Réessayer
          </button>
        </p>
      ) : !notices.data.length ? (
        <p className="py-5 text-sm text-muted-foreground">
          Rien de nouveau pour le moment. Les prochaines informations sur vos suivis apparaîtront
          ici.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {notices.data.map((notice) => (
            <article
              key={notice.id}
              className={`py-4 ${notice.read_at ? "" : "border-l-2 border-l-primary pl-3"}`}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="text-sm font-semibold">{notice.title}</h3>
                <time className="text-[11px] text-muted-foreground">
                  {new Date(notice.created_at).toLocaleDateString("fr-FR")}
                </time>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{notice.body}</p>
              <div className="mt-2 flex flex-wrap gap-4">
                <a href={notice.url} className="text-xs font-semibold text-primary underline">
                  Voir les détails
                </a>
                {!notice.read_at && (
                  <button
                    type="button"
                    onClick={() => void markRead(notice.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                  >
                    <Check className="size-3.5" />
                    Marquer comme lu
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
