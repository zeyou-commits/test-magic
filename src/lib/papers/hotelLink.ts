import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { HOTEL_BOOKING_LINK } from "@/content/formalites";

const supabase = typedSupabase as unknown as SupabaseClient;

export type HotelLink = { label: string; href: string };

/** Un lien utilisable : un libellé, et une adresse https valide. Sinon, rien. */
export function cleanHotelLink(value: unknown): HotelLink | null {
  if (!value || typeof value !== "object") return null;
  const { label, href } = value as Partial<HotelLink>;
  if (typeof label !== "string" || typeof href !== "string") return null;
  const text = label.trim();
  if (!text || text.length > 80) return null;
  try {
    const url = new URL(href.trim());
    return url.protocol === "https:" ? { label: text, href: url.toString() } : null;
  } catch {
    return null;
  }
}

/** Le site proposé pour réserver un hôtel : celui choisi dans l'admin, sinon Booking.com. */
export const hotelLinkKey = ["admin-setting", "hotel_booking"] as const;
export const hotelLinkQuery = queryOptions({
  queryKey: hotelLinkKey,
  queryFn: async (): Promise<HotelLink> => {
    const { data, error } = await supabase.rpc("bw_hotel_booking_link");
    if (error) return HOTEL_BOOKING_LINK;
    return cleanHotelLink(data) ?? HOTEL_BOOKING_LINK;
  },
  staleTime: 10 * 60_000,
  retry: false,
});

export const useHotelLink = (enabled = true) =>
  useQuery({ ...hotelLinkQuery, enabled }).data ?? HOTEL_BOOKING_LINK;
