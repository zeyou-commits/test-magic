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
}: {
  departures: {
    id: string;
    departure_at: string;
    route_id: string;
    company_id?: string | null;
    vessel_id?: string | null;
  }[];
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
        <ChevronLeft size={16} aria-hidden /> Retour
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
  const days = new Map<string, { row: (typeof shown)[number]; time: string }[]>();
  for (const row of shown) {
    const departure = departureOf.get(row.id);
    if (!departure) continue;
    const route = routeOf.get(departure.route_id);
    const zone = portTimeZone(ports.find((port) => port.id === route?.departure_port_id));
    const key = dateKeyInZone(departure.departure_at, zone);
    days.set(key, [
      ...(days.get(key) ?? []),
      { row, time: formatDateParts(departure.departure_at, zone).time },
    ]);
  }
  const lines = [...new Map(rows.map((row) => [row.routeId, row.line])).entries()];
  useBackClose(open, () => {
    onOpenChange(false);
    setText("");
  });
  if (!departures.length) return null;
  const close = () => {
    onOpenChange(false);
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
                : ""
          }`}
          // Le champ de recherche ne prend pas le focus : le clavier ne cache pas la liste.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {mode === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle>Bienvenue à bord</DialogTitle>
                <p className="bw-room-picker__intro">
                  Une question avant de partir, ou envie d'échanger avec ceux qui voyagent ?
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
                  <strong>Poser une question</strong>
                  <small>
                    Papiers, TPD, horaires, prix : la réponse de BledWay tout de suite, sinon les
                    bons contacts.
                  </small>
                  <span className="bw-room-picker__choice-go">
                    Chercher une réponse <ArrowRight size={15} aria-hidden />
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
                  <strong>Rejoindre un salon</strong>
                  <small>
                    Les voyageurs d'une traversée, en direct : attente au port, ambiance à bord,
                    arrivée.
                  </small>
                  <span className="bw-room-picker__choice-go">
                    Choisir ma traversée <ArrowRight size={15} aria-hidden />
                  </span>
                </button>
              </div>
            </>
          ) : mode === "questions" ? (
            <>
              <DialogHeader>
                {back}
                <DialogTitle>Une question ?</DialogTitle>
                <p className="bw-room-picker__intro">
                  Les réponses de BledWay d'abord, puis les bons contacts si besoin.
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
          <DialogHeader>
            {back}
            <DialogTitle>{title ?? "Choisir votre traversée"}</DialogTitle>
            <p className="bw-room-picker__intro">
              {intro ?? "Rejoignez le salon des voyageurs de votre bateau."}
            </p>
          </DialogHeader>
          <label className="bw-room-picker__search">
            <Search size={16} aria-hidden />
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Port, date, compagnie ou navire"
              aria-label="Rechercher une traversée"
            />
          </label>
          {present.length > 1 ? (
            <div
              className="bw-room-picker__companies"
              role="group"
              aria-label="Filtrer par compagnie"
            >
              <button type="button" aria-pressed={!companyId} onClick={() => setCompanyId(null)}>
                Toutes
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
          {shown.length ? (
            <div className="bw-room-picker__list">
              {[...days.entries()].map(([key, items]) => (
                <section key={key}>
                  <h3>{dayLabel(key)}</h3>
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
                              afterOverlayClose(() => {
                                onSelect({ type: "departure", id: row.id });
                                enterRoom("crossing", row.id);
                              });
                            }}
                          >
                            <time>{time}</time>
                            <span className="bw-room-picker__what">
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
                                  "Compagnie à confirmer"}
                              </small>
                            </span>
                            {count ? (
                              <b>
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
            <p className="bw-room__empty">Aucune traversée ne correspond.</p>
          )}
          <button
            type="button"
            className="bw-room-picker__ask"
            onClick={() => setMode("questions")}
          >
            <CircleHelp size={16} aria-hidden />
            <span>
              <strong>Une question ?</strong>
              <small>Papiers, horaires, prix… trouvez la réponse tout de suite.</small>
            </span>
          </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
