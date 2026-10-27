import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

const followSchema = z.object({
  type: z.literal("follow"),
  kind: z.enum(["vessel", "departure"]),
  targetId: z.string().uuid(),
  label: z.string().max(200),
  /** Réponse à « Vous voyagez sur ce bateau ? » : vrai = « Ma traversée », faux = un proche. */
  traveller: z.boolean().optional(),
  /** Traversée choisie quand on suit un bateau et qu'on voyage à bord. */
  departureId: z.string().uuid().optional(),
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
/** Suivi d'un bateau ou d'une traversée ; « je voyage » enregistré si la base le connaît (script du 02/11). */
async function upsertFollow(
  userId: string,
  kind: "vessel" | "departure",
  targetId: string,
  traveller: boolean | undefined,
) {
  const row = { user_id: userId, target_kind: kind, target_id: targetId, active: true };
  const options = { onConflict: "user_id,target_kind,target_id" };
  if (kind === "departure" && traveller !== undefined) {
    const result = await supabase.from("bw_follows").upsert({ ...row, traveller }, options);
    // Colonne absente tant que le script n'est pas exécuté : on suit quand même.
    if (!result.error || !/traveller|PGRST204|42703/.test(`${result.error.code} ${result.error.message}`))
      return result;
  }
  return supabase.from("bw_follows").upsert(row, options);
}

export async function saveTravelAction(userId: string, rawAction: TravelAction) {
  const action = travelActionSchema.parse(rawAction);
  if (action.type === "follow" && action.kind === "vessel" && action.traveller && action.departureId) {
    // « Je voyage sur ce bateau » : la traversée choisie devient « Ma traversée ».
    const trip = await upsertFollow(userId, "departure", action.departureId, true);
    if (trip.error) throw new Error("Enregistrement impossible. Réessayez dans un instant.");
  }
  const result =
    action.type === "follow"
      ? await upsertFollow(userId, action.kind, action.targetId, action.traveller)
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
