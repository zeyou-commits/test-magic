import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CalendarClock, MessageSquare, Smartphone } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;
import { Switch } from "@/components/ui/switch";
import {
  defaultNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications/policy";
import { PushStatusLine } from "@/components/panel/PushStatusLine";

const options = [
  {
    key: "reminders",
    label: "Mon départ et ses rappels",
    description:
      "Changements d’horaire ou de navire, rappels à 7 jours, 48 h et 24 h, préparatifs et heure au port.",
    icon: CalendarClock,
  },
  {
    key: "community",
    label: "Actualités de mes bateaux",
    description: "Signalements et nouveaux avis des voyageurs sur les bateaux suivis.",
    icon: MessageSquare,
  },
  {
    key: "openings",
    label: "Ouverture des traversées",
    description: "Les liaisons et périodes que vous suivez, après vérification par notre équipe.",
    icon: BellRing,
  },
] as const;

export function NotificationSettings({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const key = ["notification-preferences", userId];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_notification_preferences")
        .select("reminders,community,openings,push_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ?? defaultNotificationPreferences;
    },
  });
  const update = useMutation({
    mutationFn: async (patch: Partial<NotificationPreferences>) => {
      const { error } = await supabase
        .from("bw_notification_preferences")
        .upsert(
          { user_id: userId, ...patch, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  return (
    <section className="bw-account-section" aria-labelledby="notification-settings-title">
      <div className="bw-account-section-heading">
        <span className="bw-account-icon">
          <Bell className="size-5" />
        </span>
        <div>
          <h2 id="notification-settings-title">À votre rythme</h2>
          <p>Choisissez les informations qui vous accompagnent.</p>
        </div>
      </div>
      {query.isPending ? (
        <div className="h-48 animate-pulse rounded-xl bg-secondary" />
      ) : query.error ? (
        <p role="alert" className="rounded-xl bg-destructive/5 p-4 text-sm text-destructive">
          Préférences indisponibles.
          <button type="button" className="ml-2 underline" onClick={() => void query.refetch()}>
            Réessayer
          </button>
        </p>
      ) : (
        <div className="divide-y divide-border">
          {options.map(({ key: optionKey, label, description, icon: Icon }) => (
            <div key={optionKey} className="flex items-center gap-3 py-4">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              <label htmlFor={`preference-${optionKey}`} className="min-w-0 flex-1 cursor-pointer">
                <strong className="block text-sm font-semibold">{label}</strong>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {description}
                </span>
              </label>
              <Switch
                id={`preference-${optionKey}`}
                checked={query.data[optionKey]}
                disabled={update.isPending}
                onCheckedChange={(value) => update.mutate({ [optionKey]: value })}
              />
            </div>
          ))}
        </div>
      )}
      {update.isError && (
        <p role="alert" className="my-2 text-xs text-destructive">
          La préférence n’a pas pu être enregistrée.
        </p>
      )}
      <div className="mt-5">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="size-4 text-primary" aria-hidden /> Ce téléphone
        </h3>
        <PushStatusLine withDisable />
      </div>
    </section>
  );
}
