import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, CircleAlert, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TicketImport } from "@/components/tickets/TicketImport";
import { useReturnDepartures } from "@/lib/ferry/journey";
import { companiesQuery, portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";
import type { TravelAction } from "@/lib/notifications/actions";
import { tr } from "@/lib/i18n";

type Follow = Extract<TravelAction, { type: "follow" }>;
type Purpose = "voyageur" | "proche" | "curieux";
type Row = {
  id: string;
  departure_at: string;
  arrival_at?: string | null;
  route_id: string;
  company_id?: string | null;
  vessel_id?: string | null;
  reliability?: string | null;
};

/**
 * « Suivre mon voyage » en un seul écran (07/11/2026) :
 * - je voyage (choisi d'office), un proche, ou par curiosité ;
 * - la traversée regardée est cochée, les autres dates de la ligne en pastilles juste à côté ;
 * - aller ou retour déduit du sens de la ligne (Europe → Algérie = aller), inversable en un tap ;
 * - le retour, facultatif, sur le même écran (« Plus tard » par défaut) ;
 * - un seul bouton. Le billet reste une option en haut, et revient après l'enregistrement.
 */
export function TripQuestion({
  action,
  onAnswer,
  onDone,
}: {
  action: Follow;
  onAnswer: (next: Follow) => void;
  /** Billet enregistré : tout est rempli, on ferme. */
  onDone?: (() => void) | undefined;
}) {
  const { user } = useAuth();
  const [purpose, setPurpose] = useState<Purpose>("voyageur");
  const [chosen, setChosen] = useState<string | null>(null);
  const [chosenReturn, setChosenReturn] = useState<string | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [ticket, setTicket] = useState(false);
  const [contextDeparture] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("select") === "departure" ? params.get("id") : null;
  });
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);

  // La traversée d'où l'on vient (même déjà en mer).
  const own = useQuery({
    queryKey: ["trip-question-departure", action.targetId],
    enabled: action.kind === "departure",
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("departures")
        .select("id,departure_at,arrival_at,route_id,company_id,vessel_id,reliability")
        .eq("id", action.targetId)
        .maybeSingle();
      return (data as Row | null) ?? null;
    },
  });
  // Les dates possibles : même ligne (cœur d'une traversée) ou même navire (cœur d'un navire).
  const dates = useQuery({
    queryKey: ["trip-question-dates", action.kind, action.targetId, own.data?.route_id],
    enabled: action.kind === "vessel" || Boolean(own.data),
    queryFn: async () => {
      let query = supabase
        .from("departures")
        .select("id,departure_at,arrival_at,route_id,company_id,vessel_id,reliability")
        .neq("status", "cancelled")
        .eq("is_demo", false)
        .gte("departure_at", new Date(Date.now() - 12 * 3_600_000).toISOString());
      query =
        action.kind === "vessel"
          ? query.eq("vessel_id", action.targetId)
          : query.eq("route_id", own.data!.route_id);
      const { data, error } = await query.order("departure_at").limit(14);
      if (error) throw error;
      const list = (data ?? []) as Row[];
      const mine = own.data;
      return mine && !list.some((item) => item.id === mine.id)
        ? [mine, ...list].sort((a, b) => Date.parse(a.departure_at) - Date.parse(b.departure_at))
        : list;
    },
  });
  const all = useMemo(() => dates.data ?? [], [dates.data]);
  const preset = action.kind === "departure" ? action.targetId : contextDeparture;
  useEffect(() => {
    if (chosen || !all.length) return;
    setChosen((all.find((item) => item.id === preset) ?? all[0]!).id);
  }, [all, chosen, preset]);
  const picked = all.find((item) => item.id === chosen);

  const portOf = (id?: string | null) => ports.find((port) => port.id === id);
  const routeOf = (row?: Row) => routes.find((route) => route.id === row?.route_id);
  const route = routeOf(picked);
  const from = portOf(route?.departure_port_id);
  const to = portOf(route?.arrival_port_id);
  // Europe → Algérie : le plus souvent l'aller ; Algérie → Europe : le retour.
  const naturalLeg: "outbound" | "inbound" =
    from?.country_code === "DZ" && to?.country_code !== "DZ" ? "inbound" : "outbound";
  const leg = swapped ? (naturalLeg === "outbound" ? "inbound" : "outbound") : naturalLeg;

  const returns = useReturnDepartures(
    purpose === "voyageur" && leg === "outbound" ? (chosen ?? null) : null,
    "",
    "",
    true,
  );
  // Un retour choisi qui n'existe plus (autre aller choisi) est oublié.
  useEffect(() => {
    if (chosenReturn && returns.data && !returns.data.some((item) => item.id === chosenReturn))
      setChosenReturn(null);
  }, [returns.data, chosenReturn]);

  const alert = useVesselAlert(
    picked?.vessel_id ?? (action.kind === "vessel" ? action.targetId : undefined),
  );
  const label = from && to ? `${from.name} → ${to.name}` : action.label;
  const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const pill = (iso: string, tz: string) => ({
    day: upper(new Intl.DateTimeFormat("fr-FR", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(iso))),
    time: new Intl.DateTimeFormat("fr-FR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso)),
  });

  if (ticket)
    return (
      <TicketImport
        open
        onOpenChange={(value) => {
          if (!value) setTicket(false);
        }}
        onSaved={onDone}
      />
    );

  const submit = () => {
    if (purpose === "curieux") {
      onAnswer({ ...action, traveller: false, purpose: "curieux" });
      return;
    }
    if (!chosen) return;
    // Toujours la traversée choisie (même venue d'un navire ou d'une autre date).
    const target = { kind: "departure" as const, targetId: chosen, label };
    if (purpose === "proche") {
      onAnswer({ ...action, ...target, traveller: false, purpose: "proche" });
      return;
    }
    onAnswer({
      ...action,
      ...(action.kind === "departure" ? target : { departureId: chosen }),
      traveller: true,
      purpose: "voyageur",
      journeyLeg: leg,
      ...(leg === "outbound" && chosenReturn ? { returnDepartureId: chosenReturn } : {}),
    });
  };

  const company = companies.find((item) => item.id === picked?.company_id)?.name;
  const vessel = vessels.find((item) => item.id === picked?.vessel_id)?.name;
  const arrival = picked?.arrival_at ? pill(picked.arrival_at, portTimeZone(to)) : null;
  const chosenReturnRow = returns.data?.find((entry) => entry.id === chosenReturn);

  return (
    <div className="bw-trip-one">
      {alert ? (
        <p role="alert" className="bw-trip-question__alert">
          <CircleAlert size={16} aria-hidden />
          <span>
            <strong>{alert.label}.</strong>{tr("ui.tripQuestion.verifiezAupresDeLaCompagnie")}
          </span>
        </p>
      ) : null}

      <div className="bw-trip-one__purpose" role="radiogroup" aria-label={tr("ui.tripQuestion.pourquoiSuivre")}>
        {(
          [
            ["voyageur", "Je voyage"],
            ["proche", "Un proche"],
            ["curieux", "Par curiosité"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={purpose === id}
            onClick={() => setPurpose(id)}
          >
            {text}
          </button>
        ))}
      </div>

      {purpose === "voyageur" && user ? (
        <button type="button" className="bw-trip-one__ticket" onClick={() => setTicket(true)}>
          <Ticket size={18} aria-hidden />
          <span>
            {tr("ui.tripQuestion.vousAvezVotreBillet")}<b>{tr("ui.tripQuestion.scannerToutSeRemplit")}</b>
          </span>
        </button>
      ) : null}

      {purpose === "curieux" ? (
        <p className="bw-trip-one__note">
          {action.kind === "vessel"
            ? tr("ui.tripQuestion.leNavireEtSesProchaines")
            : tr("ui.tripQuestion.lesInformationsDeCetteTraversee")}
        </p>
      ) : (
        <section className="bw-trip-one__block" aria-label={tr("ui.tripQuestion.traversee")}>
          <div className="bw-trip-one__head">
            <strong>
              {purpose === "proche" ? tr("ui.tripQuestion.saTraversee") : leg === "outbound" ? tr("ui.tripQuestion.aller") : tr("ui.tripQuestion.retour")}
              {label ? ` · ${label}` : ""}
            </strong>
            {purpose === "voyageur" && picked ? (
              <button type="button" onClick={() => setSwapped(!swapped)}>
                <ArrowLeftRight size={13} aria-hidden />{tr("ui.tripQuestion.cEstMon")}{" "}
                {leg === "outbound" ? "retour" : "aller"}
              </button>
            ) : null}
          </div>
          {dates.isPending || (action.kind === "departure" && own.isPending) ? (
            <p className="bw-trip-one__note">{tr("ui.tripQuestion.rechercheDesDeparts")}</p>
          ) : !all.length ? (
            <p className="bw-trip-one__note">{tr("ui.tripQuestion.aucunDepartPubliePourLe")}</p>
          ) : (
            <div className="bw-trip-one__pills" role="radiogroup" aria-label={tr("ui.tripQuestion.dateDeLaTraversee")}>
              {all.map((item) => {
                const p = pill(
                  item.departure_at,
                  portTimeZone(portOf(routeOf(item)?.departure_port_id)),
                );
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={chosen === item.id}
                    onClick={() => setChosen(item.id)}
                  >
                    <b>{p.day}</b>
                    {p.time}
                    {item.reliability === "to_verify" ? <i>{tr("ui.tripQuestion.estime")}</i> : null}
                  </button>
                );
              })}
            </div>
          )}
          {picked ? (
            <p className="bw-trip-one__detail">
              {[company, vessel].filter(Boolean).join(" · ") || tr("ui.tripQuestion.compagnieAConfirmer")}
              {arrival ? ` · arrivée ${arrival.day} à ${arrival.time}` : ""}
            </p>
          ) : null}
        </section>
      )}

      {purpose === "voyageur" && leg === "outbound" && picked ? (
        <section className="bw-trip-one__block" aria-label={tr("ui.tripQuestion.retour")}>
          <div className="bw-trip-one__head">
            <strong>
              {tr("ui.tripQuestion.retour2")}<small>{tr("ui.tripQuestion.facultatif")}</small>
            </strong>
          </div>
          <div className="bw-trip-one__pills" role="radiogroup" aria-label={tr("ui.tripQuestion.dateDuRetour")}>
            <button
              type="button"
              role="radio"
              aria-checked={!chosenReturn}
              onClick={() => setChosenReturn(null)}
            >
              <b>{tr("ui.tripQuestion.plusTard")}</b>
              {tr("ui.tripQuestion.sansDate")}
            </button>
            {(returns.data ?? []).slice(0, 20).map((item) => {
              const p = pill(item.departure_at, portTimeZone({ country_code: item.from_country_code }));
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={chosenReturn === item.id}
                  onClick={() => setChosenReturn(item.id)}
                >
                  <b>{p.day}</b>
                  {p.time}
                </button>
              );
            })}
          </div>
          <p className="bw-trip-one__detail">
            {chosenReturnRow
              ? `${chosenReturnRow.from_name} → ${chosenReturnRow.to_name} · ${[chosenReturnRow.company_name, chosenReturnRow.vessel_name].filter(Boolean).join(" · ")}`
              : returns.isPending
                ? tr("ui.tripQuestion.rechercheDesRetours")
                : !returns.data?.length
                  ? tr("ui.tripQuestion.pasEncoreDeRetourPublie")
                  : tr("ui.tripQuestion.vousPourrezAussiLAjouter")}
          </p>
        </section>
      ) : null}

      <button
        type="button"
        className="bw-action-primary w-full"
        disabled={purpose !== "curieux" && !chosen}
        onClick={submit}
      >
        {purpose === "curieux"
          ? action.kind === "vessel"
            ? tr("ui.tripQuestion.suivreCeNavire")
            : tr("ui.tripQuestion.suivreCetteTraversee")
          : purpose === "proche"
            ? tr("ui.tripQuestion.suivreSaTraversee")
            : leg === "inbound"
              ? tr("ui.tripQuestion.suivreMonRetour")
              : chosenReturn
                ? tr("ui.tripQuestion.suivreLAllerEtLe")
                : tr("ui.tripQuestion.suivreMonAller")}
      </button>
    </div>
  );
}
