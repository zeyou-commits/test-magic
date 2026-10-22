import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Campaign = {
  id: string;
  route_id: string;
  period_month: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  last_error: string | null;
  from: string;
  to: string;
  audience: number;
};
export type AdminNotificationOverview = {
  metrics: { follows: number; watches: number; pending: number; failed: number };
  campaigns: Campaign[];
  recent: { id: string; title: string; created_at: string }[];
};
export async function notificationAdminAction<T>(action: string, campaignId?: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Votre session a expiré. Reconnectez-vous.");
  const response = await fetch("/api/push-admin", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ action, campaignId }),
  });
  const result = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !result)
    throw new Error(result?.error ?? "Le service de notifications est indisponible.");
  return result;
}
export const adminNotificationQuery = (userId?: string) =>
  queryOptions({
    queryKey: ["admin", "notification-overview", userId],
    enabled: Boolean(userId),
    queryFn: () => notificationAdminAction<AdminNotificationOverview>("overview"),
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: false,
  });
