export type NotificationCategory = "reminders" | "community" | "openings";
export type NotificationPreferences = {
  reminders: boolean;
  community: boolean;
  openings: boolean;
  push_enabled: boolean;
};
export const defaultNotificationPreferences: NotificationPreferences = {
  reminders: true,
  community: true,
  openings: true,
  push_enabled: true,
};
export function notificationAllowed(
  preferences: NotificationPreferences | undefined,
  category: NotificationCategory,
) {
  return preferences?.[category] !== false;
}
export function openingApproved(status: string | undefined) {
  return status === "approved";
}
