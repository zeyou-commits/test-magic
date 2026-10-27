import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Anchor,
  Ban,
  Bell,
  CalendarClock,
  Check,
  Clock,
  FileCheck2,
  Globe,
  History,
  LoaderCircle,
  Moon,
  Newspaper,
  PenLine,
  Pencil,
  Route as RouteIcon,
  Search,
  Send,
  Ship,
  Smartphone,
  TrafficCone,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { adminPortsQuery, adminRoutesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { dateKeyInZone, portTimeZone, zonedTimeToUtc } from "@/lib/ferry/time";
import type { Departure } from "@/lib/ferry/types";
import {
  adminMessagesQuery,
  audiencePreviewQuery,
  BODY_MAX,
  BODY_SHOWN,
  flashByDefault,
  inQuietHours,
  MESSAGE_PREFILL_EVENT,
  messageAction,
  takeMessagePrefill,
  templateIds,
  templateLabels,
  templateText,
  TITLE_MAX,
  TITLE_SHOWN,
  type AdminMessage,
  type Audience,
  type AudienceKind,
  type TemplateFields,
  type TemplateId,
} from "@/lib/notifications/messages";

const PARIS = "Europe/Paris";
const kinds: { id: AudienceKind; label: string; hint: string; icon: LucideIcon }[] = [
  {
    id: "departure",
    label: "Une traversée",
    hint: "Voyageurs et proches qui la suivent",
    icon: Ship,
  },
  {
    id: "port_day",
    label: "Un port, un jour",
    hint: "Tous les départs du port ce jour-là",
    icon: Anchor,
  },
  { id: "vessel", label: "Un bateau", hint: "Ses suivis et ses traversées à venir", icon: Ship },
  {
    id: "route",
    label: "Une ligne",
    hint: "Traversées suivies et alertes d’ouverture",
    icon: RouteIcon,
  },
  { id: "all", label: "Tout le monde", hint: "Chaque compte BledWay", icon: Globe },
];
const templateIcons: Record<TemplateId, LucideIcon> = {
  delay: Clock,
  cancel: Ban,
  reschedule: CalendarClock,
  port_access: TrafficCone,
  documents: FileCheck2,
  free: PenLine,
};
const emptyFields: TemplateFields = { minutes: "", newTime: "", oldTime: "" };
const fmtDay = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(iso));
const fmtTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
const parisLabel = (iso: string) => `${fmtDay(iso, PARIS)} à ${fmtTime(iso, PARIS)}`;
function tomorrowAt(hour: string) {
  const today = dateKeyInZone(new Date(), PARIS);
  const next = new Date(zonedTimeToUtc(today, "12:00", PARIS).getTime() + 86_400_000);
  return { date: dateKeyInZone(next, PARIS), time: hour };
}
/** Prochain 7 h à Paris (fin des heures calmes). */
function nextMorning() {
  const today = dateKeyInZone(new Date(), PARIS);
  const seven = zonedTimeToUtc(today, "07:00", PARIS);
  return seven.getTime() > Date.now() ? { date: today, time: "07:00" } : tomorrowAt("07:00");
}

/** Départs des 3 prochaines semaines (et ceux partis depuis moins de 12 h), pour choisir la cible. */
const composerDeparturesQuery = {
  queryKey: ["admin", "message-departures"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("departures")
      .select("id,route_id,vessel_id,departure_at,status")
      .gte("departure_at", new Date(Date.now() - 12 * 3_600_000).toISOString())
      .lt("departure_at", new Date(Date.now() + 21 * 86_400_000).toISOString())
      .eq("is_demo", false)
      .order("departure_at")
      .limit(1500);
    if (error) throw new Error(error.message);
    return (data ?? []) as Pick<
      Departure,
      "id" | "route_id" | "vessel_id" | "departure_at" | "status"
    >[];
  },
  staleTime: 60_000,
};

/** Centre des messages : rédiger, vérifier les destinataires, envoyer ou planifier, puis suivre. */
export function MessageCenter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const composerRef = useRef<HTMLElement>(null);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: departures = [] } = useQuery(composerDeparturesQuery);
  const history = useQuery(adminMessagesQuery(user?.id));

  const [kind, setKind] = useState<AudienceKind>("departure");
  const [departureId, setDepartureId] = useState("");
  const [who, setWho] = useState<"everyone" | "travellers">("everyone");
  const [search, setSearch] = useState("");
  const [vesselId, setVesselId] = useState("");
  const [portId, setPortId] = useState("");
  const [day, setDay] = useState(() => dateKeyInZone(new Date(), PARIS));
  const [routeId, setRouteId] = useState("");
  const [template, setTemplate] = useState<TemplateId | null>(null);
  const [fields, setFields] = useState<TemplateFields>(emptyFields);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState(false);
  const [flash, setFlash] = useState(false);
  const [flashTouched, setFlashTouched] = useState(false);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [later, setLater] = useState(() => tomorrowAt("08:00"));
  const [replaces, setReplaces] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "?";
  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const vesselName = (id: string | null) =>
    id ? vessels.find((v) => v.id === id)?.name : undefined;
  const departureLabel = (departure: (typeof departures)[number]) => {
    const route = routeById.get(departure.route_id);
    const zone = portTimeZone(ports.find((port) => port.id === route?.departure_port_id));
    return {
      day: fmtDay(departure.departure_at, zone),
      time: fmtTime(departure.departure_at, zone),
      line: route
        ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`
        : "Ligne ?",
      vessel: vesselName(departure.vessel_id),
    };
  };
  const matches = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return departures
      .filter((departure) => {
        if (!words.length) return true;
        const label = departureLabel(departure);
        const text = `${label.day} ${label.time} ${label.line} ${label.vessel ?? ""}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departures, search, routes, ports, vessels]);

  const audience: Audience | null =
    kind === "departure"
      ? departureId
        ? { kind, departureId, who }
        : null
      : kind === "vessel"
        ? vesselId
          ? { kind, vesselId }
          : null
        : kind === "port_day"
          ? portId && day
            ? { kind, portId, date: day }
            : null
          : kind === "route"
            ? routeId
              ? { kind, routeId }
              : null
            : { kind: "all" };
  const preview = useQuery(audiencePreviewQuery(user?.id, audience));
  const context = preview.data?.context;

  // Le texte suit le modèle et la cible tant que l'admin ne l'a pas réécrit.
  useEffect(() => {
    if (touched || !template || !context) return;
    const text = templateText(template, context, fields);
    setTitle(text.title);
    setBody(text.body);
  }, [template, context, fields, touched]);
  useEffect(() => {
    if (!flashTouched && template) setFlash(flashByDefault.has(template) && kind !== "all");
  }, [template, kind, flashTouched]);

  // « Prévenir les voyageurs » depuis une autre rubrique : on arrive avec la cible et le modèle choisis.
  useEffect(() => {
    const apply = () => {
      const prefill = takeMessagePrefill();
      if (!prefill) return;
      reset();
      const target = prefill.audience;
      setKind(target.kind);
      if (target.kind === "departure") {
        setDepartureId(target.departureId);
        setWho(target.who);
      }
      if (target.kind === "vessel") setVesselId(target.vesselId);
      if (target.kind === "port_day") {
        setPortId(target.portId);
        setDay(target.date);
      }
      if (target.kind === "route") setRouteId(target.routeId);
      setTemplate(prefill.template);
      setFields({ ...emptyFields, ...prefill.fields });
      requestAnimationFrame(() =>
        composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    };
    apply();
    window.addEventListener(MESSAGE_PREFILL_EVENT, apply);
    return () => window.removeEventListener(MESSAGE_PREFILL_EVENT, apply);
  }, []);

  function reset() {
    setDepartureId("");
    setSearch("");
    setVesselId("");
    setPortId("");
    setRouteId("");
    setTemplate(null);
    setFields(emptyFields);
    setTitle("");
    setBody("");
    setTouched(false);
    setFlash(false);
    setFlashTouched(false);
    setWhen("now");
    setLater(tomorrowAt("08:00"));
    setReplaces(null);
    setTyped("");
  }
  function edit(message: AdminMessage) {
    reset();
    const target = message.audience;
    setKind(target.kind);
    if (target.kind === "departure") {
      setDepartureId(target.departureId);
      setWho(target.who);
    }
    if (target.kind === "vessel") setVesselId(target.vesselId);
    if (target.kind === "port_day") {
      setPortId(target.portId);
      setDay(target.date);
    }
    if (target.kind === "route") setRouteId(target.routeId);
    setTemplate(message.template);
    setTitle(message.title);
    setBody(message.body);
    setTouched(true);
    setFlash(Boolean(message.news_id));
    setFlashTouched(true);
    setWhen("later");
    setLater({
      date: dateKeyInZone(message.scheduled_at, PARIS),
      time: fmtTime(message.scheduled_at, PARIS),
    });
    setReplaces(message.id);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const sendAt =
    when === "later" && later.date && later.time
      ? zonedTimeToUtc(later.date, later.time, PARIS)
      : null;
  const sendDate = sendAt ?? new Date();
  const quiet = inQuietHours(sendDate);
  const tooSoon = sendAt !== null && sendAt.getTime() < Date.now() + 2 * 60_000;
  const reachable = preview.data?.reachable ?? 0;
  const ready = Boolean(
    audience &&
    template &&
    title.trim().length >= 4 &&
    body.trim().length >= 4 &&
    reachable > 0 &&
    !tooSoon,
  );
  const blocker = !audience
    ? "Choisissez qui prévenir."
    : preview.isPending
      ? "Calcul des destinataires…"
      : preview.data && !reachable
        ? "Personne à prévenir pour cette cible."
        : !template
          ? "Choisissez un modèle de message."
          : title.trim().length < 4 || body.trim().length < 4
            ? "Complétez le titre et le texte."
            : tooSoon
              ? "Choisissez une heure dans au moins 2 minutes."
              : "";

  const create = useMutation({
    mutationFn: () =>
      messageAction<{
        sent?: boolean;
        scheduled?: boolean;
        at?: string;
        pushed?: number;
        reachable: number;
        schedulerActive?: boolean;
        flashSkipped?: boolean;
      }>({
        action: "message-create",
        audience,
        template,
        title: title.trim(),
        body: body.trim(),
        url: context?.url ?? "/",
        sendAt: sendAt ? sendAt.toISOString() : null,
        flash,
        ...(kind === "all" ? { confirmCount: Number(typed) } : {}),
        ...(replaces ? { replaces } : {}),
      }),
    onSuccess: (data) => {
      const accounts = `${data.reachable} compte${data.reachable > 1 ? "s" : ""}`;
      if (data.scheduled)
        toast.success(`Message planifié ${parisLabel(data.at!)} pour ${accounts}.`, {
          description: data.schedulerActive
            ? undefined
            : "L’envoi automatique n’est pas encore actif : il partira au passage du matin.",
        });
      else
        toast.success(`Message envoyé à ${accounts}.`, {
          description: `${data.pushed ?? 0} alerte(s) parties sur les téléphones, les autres le verront dans la cloche.`,
        });
      if (data.flashSkipped)
        toast.warning("Le Flash info n’a pas pu être publié : le message est parti seul.");
      setConfirming(false);
      reset();
      void queryClient.invalidateQueries({ queryKey: ["admin", "messages"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "notification-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "message-audience"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedDeparture = departures.find((departure) => departure.id === departureId);
  const counts = preview.data;
  return (
    <div className="space-y-5">
      {history.data && !history.data.ready ? (
        <p className="bw-msg-warning" role="status">
          <TriangleAlert size={16} aria-hidden /> Pour envoyer des messages, exécutez d’abord le
          script <code>20261104120000_messages_admin.sql</code> dans Supabase.
        </p>
      ) : null}
      <section ref={composerRef} className="bw-admin-surface bw-msg">
        <div className="bw-admin-section-heading">
          <div>
            <span className="bw-account-kicker">
              {replaces ? "Modifier un message planifié" : "Nouveau message"}
            </span>
            <h2>Prévenir les voyageurs</h2>
            <p>
              Choisissez la cible, partez d’un modèle, vérifiez l’aperçu, puis envoyez ou planifiez.
            </p>
          </div>
          {replaces || template || audience ? (
            <button type="button" className="bw-action-secondary" onClick={reset}>
              <X className="size-4" /> {replaces ? "Abandonner la modification" : "Tout effacer"}
            </button>
          ) : null}
        </div>
        <div className="bw-msg__layout">
          <div className="bw-msg__form">
            {/* 1. Qui prévenir */}
            <fieldset className="bw-msg__step">
              <legend>
                <span>1</span> Qui prévenir ?
              </legend>
              <div className="bw-msg__kinds" role="radiogroup" aria-label="Cible">
                {kinds.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={kind === item.id}
                    className="bw-msg__kind"
                    onClick={() => setKind(item.id)}
                  >
                    <item.icon size={18} aria-hidden />
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </button>
                ))}
              </div>
              {kind === "departure" ? (
                selectedDeparture ? (
                  <div className="bw-msg__picked">
                    <Ship size={16} aria-hidden />
                    <span>
                      <strong>{departureLabel(selectedDeparture).line}</strong>
                      <small>
                        {departureLabel(selectedDeparture).day} à{" "}
                        {departureLabel(selectedDeparture).time}
                        {departureLabel(selectedDeparture).vessel
                          ? ` · ${departureLabel(selectedDeparture).vessel}`
                          : ""}
                        {selectedDeparture.status === "cancelled" ? " · annulée" : ""}
                      </small>
                    </span>
                    <button type="button" onClick={() => setDepartureId("")}>
                      Changer
                    </button>
                  </div>
                ) : (
                  <div className="bw-msg__search">
                    <label className="bw-msg__searchbox">
                      <Search size={16} aria-hidden />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Port, bateau ou jour : « Alger », « Tassili », « 4 nov »…"
                        aria-label="Chercher une traversée"
                      />
                    </label>
                    <ul>
                      {matches.map((departure) => {
                        const label = departureLabel(departure);
                        return (
                          <li key={departure.id}>
                            <button type="button" onClick={() => setDepartureId(departure.id)}>
                              <span className="bw-msg__date">
                                {label.day}
                                <strong>{label.time}</strong>
                              </span>
                              <span>
                                <strong>{label.line}</strong>
                                <small>
                                  {label.vessel ?? "Bateau à confirmer"}
                                  {departure.status === "cancelled" ? " · annulée" : ""}
                                </small>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                      {!matches.length ? (
                        <li className="bw-msg__none">Aucune traversée dans les 3 semaines.</li>
                      ) : null}
                    </ul>
                  </div>
                )
              ) : null}
              {kind === "departure" && departureId ? (
                <div className="bw-msg__seg" role="radiogroup" aria-label="Destinataires">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={who === "everyone"}
                    onClick={() => setWho("everyone")}
                  >
                    Voyageurs et proches
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={who === "travellers"}
                    onClick={() => setWho("travellers")}
                  >
                    Voyageurs seulement
                  </button>
                </div>
              ) : null}
              {kind === "vessel" ? (
                <select
                  className="bw-msg__select"
                  value={vesselId}
                  onChange={(e) => setVesselId(e.target.value)}
                  aria-label="Bateau"
                >
                  <option value="">Choisir un bateau…</option>
                  {vessels.map((vessel) => (
                    <option key={vessel.id} value={vessel.id}>
                      {vessel.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {kind === "port_day" ? (
                <div className="bw-msg__row">
                  <select
                    className="bw-msg__select"
                    value={portId}
                    onChange={(e) => setPortId(e.target.value)}
                    aria-label="Port de départ"
                  >
                    <option value="">Choisir un port de départ…</option>
                    {ports.map((port) => (
                      <option key={port.id} value={port.id}>
                        {port.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="bw-msg__select"
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    aria-label="Jour"
                  />
                </div>
              ) : null}
              {kind === "route" ? (
                <select
                  className="bw-msg__select"
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  aria-label="Ligne"
                >
                  <option value="">Choisir une ligne…</option>
                  {[...routes]
                    .map((route) => ({
                      id: route.id,
                      label: `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`,
                    }))
                    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
                    .map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.label}
                      </option>
                    ))}
                </select>
              ) : null}
              {kind === "all" ? (
                <p className="bw-msg__warning">
                  <TriangleAlert size={16} aria-hidden /> À réserver aux annonces importantes :
                  chaque compte le recevra. Il faudra taper le nombre de destinataires pour
                  confirmer.
                </p>
              ) : null}
              {audience ? (
                <div className="bw-msg__count" aria-live="polite">
                  {preview.isPending ? (
                    <p>
                      <LoaderCircle size={16} className="animate-spin" aria-hidden /> Calcul des
                      destinataires…
                    </p>
                  ) : preview.error ? (
                    <p className="text-destructive">{preview.error.message}</p>
                  ) : counts ? (
                    <>
                      <p className="bw-msg__count-main">
                        <Users size={18} aria-hidden />
                        <strong>{counts.reachable}</strong> compte{counts.reachable > 1 ? "s" : ""}{" "}
                        à prévenir
                      </p>
                      <ul>
                        {counts.travellers !== null && counts.accounts ? (
                          <li>
                            {counts.travellers} voyageur{counts.travellers > 1 ? "s" : ""} ·{" "}
                            {counts.relatives} proche
                            {(counts.relatives ?? 0) > 1 ? "s" : ""}
                          </li>
                        ) : null}
                        <li>
                          <Smartphone size={14} aria-hidden /> {counts.devices} téléphone
                          {counts.devices > 1 ? "s" : ""} recevr{counts.devices > 1 ? "ont" : "a"}{" "}
                          l’alerte ; tous le verront dans la cloche
                        </li>
                        {counts.accounts > counts.reachable ? (
                          <li>
                            {counts.accounts - counts.reachable} compte(s) ont désactivé ce type de
                            message : ils sont exclus
                          </li>
                        ) : null}
                        {!counts.accounts ? <li>Personne ne suit encore cette cible.</li> : null}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}
            </fieldset>

            {/* 2. Quel message */}
            <fieldset className="bw-msg__step">
              <legend>
                <span>2</span> Quel message ?
              </legend>
              <div className="bw-msg__templates">
                {templateIds.map((id) => {
                  const Icon = templateIcons[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={template === id}
                      onClick={() => {
                        setTemplate(id);
                        setTouched(false);
                      }}
                    >
                      <Icon size={16} aria-hidden /> {templateLabels[id]}
                    </button>
                  );
                })}
              </div>
              {template === "delay" ? (
                <div className="bw-msg__row">
                  <label className="bw-msg__field">
                    Retard annoncé (minutes)
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={fields.minutes}
                      onChange={(e) => setFields({ ...fields, minutes: e.target.value })}
                    />
                  </label>
                  <div className="bw-msg__quick">
                    {["30", "60", "120", "180"].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFields({ ...fields, minutes: value })}
                      >
                        {Number(value) >= 60 ? `${Number(value) / 60} h` : `${value} min`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {template === "reschedule" ? (
                <label className="bw-msg__field">
                  Nouvelle heure de départ (heure du port)
                  <input
                    type="time"
                    value={fields.newTime}
                    onChange={(e) => setFields({ ...fields, newTime: e.target.value })}
                  />
                </label>
              ) : null}
              {template ? (
                <>
                  <label className="bw-msg__field">
                    <span className="bw-msg__label">
                      Titre
                      <Counter value={title} shown={TITLE_SHOWN} max={TITLE_MAX} />
                    </span>
                    <input
                      value={title}
                      maxLength={TITLE_MAX}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setTouched(true);
                      }}
                      placeholder="Ex. : Marseille → Alger · retard d’environ 2 h"
                    />
                  </label>
                  <label className="bw-msg__field">
                    <span className="bw-msg__label">
                      Texte
                      <Counter value={body} shown={BODY_SHOWN} max={BODY_MAX} />
                    </span>
                    <textarea
                      rows={3}
                      value={body}
                      maxLength={BODY_MAX}
                      onChange={(e) => {
                        setBody(e.target.value);
                        setTouched(true);
                      }}
                      placeholder="Ce qui change, et ce que le voyageur doit faire."
                    />
                  </label>
                  {touched && template !== "free" && context ? (
                    <button
                      type="button"
                      className="bw-msg__link"
                      onClick={() => setTouched(false)}
                    >
                      Revenir au texte du modèle
                    </button>
                  ) : null}
                  {context ? (
                    <p className="bw-msg__hint">
                      Au toucher, la notification ouvre <strong>{context.urlLabel}</strong>.
                    </p>
                  ) : null}
                  <label className="bw-msg__check">
                    <input
                      type="checkbox"
                      checked={flash}
                      onChange={(e) => {
                        setFlash(e.target.checked);
                        setFlashTouched(true);
                      }}
                    />
                    <Newspaper size={16} aria-hidden /> Publier aussi en Flash info, visible de tous
                    pendant 24 h
                  </label>
                </>
              ) : null}
            </fieldset>

            {/* 3. Quand */}
            <fieldset className="bw-msg__step">
              <legend>
                <span>3</span> Quand ?
              </legend>
              <div className="bw-msg__seg" role="radiogroup" aria-label="Moment de l’envoi">
                <button
                  type="button"
                  role="radio"
                  aria-checked={when === "now"}
                  onClick={() => setWhen("now")}
                >
                  <Send size={15} aria-hidden /> Tout de suite
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={when === "later"}
                  onClick={() => setWhen("later")}
                >
                  <CalendarClock size={15} aria-hidden /> Planifier
                </button>
              </div>
              {when === "later" ? (
                <div className="bw-msg__row">
                  <label className="bw-msg__field">
                    Jour
                    <input
                      type="date"
                      value={later.date}
                      onChange={(e) => setLater({ ...later, date: e.target.value })}
                    />
                  </label>
                  <label className="bw-msg__field">
                    Heure de Paris
                    <input
                      type="time"
                      value={later.time}
                      onChange={(e) => setLater({ ...later, time: e.target.value })}
                    />
                  </label>
                  <div className="bw-msg__quick">
                    <button type="button" onClick={() => setLater(tomorrowAt("08:00"))}>
                      Demain 8 h
                    </button>
                    <button type="button" onClick={() => setLater(tomorrowAt("18:00"))}>
                      Demain 18 h
                    </button>
                  </div>
                </div>
              ) : null}
              {quiet && audience ? (
                <p className="bw-msg__warning">
                  <Moon size={16} aria-hidden /> {when === "now" ? "Il est" : "Ce sera"} entre 22 h
                  et 7 h à Paris : un message non urgent peut attendre le matin.
                  <button
                    type="button"
                    onClick={() => {
                      setWhen("later");
                      setLater(nextMorning());
                    }}
                  >
                    Planifier à 7 h
                  </button>
                </p>
              ) : null}
              {when === "later" && counts && !counts.schedulerActive ? (
                <p className="bw-msg__warning">
                  <TriangleAlert size={16} aria-hidden /> L’envoi automatique toutes les 10 minutes
                  n’est pas encore actif dans Supabase (script du 03/11/2026). Un message planifié
                  partirait seulement au passage quotidien du matin, ou avec « Envoyer maintenant »
                  dans le diagnostic plus bas.
                </p>
              ) : null}
              {counts?.duplicates.length ? (
                <p className="bw-msg__warning">
                  <History size={16} aria-hidden /> Déjà{" "}
                  {counts.duplicates[0]!.status === "scheduled" ? "planifié" : "envoyé"} pour la
                  même cible {parisLabel(counts.duplicates[0]!.at)} : «{" "}
                  {counts.duplicates[0]!.title} ». Vérifiez que ce n’est pas un doublon.
                </p>
              ) : null}
            </fieldset>
            <div className="bw-msg__footer">
              {blocker ? <p>{blocker}</p> : null}
              <button
                type="button"
                className="bw-action-primary"
                disabled={!ready}
                onClick={() => {
                  setTyped("");
                  setConfirming(true);
                }}
              >
                {when === "now" ? (
                  <Send className="size-4" />
                ) : (
                  <CalendarClock className="size-4" />
                )}
                {when === "now" ? "Vérifier et envoyer" : "Vérifier et planifier"}
              </button>
            </div>
          </div>
          <aside className="bw-msg__preview" aria-label="Aperçu sur téléphone">
            <PhonePreview
              title={title}
              body={body}
              when={when === "now" ? "maintenant" : sendAt ? parisLabel(sendAt.toISOString()) : ""}
            />
          </aside>
        </div>
      </section>

      <MessageHistory
        messages={history.data?.messages ?? []}
        loading={history.isPending}
        onEdit={edit}
      />

      <Dialog open={confirming} onOpenChange={(open) => !create.isPending && setConfirming(open)}>
        <DialogContent className="bw-travel-dialog">
          <div className="bw-travel-dialog-body">
            <DialogTitle className="text-xl font-semibold">
              {when === "now" ? "Envoyer maintenant ?" : "Planifier ce message ?"}
            </DialogTitle>
            <DialogDescription className="mt-2">
              {when === "now"
                ? "Vérifiez une dernière fois : un message envoyé ne peut pas être rappelé."
                : "Vous pourrez le modifier ou l’annuler jusqu’à son départ."}
            </DialogDescription>
            <dl className="bw-msg__recap">
              <div>
                <dt>Destinataires</dt>
                <dd>
                  {counts?.label}
                  <small>
                    {reachable} compte{reachable > 1 ? "s" : ""} · {counts?.devices ?? 0} téléphone
                    {(counts?.devices ?? 0) > 1 ? "s" : ""}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Envoi</dt>
                <dd>
                  {sendAt
                    ? `${parisLabel(sendAt.toISOString())} (heure de Paris)`
                    : "Tout de suite"}
                </dd>
              </div>
              {flash ? (
                <div>
                  <dt>Flash info</dt>
                  <dd>Publié aussi, pendant 24 h</dd>
                </div>
              ) : null}
            </dl>
            <PhonePreview
              title={title}
              body={body}
              when={sendAt ? "à l’heure prévue" : "maintenant"}
            />
            {kind === "all" ? (
              <label className="bw-msg__field mt-4">
                Pour confirmer, tapez le nombre de destinataires ({reachable})
                <input
                  inputMode="numeric"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))}
                />
              </label>
            ) : null}
            <button
              type="button"
              className="bw-action-primary mt-4 w-full"
              disabled={create.isPending || (kind === "all" && Number(typed) !== reachable)}
              onClick={() => create.mutate()}
            >
              {create.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {create.isPending
                ? "Envoi en cours…"
                : when === "now"
                  ? `Envoyer à ${reachable} compte${reachable > 1 ? "s" : ""}`
                  : `Planifier pour ${sendAt ? parisLabel(sendAt.toISOString()) : ""}`}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Counter({ value, shown, max }: { value: string; shown: number; max: number }) {
  const length = value.trim().length;
  return (
    <small className="bw-msg__counter" data-over={length > shown}>
      {length}/{max}
      {length > shown ? " · risque d’être coupé sur le téléphone" : ""}
    </small>
  );
}

function PhonePreview({ title, body, when }: { title: string; body: string; when: string }) {
  return (
    <div className="bw-msg__phone">
      <p className="bw-msg__phone-kicker">Aperçu sur le téléphone</p>
      <div className="bw-msg__notif">
        <img src="/pwa-icon-192.png" alt="" width={36} height={36} />
        <div>
          <p className="bw-msg__notif-app">
            <Bell size={11} aria-hidden /> BledWay · {when || "maintenant"}
          </p>
          <strong>{title.trim() || "Titre du message"}</strong>
          <p>{body.trim() || "Le texte apparaîtra ici, tel que le voyageur le lira."}</p>
        </div>
      </div>
    </div>
  );
}

const statusLabels: Record<AdminMessage["status"], string> = {
  scheduled: "Planifié",
  sending: "En cours d’envoi",
  sent: "Envoyé",
  cancelled: "Annulé",
  failed: "Échec",
};
function MessageHistory({
  messages,
  loading,
  onEdit,
}: {
  messages: AdminMessage[];
  loading: boolean;
  onEdit: (message: AdminMessage) => void;
}) {
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => messageAction({ action: "message-cancel", id }),
    onSuccess: () => {
      toast.success("Envoi annulé.");
      setConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "messages"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const scheduled = messages.filter((message) => message.status === "scheduled");
  const past = messages.filter((message) => message.status !== "scheduled");
  const row = (message: AdminMessage) => (
    <li key={message.id} className="bw-msg__item" data-status={message.status}>
      <div className="min-w-0 flex-1">
        <p className="bw-msg__item-title">{message.title}</p>
        <p className="bw-msg__item-meta">
          {message.audience_label}
          <br />
          {message.status === "scheduled"
            ? `Départ prévu ${parisLabel(message.scheduled_at)}`
            : message.sent_at
              ? `Envoyé ${parisLabel(message.sent_at)}`
              : parisLabel(message.scheduled_at)}
          {message.status === "sent" && message.recipients !== null
            ? ` · ${message.recipients} compte${message.recipients > 1 ? "s" : ""}`
            : ""}
          {message.news_id ? " · Flash info" : ""}
        </p>
        {message.last_error ? (
          <p className="text-xs text-destructive">{message.last_error}</p>
        ) : null}
      </div>
      <span className="bw-msg__pill" data-status={message.status}>
        {statusLabels[message.status]}
      </span>
      {message.status === "scheduled" ? (
        <div className="bw-msg__item-actions">
          <button type="button" onClick={() => onEdit(message)}>
            <Pencil size={14} aria-hidden /> Modifier
          </button>
          {confirmId === message.id ? (
            <button
              type="button"
              className="is-danger"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(message.id)}
            >
              Confirmer l’annulation
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmId(message.id)}>
              <X size={14} aria-hidden /> Annuler l’envoi
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
  return (
    <section className="bw-admin-surface">
      <div className="bw-admin-section-heading">
        <div>
          <h2>Messages de l’équipe</h2>
          <p>Les envois planifiés restent modifiables jusqu’à leur départ.</p>
        </div>
      </div>
      {loading ? (
        <div className="m-5 h-16 animate-pulse rounded-xl bg-secondary" />
      ) : !messages.length ? (
        <p className="p-5 text-sm text-muted-foreground">
          <Bell className="mr-1 inline size-4" aria-hidden />
          Aucun message pour le moment. Le premier se rédige juste au-dessus.
        </p>
      ) : (
        <>
          {scheduled.length ? (
            <>
              <h3 className="bw-msg__group">À venir</h3>
              <ul className="divide-y divide-border">{scheduled.map(row)}</ul>
            </>
          ) : null}
          {past.length ? (
            <>
              <h3 className="bw-msg__group">Historique</h3>
              <ul className="divide-y divide-border">{past.slice(0, 20).map(row)}</ul>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
