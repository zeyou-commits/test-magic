import { queryOptions } from "@tanstack/react-query";
import { adminRequest, AdminRequestError } from "@/lib/admin/request";

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
  return adminRequest<T>("/api/push-admin", { action, campaignId });
}
export const adminNotificationQuery = (userId?: string) =>
  queryOptions({
    queryKey: ["admin", "notification-overview", userId],
    enabled: Boolean(userId),
    queryFn: () => notificationAdminAction<AdminNotificationOverview>("overview"),
    staleTime: 10_000,
    refetchInterval: (query) =>
      query.state.error instanceof AdminRequestError &&
      [401, 403, 503].includes(query.state.error.status)
        ? false
        : 30_000,
    refetchOnWindowFocus: (query) => !query.state.error,
    refetchOnReconnect: (query) => !query.state.error,
    retry: false,
  });
