import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ModerationCard, ModerationSection, moderationEmpty, StatusFilter } from "./ModerationCard";

const db = supabase as unknown as SupabaseClient;
const whenFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

type Row = {
  id: string;
  route_code: string;
  kind: string;
  name: string;
  place: string;
  lat: number | null;
  lon: number | null;
  features: string[];
  direction: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decision_note: string | null;
  author: string | null;
};
type Filter = "pending" | "done";

/** Haltes proposées depuis la page « Routes du bled ». Rien n'est publié sans décision ici. */
export function RouteStopsModeration() {
  const { user, isAdmin } = useAuth();
  const [filter, setFilter] = useState<Filter>("pending");
  const list = useQuery({
    queryKey: ["route-stops-admin", filter],
    queryFn: async () => {
      const { data, error } = await db.rpc("bw_route_stops_admin", { p_status: filter });
      if (error) {
        if (error.code === "PGRST202") return { pending: 0, rows: [] as Row[], missing: true };
        throw error;
      }
      return { ...(data as { pending: number; rows: Row[] }), missing: false };
    },
    enabled: Boolean(user) && isAdmin,
    refetchInterval: 120_000,
  });
  if (!isAdmin) return null;
  return (
    <div className="mt-5">
      <ModerationSection
        title="Haltes des routes du bled"
        count={list.data?.pending}
        hint="Proposées par les voyageurs sur /routes-du-bled. Vérifiez que l'endroit existe (Google Maps, site de l'établissement), corrigez la position si besoin, puis publiez. Le pseudo de l'auteur n'est jamais affiché sur la page."
        toolbar={
          <StatusFilter
            label="Afficher"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "pending", label: "À vérifier" },
              { value: "done", label: "Traitées" },
            ]}
          />
        }
      >
        {list.isPending ? (
          moderationEmpty("Chargement…")
        ) : list.isError ? (
          moderationEmpty((list.error as Error).message)
        ) : list.data.missing ? (
          moderationEmpty("Le script SQL « routes du bled » n'est pas encore appliqué.")
        ) : list.data.rows.length ? (
          <ul className="bo-modlist">
            {list.data.rows.map((row) => (
              <StopCard key={row.id} row={row} />
            ))}
          </ul>
        ) : (
          moderationEmpty(
            filter === "pending" ? "Aucune halte à vérifier." : "Aucune halte traitée.",
          )
        )}
      </ModerationSection>
    </div>
  );
}

function StopCard({ row }: { row: Row }) {
  const client = useQueryClient();
  const [pos, setPos] = useState(row.lat != null ? `${row.lat}, ${row.lon}` : "");
  const [note, setNote] = useState(row.decision_note ?? "");
  const parsed = (() => {
    const m = pos.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)$/);
    if (!m) return null;
    const lat = Number(m[1]!.replace(",", "."));
    const lon = Number(m[2]!.replace(",", "."));
    return lat >= 30 && lat <= 52 && lon >= -10 && lon <= 12 ? { lat, lon } : null;
  })();
  const decide = useMutation({
    mutationFn: async (decision: "approved" | "rejected" | "pending") => {
      const { error } = await db.rpc("bw_route_stop_decide", {
        p_id: row.id,
        p_decision: decision,
        p_lat: parsed?.lat ?? null,
        p_lon: parsed?.lon ?? null,
        p_note: note.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, d) =>
      toast.success(
        d === "approved"
          ? "Halte publiée."
          : d === "rejected"
            ? "Halte refusée."
            : "Halte remise à vérifier.",
      ),
    onError: (error) => toast.error((error as Error).message),
    onSettled: () => void client.invalidateQueries({ queryKey: ["route-stops-admin"] }),
  });
  const search = encodeURIComponent(`${row.name} ${row.place}`);
  return (
    <ModerationCard
      title={`${row.name} · ${row.route_code}`}
      status={row.status}
      meta={
        <>
          {row.kind} · {row.place} · reçue le {whenFmt.format(new Date(row.created_at))}
          {row.direction !== "both" ? ` · sens ${row.direction}` : ""}
        </>
      }
      author={row.author ? <p className="bo-modcard__meta">Par {row.author}</p> : null}
      actions={
        <div className="grid w-full gap-2">
          <Input
            value={pos}
            onChange={(e) => setPos(e.target.value)}
            placeholder="Position : 38.7894, -0.8872"
            aria-label="Position (latitude, longitude)"
          />
          <Input
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note interne (facultative)"
            aria-label="Note interne"
          />
          <div className="flex flex-wrap gap-2">
            {row.status !== "approved" ? (
              <Button
                size="sm"
                disabled={decide.isPending || !parsed}
                onClick={() => decide.mutate("approved")}
              >
                Publier
              </Button>
            ) : null}
            {row.status !== "rejected" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={decide.isPending}
                onClick={() => decide.mutate("rejected")}
              >
                Refuser
              </Button>
            ) : null}
            {row.status !== "pending" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={decide.isPending}
                onClick={() => decide.mutate("pending")}
              >
                Remettre à vérifier
              </Button>
            ) : null}
          </div>
          {!parsed && row.status !== "approved" ? (
            <p className="text-xs text-muted-foreground">
              Une position est nécessaire pour publier.
            </p>
          ) : null}
        </div>
      }
    >
      {row.features.length ? <p>{row.features.join(" · ")}</p> : null}
      {row.note ? <p className="mt-1 whitespace-pre-line">« {row.note} »</p> : null}
      <p className="mt-1">
        <a
          className="inline-flex items-center gap-1 underline"
          href={`https://www.google.com/maps/search/?api=1&query=${parsed ? `${parsed.lat},${parsed.lon}` : search}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Voir sur Google Maps
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </p>
    </ModerationCard>
  );
}
