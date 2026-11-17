import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ExternalLink, Hotel } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { HOTEL_BOOKING_LINK } from "@/content/formalites";
import {
  cleanHotelLink,
  hotelLinkKey,
  hotelLinkQuery,
  type HotelLink,
} from "@/lib/papers/hotelLink";

const supabase = typedSupabase as unknown as SupabaseClient;

/**
 * Le site proposé aux voyageurs non algériens pour réserver leur hôtel (fiche « La réservation
 * d'hôtel pour le visa » de Préparer). Booking.com par défaut.
 */
export function HotelLinkAdmin() {
  const client = useQueryClient();
  const current = useQuery(hotelLinkQuery).data ?? HOTEL_BOOKING_LINK;
  const [draft, setDraft] = useState<HotelLink | null>(null);
  const value = draft ?? current;
  const valid = cleanHotelLink(value);
  const save = useMutation({
    mutationFn: async (next: HotelLink) => {
      const { error } = await supabase
        .from("bw_admin_settings")
        .upsert({ key: "hotel_booking", value: next, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: hotelLinkKey });
      setDraft(null);
      toast.success("Lien enregistré : il s'affiche dans Préparer dès le prochain chargement.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const isDefault =
    value.label === HOTEL_BOOKING_LINK.label && value.href === HOTEL_BOOKING_LINK.href;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold">
        <Hotel className="size-5 text-primary" aria-hidden /> Lien pour réserver un hôtel
      </h3>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Le bouton de la fiche « La réservation d'hôtel pour le visa », dans Préparer : elle
        s'affiche aux voyageurs non algériens qui logent à l'hôtel.
      </p>
      <div className="mt-3 grid max-w-2xl gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Texte du bouton</span>
          <Input
            value={value.label}
            maxLength={80}
            onChange={(e) => setDraft({ ...value, label: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Adresse (https://…)</span>
          <Input
            value={value.href}
            inputMode="url"
            onChange={(e) => setDraft({ ...value, href: e.target.value })}
          />
        </label>
        {!valid ? (
          <p role="alert" className="text-sm font-semibold text-red-700">
            Il faut un texte (80 caractères au plus) et une adresse qui commence par https://.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!draft || !valid || save.isPending}
            onClick={() => valid && save.mutate(valid)}
          >
            Enregistrer le lien
          </Button>
          {valid ? (
            <a
              href={valid.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Tester le lien <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
          {!isDefault ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setDraft(HOTEL_BOOKING_LINK)}
            >
              Revenir à Booking.com
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
