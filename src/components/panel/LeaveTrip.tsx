import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { setTripStatus } from "@/lib/ferry/presence";
import { tr } from "@/lib/i18n";

const db = typedSupabase as unknown as SupabaseClient;

/** Ne plus suivre une traversée : elle quitte « Ma traversée » et les rappels s'arrêtent. */
export function LeaveTrip({ departureId }: { departureId: string }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!user) return null;
  const leave = async () => {
    setBusy(true);
    setError("");
    const { error: issue } = await db
      .from("bw_follows")
      .update({ active: false, traveller: false })
      .eq("user_id", user.id)
      .eq("target_kind", "departure")
      .eq("target_id", departureId);
    if (issue) {
      setError("Le suivi n’a pas pu être arrêté. Réessayez.");
      setBusy(false);
      return;
    }
    // Le statut et le lien aller-retour ne doivent pas survivre au suivi.
    await setTripStatus(departureId, null).catch(() => {});
    await db
      .from("bw_journeys")
      .update({ outbound_departure_id: null })
      .eq("user_id", user.id)
      .eq("outbound_departure_id", departureId);
    await db
      .from("bw_journeys")
      .update({ inbound_departure_id: null })
      .eq("user_id", user.id)
      .eq("inbound_departure_id", departureId);
    await Promise.all(
      [
        "follow",
        "my-follows",
        "my-trips",
        "my-journeys",
        "journey",
        "bw-trip-presence",
        "bw-chat",
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
    setBusy(false);
    setConfirming(false);
  };
  return (
    <p className="bw-leave-trip">
      {confirming ? (
        <>
          <span>{tr("ui.leaveTrip.nePlusSuivreCetteTraversee")}</span>
          <button type="button" disabled={busy} onClick={() => void leave()}>
            {tr("ui.leaveTrip.ouiArreter")}
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            {tr("ui.leaveTrip.non")}
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          {tr("ui.leaveTrip.nePlusSuivreCetteTraversee2")}
        </button>
      )}
      {error ? <span role="alert">{error}</span> : null}
    </p>
  );
}
