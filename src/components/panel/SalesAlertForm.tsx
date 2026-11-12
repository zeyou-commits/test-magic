import { useState } from "react";
import { BellRing, CalendarClock, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tr } from "@/lib/i18n";

/** Message « pas encore programmé » + inscription à l'alerte d'ouverture des ventes. */
export function SalesAlertForm({
  periodLabel,
  periodStart,
  periodEnd,
  fromLabel,
  toLabel,
}: {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  fromLabel?: string | null;
  toLabel?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!consent || !/^\S+@\S+\.\S+$/.test(email.trim())) return;
    setState("sending");
    const { error } = await supabase.from("sales_alerts").insert({
      email: email.trim(),
      from_label: fromLabel ?? null,
      to_label: toLabel ?? null,
      period_label: periodLabel,
      period_start: periodStart,
      period_end: periodEnd,
      consent: true,
    });
    setState(error ? "error" : "done");
  };

  return (
    <div className="space-y-2 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs">
      <p className="flex items-start gap-2 text-sm font-bold text-foreground">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-warning-foreground" aria-hidden />
        <span>
          {tr("ui.salesAlertForm.lesVentesPour")}{periodLabel}{tr("ui.salesAlertForm.neSontPasEncoreOuvertes")}
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {tr("ui.salesAlertForm.soyezPrevenuDesLOuverture")}
          </span>
        </span>
      </p>
      {state === "done" ? (
        <p className="flex items-center gap-1.5 font-semibold text-success">
          <Check className="size-4" aria-hidden />{tr("ui.salesAlertForm.demandeTransmiseALEquipe")}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <div className="flex gap-1.5">
            <input
              type="email"
              required
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={tr("ui.salesAlertForm.votreEMail")}
              aria-label={tr("ui.salesAlertForm.votreAdresseEMail")}
              className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm"
            />
            <button
              type="submit"
              disabled={!consent || state === "sending"}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              <BellRing className="size-4" aria-hidden />{tr("ui.salesAlertForm.mePrevenir")}
            </button>
          </div>
          <label className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 size-4"
            />
            {tr("ui.salesAlertForm.jAccepteQueBledwayUtilise")}
          </label>
          {state === "error" ? (
            <p className="text-destructive">{tr("ui.salesAlertForm.lInscriptionAEchoueReessayez")}</p>
          ) : null}
        </form>
      )}
    </div>
  );
}
