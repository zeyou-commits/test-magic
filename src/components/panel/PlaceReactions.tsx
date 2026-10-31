import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Fonctions du script du 22/11/2026, absentes des types générés.
const db = typedSupabase as unknown as SupabaseClient;

export type PlaceKind = "vessel" | "company" | "port";
export const placeReactions = [
  { code: "like", emoji: "👍", label: "J’aime" },
  { code: "love", emoji: "❤️", label: "J’adore" },
  { code: "haha", emoji: "😂", label: "Haha" },
  { code: "wow", emoji: "😮", label: "Waouh" },
  { code: "sad", emoji: "😢", label: "Triste" },
  { code: "angry", emoji: "😡", label: "Grrr" },
] as const;
type Counts = { counts: Record<string, number>; mine: string | null };

const LONG_PRESS_MS = 400;

/** Un coup de cœur en un geste, distinct d'un avis ou d'un suivi. Appui long : le choix de la réaction. */
export function PlaceReactions({ kind, target }: { kind: PlaceKind; target: string }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ["place-reactions", kind, target, user?.id ?? "public"];
  const { data } = useQuery({
    queryKey: key,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<Counts | null> => {
      const { data, error } = await db.rpc("bw_place_reaction_counts", {
        p_kind: kind,
        p_target: target,
      });
      // Script pas encore exécuté : le bouton reste masqué, sans erreur.
      if (error) return null;
      return data as Counts;
    },
  });
  const [tray, setTray] = useState(false);
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const react = useMutation({
    mutationFn: async (code: string | null) => {
      const { error } = await db.rpc("bw_place_react", {
        p_kind: kind,
        p_target: target,
        p_code: code,
      });
      if (error) throw new Error("Votre réaction n’a pas pu être enregistrée.");
    },
    onSettled: () => void client.invalidateQueries({ queryKey: key }),
    onError: (error: Error) => toast.error(error.message),
  });
  if (!data) return null;
  const choose = (code: string | null) => {
    setTray(false);
    if (!user) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/auth?next=${encodeURIComponent(next)}`);
      return;
    }
    client.setQueryData<Counts>(key, (current) => {
      if (!current) return current;
      const counts = { ...current.counts };
      if (current.mine) counts[current.mine] = Math.max(0, (counts[current.mine] ?? 1) - 1);
      if (code) counts[code] = (counts[code] ?? 0) + 1;
      return { counts, mine: code };
    });
    react.mutate(code);
  };
  const stopPress = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const mine = placeReactions.find((item) => item.code === data.mine);
  const top = placeReactions
    .filter((item) => (data.counts[item.code] ?? 0) > 0)
    .sort((a, b) => (data.counts[b.code] ?? 0) - (data.counts[a.code] ?? 0))
    .slice(0, 3);
  const total = Object.values(data.counts).reduce((sum, n) => sum + n, 0);
  return (
    <div
      className="bw-react"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setTray(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setTray(false);
      }}
    >
      {tray ? (
        <div className="bw-react__tray" role="group" aria-label="Choisir une réaction">
          {placeReactions.map((item) => (
            <button
              key={item.code}
              type="button"
              aria-label={item.label}
              aria-pressed={data.mine === item.code}
              title={item.label}
              onClick={() => choose(data.mine === item.code ? null : item.code)}
            >
              {item.emoji}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="bw-react__main"
        data-mine={mine?.code}
        aria-pressed={Boolean(mine)}
        aria-expanded={tray}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          longPressed.current = false;
          if (event.pointerType === "mouse") return;
          timer.current = window.setTimeout(() => {
            longPressed.current = true;
            setTray(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={stopPress}
        onPointerCancel={stopPress}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") setTray(true);
          if (event.key === "Escape") setTray(false);
        }}
        onClick={() => {
          if (longPressed.current) return;
          choose(mine ? null : "like");
        }}
      >
        <span aria-hidden>{mine?.emoji ?? "👍"}</span> {mine?.label ?? "J’aime"}
      </button>
      {total ? (
        <span className="bw-react__sum" aria-label={`${total} réaction${total > 1 ? "s" : ""}`}>
          <span aria-hidden>{top.map((item) => item.emoji).join("")}</span> {total}
        </span>
      ) : null}
    </div>
  );
}
