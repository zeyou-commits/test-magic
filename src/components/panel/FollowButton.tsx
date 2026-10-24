import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, LoaderCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;
import { useTravelAction } from "@/hooks/useTravelAction";

export function FollowButton({
  kind,
  targetId,
  compact = false,
  iconOnly = false,
  label,
  demo = false,
}: {
  kind: "vessel" | "departure";
  targetId: string;
  compact?: boolean;
  iconOnly?: boolean;
  label?: string;
  demo?: boolean;
}) {
  const { user } = useAuth();
  const request = useTravelAction();
  const queryClient = useQueryClient();
  const queryKey = ["follow", user?.id, kind, targetId];
  const {
    data: follow,
    error,
    isPending,
  } = useQuery({
    queryKey,
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error: issue } = await supabase
        .from("bw_follows")
        .select("id,active")
        .eq("user_id", user!.id)
        .eq("target_kind", kind)
        .eq("target_id", targetId)
        .maybeSingle();
      if (issue) throw issue;
      return data;
    },
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function toggle() {
    setMessage("");
    if (demo) {
      setMessage(
        "Ce bateau de démonstration ne déclenche aucune notification. Choisissez un bateau publié pour le suivre.",
      );
      return;
    }
    if (!follow?.active || !user) {
      request({
        type: "follow",
        kind,
        targetId,
        label: label ?? (kind === "vessel" ? "Votre bateau" : "Votre traversée"),
      });
      return;
    }
    setBusy(true);
    try {
      const { error: issue } = await supabase
        .from("bw_follows")
        .update({ active: false })
        .eq("id", follow.id);
      if (issue) throw issue;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["my-follows", user.id] }),
      ]);
    } catch {
      setMessage("Le suivi n’a pas pu être mis à jour. Réessayez.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className={`relative inline-flex flex-col gap-1 ${compact ? "items-start" : "w-full"}`}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void toggle();
        }}
        disabled={busy || Boolean(user && isPending)}
        aria-pressed={Boolean(follow?.active)}
        aria-label={
          iconOnly
            ? `${follow?.active ? "Ne plus suivre" : "Suivre"} ${label ?? (kind === "vessel" ? "ce bateau" : "cette traversée")}`
            : undefined
        }
        title={iconOnly ? (follow?.active ? "Suivi activé" : "Suivre ce bateau") : undefined}
        className={`inline-flex ${iconOnly ? "size-8 rounded-full !min-h-8 !gap-0 !px-0" : "min-h-10"} items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${follow?.active ? "border-primary/30 bg-primary/10 text-primary" : "border-primary/25 bg-primary/5 text-primary hover:bg-primary/10"}`}
      >
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Heart className={`size-4 ${follow?.active ? "fill-current" : ""}`} aria-hidden />
        )}
        {iconOnly
          ? null
          : follow?.active
            ? "Suivi activé"
            : compact
              ? "Suivre"
              : kind === "vessel"
                ? "Suivre ce bateau"
                : "Suivre cette traversée"}
      </button>
      {(message || error) && (
        <span
          role="status"
          className={
            iconOnly
              ? "absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border bg-background p-3 text-[11px] shadow-lg"
              : "max-w-sm text-[11px] leading-snug text-muted-foreground"
          }
        >
          {message || "Vos suivis sont momentanément indisponibles."}
        </span>
      )}
    </span>
  );
}
