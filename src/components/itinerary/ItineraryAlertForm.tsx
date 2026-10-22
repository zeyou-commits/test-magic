import { useState, type FormEvent } from "react";
import { BellRing, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { VehicleKind } from "@/components/panel/TripProfile";
import { useAuth } from "@/hooks/useAuth";
import { registerPush } from "@/components/panel/FollowButton";

export function ItineraryAlertForm({ routeId, from, to, period, origin, destination, vehicle, adults, children }: {
  routeId: string;
  from: string;
  to: string;
  period: string;
  origin: string;
  destination: string;
  vehicle: VehicleKind;
  adults: number;
  children: number;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [pushHint, setPushHint] = useState("");

  async function followRoute() {
    if (!user) return;
    setStatus("sending");
    const { error } = await supabase.from("bw_itinerary_watches").upsert({
      user_id: user.id, route_id: routeId, period_month: `${period}-01`, origin_label: origin,
      destination_label: destination, journey_context: { vehicle, adults, children }, active: true,
    }, { onConflict: "user_id,route_id,period_month" });
    if (error) { setStatus("error"); return; }
    setStatus("done");
    try {
      const result = await registerPush(user.id);
      setPushHint(result === "enabled" ? "Push activé sur cet appareil." : "Retrouvez l’alerte dans Mon compte. Activez le push sur un appareil compatible pour recevoir une notification.");
    } catch { setPushHint("Alerte enregistrée. Activez le push dans Mon compte."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || !/^\S+@\S+\.\S+$/.test(email.trim())) return;
    setStatus("sending");
    const { error } = await supabase.from("sales_alerts").insert({
      email: email.trim(),
      from_label: from,
      to_label: to,
      period_label: period,
      period_start: `${period}-01`,
      period_end: new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).toISOString().slice(0, 10),
      consent: true,
      journey_context: { origin, destination, vehicle, adults, children },
    });
    setStatus(error ? "error" : "done");
  }

  return <div className="mt-2" onClick={(event) => event.stopPropagation()}>
    {status === "done" ? <p role="status" className="flex items-center gap-1 text-xs font-semibold text-primary"><Check className="size-3.5" /> Alerte enregistrée pour {from} → {to} en {period}. {pushHint}</p> : <>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-bold text-primary underline underline-offset-2"><BellRing className="size-3.5" /> Demander une alerte pour ce trajet</button>
      {open && user && <div className="mt-2 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs"><p className="font-semibold">{origin} → {destination} · {from} → {to} · {period}</p><p className="text-muted-foreground">Nous vous préviendrons lorsqu’une traversée sera publiée pour cette liaison et cette période.</p><button type="button" disabled={status === "sending"} onClick={() => void followRoute()} className="min-h-9 rounded-lg bg-primary px-3 font-semibold text-white disabled:opacity-50">Activer l’alerte</button>{status === "error" && <p role="alert" className="text-destructive">Impossible d’enregistrer l’alerte.</p>}</div>}
      {open && !user && <form onSubmit={(event) => void submit(event)} className="mt-2 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs">
        <p className="font-semibold">{origin} → {destination} · {from} → {to} · {period}</p>
        <p className="text-muted-foreground">Votre demande sera transmise à l’équipe pour vous prévenir lorsque des horaires seront publiés. L’envoi n’est pas automatique pour le moment.</p>
        <a href="/auth?next=%2F" className="inline-block font-semibold text-primary underline underline-offset-2">Se connecter puis relancer la recherche pour recevoir un push</a>
        <div className="flex gap-1.5"><input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Votre e-mail" aria-label="Votre adresse e-mail" className="min-h-9 min-w-0 flex-1 rounded-lg border border-border bg-white px-2" /><button type="submit" disabled={!consent || status === "sending"} className="rounded-lg bg-primary px-2.5 font-semibold text-white disabled:opacity-50">{status === "sending" ? "Envoi…" : "M’inscrire"}</button></div>
        <label className="flex items-start gap-2 text-[11px] text-muted-foreground"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5" />J’accepte que BledWay utilise mon e-mail et ce parcours uniquement pour cette alerte.</label>
        {status === "error" && <p role="alert" className="text-destructive">Impossible d’enregistrer la demande. Réessayez.</p>}
      </form>}
    </>}
  </div>;
}
