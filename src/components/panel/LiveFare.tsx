import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Armchair, BedDouble, CircleAlert, Loader2 } from "lucide-react";
import { AGGREGATOR, partnerBookingUrl } from "@/lib/ferry/booking";
import { markBookingLeave } from "@/lib/companion/bookingReturn";
import { track } from "@/lib/usage";
import type { Sailing } from "@/lib/ferry/trips";
import { VEHICLES, type TripProfileValue } from "./TripProfile";
import { directFerriesStatus, getLiveFare } from "@/lib/directferries/functions";
import type { LiveFare as LiveFareResult } from "@/lib/directferries/quote";

/** Direct Ferries est-il branché sur ce serveur ? Une seule question par visite. */
export function useDirectFerriesEnabled() {
  const status = useServerFn(directFerriesStatus);
  const query = useQuery({
    queryKey: ["directferries", "status"],
    queryFn: () => status(),
    staleTime: Infinity,
    retry: false,
  });
  return query.data?.enabled ?? false;
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    Math.ceil(amount),
  );

/**
 * Prix réel de ce départ chez Direct Ferries, pour le profil choisi (voyageurs + voiture).
 * N'apparaît que si le partenaire est branché ; sinon l'estimation de la carte reste seule.
 */
/**
 * Devis en direct d'un départ. `ask` = false lit seulement le cache (prix déjà demandé en dépliant
 * la carte) : la liste n'interroge jamais le partenaire carte par carte.
 */
export function useLiveFare(sailing: Sailing, profile: TripProfileValue, ask = true) {
  const enabled = useDirectFerriesEnabled();
  const fetchFare = useServerFn(getLiveFare);
  const usable = enabled && !sailing.isSimulation && !sailing.departure.is_demo;
  const request = {
    from: { name: sailing.from.name, latitude: sailing.from.latitude, longitude: sailing.from.longitude },
    to: { name: sailing.to.name, latitude: sailing.to.latitude, longitude: sailing.to.longitude },
    company: sailing.company?.name ?? null,
    departureLocal: `${sailing.dayKey}T${sailing.depTime}`,
    vehicle: profile.vehicle,
    accessories: profile.accessories,
    car: profile.vehicle === "none" ? null : (profile.car ?? null),
    load: profile.vehicle === "none" ? null : (profile.load ?? null),
    passengers: profile.passengers,
  };
  const query = useQuery({
    queryKey: ["directferries", "fare", request],
    queryFn: () => fetchFare({ data: request }) as Promise<LiveFareResult>,
    enabled: usable && ask,
    staleTime: 10 * 60_000,
    retry: false,
  });
  return { usable, query };
}

export function LiveFare({ sailing, profile }: { sailing: Sailing; profile: TripProfileValue }) {
  const { usable, query } = useLiveFare(sailing, profile);
  if (!usable) return null;
  if (query.isPending)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Prix pour votre voyage…
      </div>
    );
  const fare = query.data;
  if (!fare || fare.status === "off") return null;
  if (fare.status === "unavailable")
    return (
      <p className="flex items-start gap-1.5 rounded-xl bg-secondary/60 px-3 py-2 text-muted-foreground">
        <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Prix en direct indisponible : {fare.reason} Le montant affiché reste une estimation.
        </span>
      </p>
    );

  const travellers =
    profile.passengers.adults + profile.passengers.seniors + profile.passengers.children + profile.passengers.babies;
  const otherTime = fare.departureLocal.slice(11, 16);
  const conditions = [
    fare.amendable == null ? null : fare.amendable ? (fare.amendmentFee ? "Modifiable avec frais" : "Modifiable sans frais") : "Non modifiable",
    fare.cancellable == null ? null : fare.cancellable ? (fare.refundFee ? "Remboursable avec frais" : "Remboursable") : "Non remboursable",
  ].filter(Boolean);
  const href = partnerBookingUrl(sailing, profile);
  // Couchage imposé dont on ne connaît pas le prix : on n'affiche pas un total qui serait faux.
  const missingCompulsory = fare.cabinCompulsory && !fare.included;
  return (
    <section aria-label="Prix pour votre voyage" className="space-y-2 rounded-2xl border border-border bg-background p-3">
      <div>
        <p className="text-base font-bold leading-snug text-foreground">
          <span className="tabular-nums">
            {missingCompulsory ? "dès " : ""}
            {money(fare.total, fare.currency)}
          </span>{" "}
          <span className="font-semibold">{whoLabel(travellers, profile)}</span>
        </p>
        {fare.included ? (
          <p className="flex items-center gap-1 font-semibold text-foreground">
            <SleepIcon kind={fare.included.kind} />
            {fare.included.label} compris, obligatoire sur ce départ
          </p>
        ) : missingCompulsory ? null : (
          <p className="flex items-center gap-1 text-muted-foreground">
            <Armchair className="size-3.5" aria-hidden />
            Sans couchage réservé
          </p>
        )}
        {!fare.sameSailing ? (
          <p className="text-muted-foreground">Prix du départ de {otherTime}, le moins cher ce jour-là.</p>
        ) : null}
        {conditions.length ? <p className="text-muted-foreground">{conditions.join(" · ")}</p> : null}
      </div>

      {missingCompulsory ? (
        <p className="rounded-lg bg-warning/15 px-2.5 py-1.5 font-semibold text-warning-foreground">
          Un couchage est obligatoire sur ce départ, en plus de ce prix : le total s'affiche à l'étape suivante.
        </p>
      ) : null}

      {fare.options.length ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
            {fare.included ? "Pour plus de confort, en plus" : "Pour dormir à bord, en plus"}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {fare.options.map((option) => (
              <li
                key={option.kind}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1"
              >
                <SleepIcon kind={option.kind} />
                <span className="font-semibold">{option.label}</span>
                <span className="tabular-nums text-muted-foreground">+{money(option.extra, fare.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <a
        href={href}
        onClick={() => {
          track("booking_click", "direct-ferries");
          markBookingLeave(AGGREGATOR.name);
        }}
        className="flex h-11 w-full items-center justify-center rounded-full bg-cta text-sm font-bold text-cta-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98]"
      >
        {missingCompulsory ? "Voir le prix complet" : `Réserver à ${money(fare.total, fare.currency)}`}
      </a>
      <p className="text-center text-[11px] text-muted-foreground">
        {fare.options.length ? "Couchage à choisir à l'étape suivante. " : ""}Prix du moment, il peut évoluer jusqu'au paiement.
      </p>
    </section>
  );
}

function SleepIcon({ kind }: { kind: "seat" | "berth" | "cabin" }) {
  return kind === "seat" ? (
    <Armchair className="size-3.5 shrink-0" aria-hidden />
  ) : (
    <BedDouble className="size-3.5 shrink-0" aria-hidden />
  );
}

function whoLabel(travellers: number, profile: TripProfileValue) {
  const who = travellers > 1 ? `pour vous ${travellers}` : "pour vous";
  if (profile.vehicle === "none") return who;
  const loaded = (profile.load?.extraHeight ?? (profile.accessories.includes("roofbox") ? 50 : 0)) > 0;
  const car = profile.car
    ? `la ${profile.car.model.replace(/\s*\(.*\)$/, "")}`
    : `votre ${VEHICLES.find((item) => item.id === profile.vehicle)?.label.toLowerCase() ?? "voiture"}`;
  return `${who} + ${car}${loaded ? " chargée" : ""}`;
}
