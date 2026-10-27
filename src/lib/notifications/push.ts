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
  // Le téléphone passe au compte connecté, même s'il était abonné avec un autre compte (script du 03/11).
  const claimed = await supabase.rpc("bw_claim_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys["p256dh"],
    p_auth: json.keys["auth"],
  });
  if (claimed.error) {
    if (claimed.error.code !== "PGRST202") throw claimed.error;
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
  }
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
  // Ce téléphone reçoit aussi ce qui est encore d'actualité pour ce compte.
  void requestCatchUp();
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

export type DevicePushState = "on" | "off" | "denied" | "ios-install" | "unsupported";
const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
/**
 * État réel de ce téléphone pour le compte connecté : autorisation du navigateur, abonnement
 * présent sur l'appareil ET enregistré pour ce compte.
 */
export async function devicePushState(userId: string): Promise<DevicePushState> {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "ios-install";
  const capability = pushCapability();
  if (capability === "unavailable") return "unsupported";
  if (capability === "denied") return "denied";
  if (capability === "prompt") return "off";
  try {
    if (localStorage.getItem(`bledway:push-device-disabled:${userId}`) === "true") return "off";
  } catch {
    /* stockage facultatif */
  }
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "off";
  const { data, error } = await supabase
    .from("bw_push_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();
  if (error || !data) return "off";
  // Push coupé pour tout le compte dans les préférences : rien ne partira sur ce téléphone.
  const prefs = await supabase
    .from("bw_notification_preferences")
    .select("push_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return prefs.data?.push_enabled === false ? "off" : "on";
}

/**
 * Demande au serveur d'envoyer à ce compte ce qui est encore d'actualité pour ses suivis, et de
 * pousser ses notifications récentes sur ce téléphone. Sans effet bloquant : en cas d'échec,
 * le passage automatique suivant s'en charge.
 */
export async function requestCatchUp() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/push-catchup", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    /* le passage automatique prendra le relais */
  }
}
