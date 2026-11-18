import { useEffect, useMemo, useRef, useState } from "react";
import { QuestionHelp } from "@/components/questions/QuestionHelp";
import { afterOverlayClose, useBackClose } from "@/lib/ferry/backStack";
import { enterRoom } from "@/lib/ferry/chat";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, CircleHelp, MessagesSquare, Search } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { formatDateParts, formatDateTime } from "@/lib/ferry/format";
import { dateKeyInZone } from "@/lib/ferry/time";
import { pickerRows, searchRows } from "@/lib/ferry/portPassage";
import { companiesQuery, portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { CompanyBadge } from "./CompanyBadge";
import { portTimeZone } from "@/lib/ferry/time";
import type { Selection } from "@/lib/ferry/types";
import { tr } from "@/lib/i18n";

const supabase = typedSupabase as unknown as SupabaseClient;

/** Le nombre de messages de plusieurs traversées, en une seule demande. */
export function useRoomCounts(ids: string[]) {
  return useQuery({
    queryKey: ["bw-chat", "counts", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bw_chat_counts", {
        p_departures: ids.slice(0, 100),
      });
      if (error) return new Map<string, number>();
      return new Map(
        (data as { departure_id: string; messages: number }[]).map((row) => [
          row.departure_id,
          row.messages,
        ]),
      );
    },
    retry: false,
    staleTime: 60_000,
  });
}

export type RoomPickerDeparture = {
  id: string;
  departure_at: string;
  route_id: string;
  company_id?: string | null;
  vessel_id?: string | null;
  /** Connue : une traversée partie et pas encore arrivée est rangée « En mer en ce moment ». */
  arrival_at?: string | null;
};

/** Un seul bouton Salon : on choisit sa traversée, ou on passe aux questions de la ligne. */
export function RoomPicker({
  departures,
  currentId,
  onSelect,
  open,
  onOpenChange,
  questionsFirst = false,
  start,
  title,
  intro,
  onPick,
}: {
  departures: RoomPickerDeparture[];
  currentId?: string | undefined;
  onSelect: (selection: Selection) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ouvert depuis la tuile Questions : les lignes d'abord. */
  questionsFirst?: boolean;
  /** Par où ouvrir : « choose » propose d'abord question ou salon (nouveaux visiteurs). */
  start?: "salons" | "questions" | "choose" | undefined;
  /** Titre et phrase d'accueil propres (ex. « Les salons en cours » quand on suit une traversée). */
  title?: string | undefined;
  intro?: string | undefined;
  /**
   * Choix d'une traversée : à la place de « fiche + salon », le parent ouvre le salon seul
   * (bouton « Discussions » : rien ne s'ouvre derrière le salon).
   */
  onPick?: ((departure: RoomPickerDeparture) => void) | undefined;
}) {
  const [text, setText] = useState("");
  // Deux faces : les salons, ou « Une question ? » (réponses de BledWay puis bons contacts).
  // Trois faces : le choix (nouveaux visiteurs), les salons, ou « Une question ? ».
  const first = start ?? (questionsFirst ? "questions" : "salons");
  const [mode, setMode] = useState<"choose" | "salons" | "questions">(first);
  useEffect(() => {
    if (open) setMode(first);
  }, [open, first]);
  // Venu du choix : on peut y revenir.
  const back =
    first === "choose" ? (
      <button type="button" className="bw-room-picker__back" onClick={() => setMode("choose")}>
        <ChevronLeft size={16} aria-hidden />{tr("ui.roomPicker.retour")}
      </button>
    ) : null;
  const [companyId, setCompanyId] = useState<string | null>(null);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const ids = departures.map((item) => item.id);
  const counts = useRoomCounts(open ? ids : []);
  // La compagnie et le navire de chaque départ : affichés, et retrouvés par la recherche.
  // Fenêtre fermée, rien n'est affiché : la liste n'est préparée qu'à l'ouverture. Pendant
  // l'animation de fermeture, la dernière liste reste en place.
  const built = useMemo(() => {
    if (!open) return null;
    const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const byId = new Map(departures.map((item) => [item.id, item]));
    return pickerRows(departures, routes, ports, (iso, port) =>
      formatDateTime(iso, portTimeZone(port)),
    ).map((row) => {
      const departure = byId.get(row.id);
      const company = companies.find((item) => item.id === departure?.company_id);
      const vessel = vessels.find((item) => item.id === departure?.vessel_id);
      return {
        ...row,
        company,
        vessel: vessel?.name ?? null,
        search: `${row.search} ${plain(`${company?.name ?? ""} ${vessel?.name ?? ""}`)}`,
      };
    });
  }, [open, departures, routes, ports, companies, vessels]);
  const lastRows = useRef(built ?? []);
  if (built) lastRows.current = built;
  const rows = built ?? lastRows.current;
  // Les compagnies présentes dans la liste, pour filtrer d'un toucher.
  const present = companies.filter((company) => rows.some((row) => row.company?.id === company.id));
  const shown = searchRows(rows, text).filter((row) => !companyId || row.company?.id === companyId);
  // Regroupés par jour, l'heure en avant : on retrouve son bateau d'un coup d'œil.
  const departureOf = new Map(departures.map((item) => [item.id, item]));
  const routeOf = new Map(routes.map((item) => [item.id, item]));
  const dayLabel = (key: string) => {
    const today = dateKeyInZone(new Date().toISOString(), "Europe/Paris");
    const tomorrow = dateKeyInZone(new Date(Date.now() + 86_400_000).toISOString(), "Europe/Paris");
    if (key === today) return "Aujourd'hui";
    if (key === tomorrow) return "Demain";
    const label = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${key}T12:00:00Z`));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  // Les traversées en mer d'abord (leur salon vit en ce moment), puis les départs jour par jour.
  const SEA = "sea";
  const now = Date.now();
  const days = new Map<string, { row: (typeof shown)[number]; time: string }[]>();
  for (const row of shown) {
    const departure = departureOf.get(row.id);
    if (!departure) continue;
    const route = routeOf.get(departure.route_id);
    const zone = portTimeZone(ports.find((port) => port.id === route?.departure_port_id));
    const atSea =
      Date.parse(departure.departure_at) <= now &&
      Boolean(departure.arrival_at && Date.parse(departure.arrival_at) > now);
    const key = atSea ? SEA : dateKeyInZone(departure.departure_at, zone);
    days.set(key, [
      ...(days.get(key) ?? []),
      { row, time: formatDateParts(departure.departure_at, zone).time },
    ]);
  }
  const sections = [...days.entries()].sort(([a], [b]) => (a === SEA ? -1 : b === SEA ? 1 : 0));
  const lines = [...new Map(rows.map((row) => [row.routeId, row.line])).entries()];
  useBackClose(open, () => {
    onOpenChange(false);
    setText("");
  });
  const close = () => {
    onOpenChange(false);
    setText("");
    setCompanyId(null);
  };
  const clearSearch = () => {
    setText("");
    setCompanyId(null);
  };
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <DialogContent
          className={`bw-room-picker${
            mode === "questions"
              ? " bw-room-picker--questions max-w-none"
              : mode === "choose"
                ? " bw-room-picker--choose max-w-none"
                : " bw-room-picker--salons"
          }`}
          // Le champ de recherche ne prend pas le focus : le clavier ne cache pas la liste.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {mode === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle>{tr("ui.roomPicker.bienvenueABord")}</DialogTitle>
                <p className="bw-room-picker__intro">
                  {tr("ui.roomPicker.uneQuestionAvantDePartir")}
                </p>
              </DialogHeader>
              <div className="bw-room-picker__choices">
                <button
                  type="button"
                  className="bw-room-picker__choice"
                  data-kind="question"
                  onClick={() => setMode("questions")}
                >
                  <span className="bw-room-picker__choice-icon" aria-hidden>
                    <CircleHelp size={22} />
                  </span>
                  <strong>{tr("ui.roomPicker.poserUneQuestion")}</strong>
                  <small>
                    {tr("ui.roomPicker.papiersTpdHorairesPrixLa")}
                  </small>
                  <span className="bw-room-picker__choice-go">
                    {tr("ui.roomPicker.chercherUneReponse")}<ArrowRight size={15} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  className="bw-room-picker__choice"
                  data-kind="salon"
                  onClick={() => setMode("salons")}
                >
                  <span className="bw-room-picker__choice-icon" aria-hidden>
                    <MessagesSquare size={22} />
                  </span>
                  <strong>{tr("ui.roomPicker.rejoindreUnSalon")}</strong>
                  <small>
                    {tr("ui.roomPicker.lesVoyageursDUneTraversee")}
                  </small>
                  <span className="bw-room-picker__choice-go">
                    {tr("ui.roomPicker.choisirMaTraversee")}<ArrowRight size={15} aria-hidden />
                  </span>
                </button>
              </div>
            </>
          ) : mode === "questions" ? (
            <>
              <DialogHeader>
                {back}
                <DialogTitle>{tr("ui.roomPicker.uneQuestion")}</DialogTitle>
                <p className="bw-room-picker__intro">
                  {tr("ui.roomPicker.lesReponsesDeBledwayD")}
                </p>
              </DialogHeader>
              <div className="bw-room-picker__help">
                <QuestionHelp
                  bare
                  routeId={lines.length === 1 ? lines[0]![0] : undefined}
                  onAskTravellers={() => setMode("salons")}
                  travellersHint="Choisissez votre traversée : ses voyageurs répondent dans le salon."
                />
              </div>
            </>
          ) : (
            <>
          {/* À quoi sert la fenêtre, avant la liste : un titre, une phrase, puis la recherche. */}
          <DialogHeader className="bw-room-picker__head">
            {back}
            <div className="bw-room-picker__hero">
              <span className="bw-room-picker__hero-icon" aria-hidden>
                <MessagesSquare size={20} />
              </span>
              <div>
                <DialogTitle>{title ?? tr("ui.roomPicker.discussionsEntrePassagers")}</DialogTitle>
                <p className="bw-room-picker__intro">
                  {intro ?? tr("ui.roomPicker.choisissezVotreTraverseePourRejoindre")}
                </p>
              </div>
            </div>
          </DialogHeader>
          {departures.length ? (
            <label className="bw-room-picker__search">
              <Search size={16} aria-hidden />
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={tr("ui.roomPicker.portDateCompagnieOuNavire")}
                aria-label={tr("ui.roomPicker.rechercherUneTraversee")}
              />
            </label>
          ) : null}
          {present.length > 1 ? (
            <div
              className="bw-room-picker__companies"
              role="group"
              aria-label={tr("ui.roomPicker.filtrerParCompagnie")}
            >
              <button type="button" aria-pressed={!companyId} onClick={() => setCompanyId(null)}>
                {tr("ui.roomPicker.toutes")}
              </button>
              {present.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  aria-pressed={companyId === company.id}
                  onClick={() => setCompanyId(companyId === company.id ? null : company.id)}
                >
                  <CompanyBadge name={company.name} logoUrl={company.logo_url} size={18} />
                  {company.name}
                </button>
              ))}
            </div>
          ) : null}
          {!departures.length ? (
            <div className="bw-room-picker__empty" role="status">
              <span className="bw-room-picker__empty-icon" aria-hidden>
                <MessagesSquare size={22} />
              </span>
              <strong>{tr("ui.roomPicker.aucuneTraverseeEnCours")}</strong>
              <p>{tr("ui.roomPicker.lesSalonsOuvrentAvecLes")}</p>
            </div>
          ) : shown.length ? (
            <div className="bw-room-picker__list">
              {sections.map(([key, items]) => (
                <section key={key} data-sea={key === SEA || undefined}>
                  <h3>
                    {key === SEA ? tr("ui.roomPicker.enMerEnCeMoment") : dayLabel(key)}
                    <small>
                      {items.length > 1
                        ? tr("ui.roomPicker.nTraversees", { n: items.length })
                        : tr("ui.roomPicker.uneTraversee")}
                    </small>
                  </h3>
                  <ul>
                    {items.map(({ row, time }) => {
                      const count = counts.data?.get(row.id) ?? 0;
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            aria-current={row.id === currentId || undefined}
                            onClick={() => {
                              close();
                              const picked = departureOf.get(row.id);
                              afterOverlayClose(() => {
                                if (onPick && picked) {
                                  onPick(picked);
                                  return;
                                }
                                onSelect({ type: "departure", id: row.id });
                                enterRoom("crossing", row.id);
                              });
                            }}
                          >
                            <time>{time}</time>
                            <span className="bw-room-picker__what">
                              {row.id === currentId ? (
                                <em className="bw-room-picker__mine">
                                  {tr("ui.roomPicker.votreTraversee")}
                                </em>
                              ) : null}
                              <strong>{row.line}</strong>
                              <small>
                                {row.company ? (
                                  <CompanyBadge
                                    name={row.company.name}
                                    logoUrl={row.company.logo_url}
                                    size={14}
                                  />
                                ) : null}
                                {[row.company?.name, row.vessel].filter(Boolean).join(" · ") ||
                                  tr("ui.roomPicker.compagnieAConfirmer")}
                              </small>
                            </span>
                            {count ? (
                              <b aria-label={tr("ui.roomPicker.nMessages", { n: count })}>
                                <MessagesSquare size={12} aria-hidden /> {count}
                              </b>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="bw-room-picker__empty" role="status">
              <span className="bw-room-picker__empty-icon" aria-hidden>
                <Search size={22} />
              </span>
              <strong>
                {text.trim()
                  ? tr("ui.roomPicker.aucuneTraverseePour", { q: text.trim() })
                  : tr("ui.roomPicker.aucuneTraverseeNeCorrespond")}
              </strong>
              <p>{tr("ui.roomPicker.essayezUnPortUneDate")}</p>
              <button type="button" onClick={clearSearch}>
                {tr("ui.roomPicker.effacerLaRecherche")}
              </button>
            </div>
          )}
          <button
            type="button"
            className="bw-room-picker__ask"
            onClick={() => setMode("questions")}
          >
            <CircleHelp size={16} aria-hidden />
            <span>
              <strong>{tr("ui.roomPicker.uneQuestion")}</strong>
              <small>{tr("ui.roomPicker.papiersHorairesPrixTrouvezLa")}</small>
            </span>
          </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
