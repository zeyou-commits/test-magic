import { adminRequest } from "./request";

export type ManagedUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  roles: string[];
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
};
export type UsersPage = {
  total: number;
  members: ManagedUser[];
  audit: {
    actor_id: string | null;
    target_id: string | null;
    action: string;
    created_at: string;
  }[];
};
export type UsersStats = {
  total: number;
  active7: number;
  new7: number;
  banned: number;
  team: number;
  push_users: number;
  push_devices: number;
};
export type AuditEntry = {
  action: string;
  created_at: string;
  details: Record<string, unknown>;
  actor: string;
  target?: string | null;
};
export type UserDetail = {
  account: ManagedUser;
  traveller: { pseudo?: string; avatar?: string; color?: string; mood_code?: string | null } | null;
  /** « public.bw_follows.user_id » → nombre de lignes. */
  activity: Record<string, number>;
  devices: { host: string; created_at: string; last_success_at: string | null }[];
  history: AuditEntry[];
};

/** Libellés lisibles des tables qui pointent vers un compte (les autres gardent leur nom). */
export const activityLabels: Record<string, string> = {
  "public.bw_follows.user_id": "Suivis (bateaux, traversées)",
  "public.bw_push_subscriptions.user_id": "Téléphones abonnés aux notifications",
  "public.bw_traveller_profiles.user_id": "Profil voyageur",
  "public.port_reviews.user_id": "Avis sur les ports",
  "public.bw_vessel_reviews.user_id": "Avis sur les navires",
  "public.bw_review_helpful.user_id": "Avis jugés utiles",
  "public.reports.user_id": "Erreurs signalées",
  "public.bw_travel_alerts.user_id": "Signalements sur le terrain",
  "public.bw_alert_confirmations.user_id": "Signalements confirmés",
  "public.bw_alert_denials.user_id": "Signalements contredits (« plus le cas »)",
  "public.bw_report_anomalies.user_id": "Observations à vérifier",
  "public.bw_reactions.user_id": "Mercis donnés",
  "public.bw_trip_status.user_id": "Statuts « Ma traversée »",
  "public.bw_journeys.user_id": "Voyages (aller-retour)",
  "public.bw_itinerary_watches.user_id": "Alertes d'itinéraire",
  "public.bw_notifications.user_id": "Notifications reçues",
  "public.bw_notification_preferences.user_id": "Préférences de notification",
  "public.bw_wallets.user_id": "Portefeuille (Ma bezass)",
};
/** Colonnes d'actions de l'équipe (créé par, validé par…) : regroupées sous un seul libellé. */
export const isStaffColumn = (key: string) =>
  /\.(created_by|updated_by|approved_by|actor_id)$/.test(key);

export async function userAdminAction<T>(input: Record<string, unknown>): Promise<T> {
  return adminRequest<T>("/api/admin-users", input);
}
