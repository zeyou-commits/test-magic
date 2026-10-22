import { useState, type FormEvent } from "react";
import { BellRing, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { VehicleKind } from "@/components/panel/TripProfile";

export function ItineraryAlertForm({ from, to, period, origin, destination, vehicle, adults, children }: {
  from: string;
  to: string;
  period: string;
  origin: string;
  destination: string;
  vehicle: VehicleKind;
  adults: number;
  children: number;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

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
    {status === "done" ? <p role="status" className="flex items-center gap-1 text-xs font-semibold text-primary"><Check className="size-3.5" /> Demande enregistrée pour {from} → {to} en {period}.</p> : <>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-bold text-primary underline underline-offset-2"><BellRing className="size-3.5" /> Demander une alerte pour ce trajet</button>
      {open && <form onSubmit={(event) => void submit(event)} className="mt-2 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs">
        <p className="font-semibold">{origin} → {destination} · {from} → {to} · {period}</p>
        <p className="text-muted-foreground">Votre demande sera transmise à l’équipe pour vous prévenir lorsque des horaires seront publiés. L’envoi n’est pas automatique pour le moment.</p>
        <div className="flex gap-1.5"><input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Votre e-mail" aria-label="Votre adresse e-mail" className="min-h-9 min-w-0 flex-1 rounded-lg border border-border bg-white px-2" /><button type="submit" disabled={!consent || status === "sending"} className="rounded-lg bg-primary px-2.5 font-semibold text-white disabled:opacity-50">{status === "sending" ? "Envoi…" : "M’inscrire"}</button></div>
        <label className="flex items-start gap-2 text-[11px] text-muted-foreground"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5" />J’accepte que BledWay utilise mon e-mail et ce parcours uniquement pour cette alerte.</label>
        {status === "error" && <p role="alert" className="text-destructive">Impossible d’enregistrer la demande. Réessayez.</p>}
      </form>}
    </>}
  </div>;
}
