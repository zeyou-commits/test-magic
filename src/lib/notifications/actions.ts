import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const followSchema = z.object({
  type: z.literal("follow"),
  kind: z.enum(["vessel", "departure"]),
  targetId: z.string().uuid(),
  label: z.string().max(200),
});
const watchSchema = z.object({
  type: z.literal("opening"),
  routeId: z.string().uuid(),
  from: z.string().max(200),
  to: z.string().max(200),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  origin: z.string().max(250),
  destination: z.string().max(250),
  vehicle: z.string().max(40),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
});
export const travelActionSchema = z.discriminatedUnion("type", [followSchema, watchSchema]);
export type TravelAction = z.infer<typeof travelActionSchema>;
const storageKey = "bledway:pending-travel-action:v1";
const storedSchema = z.object({ action: travelActionSchema, expires: z.number() });

export function rememberTravelAction(action: TravelAction) {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ action, expires: Date.now() + 7 * 86400000 }),
    );
  } catch {
    /* L'action reste disponible dans la boîte de dialogue. */
  }
}
export function pendingTravelAction(): TravelAction | null {
  try {
    const result = storedSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
    return result.success && result.data.expires > Date.now() ? result.data.action : null;
  } catch {
    return null;
  }
}
export function clearTravelAction() {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* stockage facultatif */
  }
}
export function travelActionLabel(action: TravelAction) {
  return action.type === "follow"
    ? action.label
    : `${action.from} → ${action.to} · ${new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${action.period}-15T12:00:00`))}`;
}
export async function saveTravelAction(userId: string, rawAction: TravelAction) {
  const action = travelActionSchema.parse(rawAction);
  const result =
    action.type === "follow"
      ? await supabase
          .from("bw_follows")
          .upsert(
            { user_id: userId, target_kind: action.kind, target_id: action.targetId, active: true },
            { onConflict: "user_id,target_kind,target_id" },
          )
      : await supabase.from("bw_itinerary_watches").upsert(
          {
            user_id: userId,
            route_id: action.routeId,
            period_month: `${action.period}-01`,
            origin_label: action.origin,
            destination_label: action.destination,
            journey_context: {
              vehicle: action.vehicle,
              adults: action.adults,
              children: action.children,
            },
            active: true,
          },
          { onConflict: "user_id,route_id,period_month" },
        );
  if (result.error) throw new Error("Enregistrement impossible. Réessayez dans un instant.");
}
