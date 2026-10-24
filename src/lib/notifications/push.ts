import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;
export type PushStatus = "enabled" | "unavailable" | "denied" | "prompt";
export function pushCapability(): PushStatus {
  if (
    typeof window === "undefined" ||
    !import.meta.env["VITE_VAPID_PUBLIC_KEY"] ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return "unavailable";
  return Notification.permission === "granted"
    ? "enabled"
    : Notification.permission === "denied"
      ? "denied"
      : "prompt";
}
function vapidBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
/** Le navigateur n'est sollicité qu'à la suite d'un clic explicite. */
export async function registerPush(userId: string, requestPermission = true): Promise<PushStatus> {
  if (!requestPermission) {
    try {
      if (localStorage.getItem(`bledway:push-device-disabled:${userId}`) === "true")
        return "unavailable";
    } catch {
      /* stockage facultatif */
    }
    const preferences = await supabase
      .from("bw_notification_preferences")
      .select("push_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (preferences.error || preferences.data?.push_enabled === false) return "unavailable";
  }
  const capability = pushCapability();
  if (capability === "unavailable" || capability === "denied") return capability;
  if (capability === "prompt") {
    if (!requestPermission) return "prompt";
    if ((await Notification.requestPermission()) !== "granted") return "denied";
  }
  const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidBytes(import.meta.env["VITE_VAPID_PUBLIC_KEY"]),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.["p256dh"] || !json.keys["auth"])
    throw new Error("Abonnement push incomplet.");
  const { error } = await supabase.from("bw_push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys["p256dh"],
      auth_key: json.keys["auth"],
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
  if (requestPermission) {
    const result = await supabase
      .from("bw_notification_preferences")
      .upsert(
        { user_id: userId, push_enabled: true, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (result.error) throw result.error;
    try {
      localStorage.removeItem(`bledway:push-device-disabled:${userId}`);
    } catch {
      /* stockage facultatif */
    }
  }
  return "enabled";
}
export async function disableDevicePush(userId: string) {
  try {
    localStorage.setItem(`bledway:push-device-disabled:${userId}`, "true");
  } catch {
    /* stockage facultatif */
  }
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await supabase
    .from("bw_push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", subscription.endpoint);
  if (error) throw error;
  await subscription.unsubscribe();
}
