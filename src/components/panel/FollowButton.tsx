import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type FollowKind = "vessel" | "departure";

function vapidBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - base64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export async function registerPush(userId: string): Promise<"enabled" | "unavailable" | "denied"> {
  const publicKey = import.meta.env['VITE_VAPID_PUBLIC_KEY'];
  if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unavailable";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(publicKey) });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.['p256dh'] || !json.keys['auth']) throw new Error("Abonnement push incomplet.");
  const { error } = await supabase.from("bw_push_subscriptions").upsert({ user_id: userId, endpoint: json.endpoint, p256dh: json.keys['p256dh'], auth_key: json.keys['auth'] }, { onConflict: "endpoint" });
  if (error) throw error;
  return "enabled";
}

export function FollowButton({ kind, targetId, compact = false }: { kind: FollowKind; targetId: string; compact?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["follow", user?.id, kind, targetId];
  const { data: follow } = useQuery({ queryKey, enabled: Boolean(user), queryFn: async () => {
    const { data, error } = await supabase.from("bw_follows").select("id,active").eq("user_id", user!.id).eq("target_kind", kind).eq("target_id", targetId).maybeSingle();
    if (error) throw error;
    return data;
  } });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function toggle() {
    if (!user) { window.location.href = "/auth"; return; }
    setBusy(true);
    setMessage("");
    try {
      if (follow?.active) {
        const { error } = await supabase.from("bw_follows").update({ active: false }).eq("id", follow.id);
        if (error) throw error;
        setMessage("Suivi désactivé.");
      } else {
        const { error } = await supabase.from("bw_follows").upsert({ user_id: user.id, target_kind: kind, target_id: targetId, active: true }, { onConflict: "user_id,target_kind,target_id" });
        if (error) throw error;
        const push = await registerPush(user.id);
        setMessage(push === "enabled" ? "Suivi activé avec notifications push." : push === "denied" ? "Suivi activé. Autorisez les notifications pour recevoir les rappels sur cet appareil." : "Suivi activé dans Mon compte. Les notifications push ne sont pas configurées sur cet appareil.");
      }
      await queryClient.invalidateQueries({ queryKey });
    } catch {
      setMessage("Le suivi n’a pas pu être mis à jour. Réessayez.");
    } finally { setBusy(false); }
  }
  return <span className="inline-flex flex-col items-start gap-1"><button type="button" onClick={() => void toggle()} disabled={busy} aria-pressed={Boolean(follow?.active)} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition disabled:opacity-50 ${follow?.active ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-foreground hover:border-primary"}`}>
    {follow?.active ? <BellOff className="size-3.5" aria-hidden /> : <Bell className="size-3.5" aria-hidden />}{follow?.active ? "Ne plus suivre" : compact ? "Suivre" : kind === "vessel" ? "Suivre ce bateau" : "Suivre cette traversée"}
  </button>{message && <span role="status" className="max-w-64 text-[11px] leading-snug text-muted-foreground">{message}</span>}</span>;
}
