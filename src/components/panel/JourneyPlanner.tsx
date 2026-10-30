import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useJourneyForDeparture } from "@/lib/ferry/journey";
import { keepOnlyTrip } from "@/lib/notifications/actions";
import { ReturnDepartureSearch } from "./ReturnDepartureSearch";
import type { Selection } from "@/lib/ferry/types";

const db = typedSupabase as unknown as SupabaseClient;

export function JourneyPlanner({ departureId, onSelect }: {
  departureId: string;
  onSelect: (selection: Selection) => void;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const journey = useJourneyForDeparture(user?.id, departureId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentIsReturn = journey.data?.inbound_departure_id === departureId;
  const otherId = currentIsReturn ? journey.data?.outbound_departure_id : journey.data?.inbound_departure_id;

  async function classify(leg: "outbound" | "inbound") {
    if (!user || busy) return;
    setBusy(true); setError("");
    const result = await db.from("bw_journeys").insert({ user_id: user.id,
      outbound_departure_id: leg === "outbound" ? departureId : null,
      inbound_departure_id: leg === "inbound" ? departureId : null,
    });
    if (result.error) setError("Impossible de classer cette traversée pour le moment.");
    else await Promise.all([client.invalidateQueries({ queryKey: ["journey"] }), client.invalidateQueries({ queryKey: ["my-journeys"] })]);
    setBusy(false);
  }

  async function attachReturn(returnId: string) {
    if (!user || busy) return;
    setBusy(true); setError("");
    try {
      const saved = journey.data
        ? await db.from("bw_journeys").update({ inbound_departure_id: returnId, updated_at: new Date().toISOString() }).eq("id", journey.data.id).eq("user_id", user.id)
        : await db.from("bw_journeys").insert({ user_id: user.id, outbound_departure_id: departureId, inbound_departure_id: returnId });
      if (saved.error) throw saved.error;
      const followed = await db.from("bw_follows").upsert({ user_id: user.id, target_kind: "departure", target_id: returnId, active: true, traveller: true, follow_purpose: "voyageur" }, { onConflict: "user_id,target_kind,target_id" });
      if (followed.error) throw followed.error;
      await keepOnlyTrip(user.id, [departureId, returnId]);
      await Promise.all([client.invalidateQueries({ queryKey: ["journey"] }), client.invalidateQueries({ queryKey: ["my-trips"] }), client.invalidateQueries({ queryKey: ["my-follows"] }), client.invalidateQueries({ queryKey: ["my-journeys"] })]);
      setOpen(false);
    } catch { setError("Le retour n’a pas pu être enregistré. Réessayez."); }
    finally { setBusy(false); }
  }

  if (!user || journey.isPending) return null;
  if (journey.isError) return <p role="status" className="rounded-xl border p-3 text-xs">Le lien avec votre voyage est temporairement indisponible.</p>;
  if (!journey.data) return <section className="rounded-xl border border-primary/20 bg-primary/5 p-3" aria-label="Classer ma traversée">
    <strong className="text-sm">Cette traversée fait-elle partie de votre aller ou de votre retour ?</strong>
    <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void classify("outbound")} className="rounded-lg border bg-background px-3 py-2 text-xs font-semibold text-primary">Mon aller</button><button type="button" disabled={busy} onClick={() => void classify("inbound")} className="rounded-lg border bg-background px-3 py-2 text-xs font-semibold text-primary">Mon retour</button></div>
    {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
  </section>;
  return <section className="rounded-xl border border-primary/20 bg-primary/5 p-3" aria-label="Mon voyage aller-retour">
    <div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-foreground">Mon voyage</strong><p className="text-xs text-muted-foreground">Cette traversée est votre {currentIsReturn ? "retour" : "aller"}.</p></div><CalendarDays size={17} className="text-primary" aria-hidden /></div>
    {otherId ? <button type="button" onClick={() => onSelect({ type: "departure", id: otherId })} className="mt-2 flex w-full items-center gap-2 rounded-lg bg-background px-3 py-2 text-left text-xs font-semibold text-primary">
      {currentIsReturn ? "Voir mon aller" : "Voir mon retour"}<ArrowRight size={14} aria-hidden />
    </button> : currentIsReturn ? <p className="mt-2 text-xs text-muted-foreground">Vous avez commencé le suivi par le retour.</p> : <>
      <button type="button" onClick={() => setOpen((wasOpen) => !wasOpen)} aria-expanded={open} className="mt-2 text-xs font-semibold text-primary underline underline-offset-2">{open ? "Masquer les retours" : "Ajouter mon retour"}</button>
      {open ? <div className="mt-3"><ReturnDepartureSearch departureId={departureId} disabled={busy} onChoose={(id) => void attachReturn(id)} /></div> : null}
    </>}
    {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
  </section>;
}
