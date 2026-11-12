import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/usage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  FileUp,
  LoaderCircle,
  PencilLine,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { companiesQuery, portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { portTimeZone, wallTimeInZone } from "@/lib/ferry/time";
import { myTripsKey } from "@/lib/ferry/myTrip";
import { preparationKey, preparationQuery, savePreparation } from "@/lib/ferry/preparation";
import { saveTravelAction } from "@/lib/notifications/actions";
import {
  bestDeparture,
  issueText,
  legIssues,
  ticketInstant,
  type CandidateDeparture,
} from "@/lib/tickets/match";
import { emptyLeg, parseTicket, type TicketDraft, type TicketLeg } from "@/lib/tickets/parse";
import { readTicket, type ReadProgress } from "@/lib/tickets/read";
import {
  candidatesFor,
  keepLocal,
  saveTicket,
  ticketsKey,
  uploadTicketFile,
  type TicketDetails,
} from "@/lib/tickets/tickets";
import { TicketCamera } from "./TicketCamera";
import { tr } from "@/lib/i18n";

type Step = "choose" | "camera" | "reading" | "review" | "saved";

const emptyDraft = (): TicketDraft => ({
  companyId: null,
  vesselId: null,
  legs: [emptyLeg()],
  passengers: [],
  adults: null,
  children: null,
  reference: null,
  vehicleKind: null,
  vehiclePlate: null,
  agency: null,
  codes: [],
});

const LEG_LABEL = ["Aller", "Retour"];

/**
 * Ajouter un billet : photo guidée, photo ou PDF importé, ou saisie à la main. Le billet est lu sur
 * le téléphone, chaque information est présentée pour vérification, et rien n'est enregistré sans
 * confirmation explicite. Ensuite, le voyage se prépare tout seul (aller, retour, véhicule, enfants).
 */
export function TicketImport({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Appelé une fois le billet enregistré (le parcours « suivre » se ferme alors). */
  onSaved?: (() => void) | undefined;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ReadProgress>({ step: "", ratio: 0 });
  const [draft, setDraft] = useState<TicketDraft>(emptyDraft);
  /** Ce qui a été lu sur le billet (le reste est à compléter). */
  const [read, setRead] = useState<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<CandidateDeparture[][]>([[], []]);
  const [chosen, setChosen] = useState<(string | null)[]>([null, null]);
  const [prepare, setPrepare] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  /** Billet d'une traversée déjà passée : enregistré seulement si l'utilisateur le confirme. */
  const [pastOk, setPastOk] = useState(false);
  /** Prévenu dès la lecture : billet d'une traversée déjà passée. */
  const [pastAlert, setPastAlert] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Un billet par passager : plusieurs fichiers choisis d'un coup, lus et enregistrés à la suite.
  const [queue, setQueue] = useState<File[]>([]);
  const [batch, setBatch] = useState({ index: 0, total: 0 });
  const reset = () => {
    setPastOk(false);
    setPastAlert(false);
    setStep("choose");
    setFile(null);
    setDraft(emptyDraft());
    setRead(new Set());
    setCandidates([[], []]);
    setChosen([null, null]);
    setConfirmed(false);
    setProblem(null);
  };
  useEffect(() => {
    if (!open) {
      reset();
      setQueue([]);
      setBatch({ index: 0, total: 0 });
    }
  }, [open]);

  const portName = (id: string | null) => ports.find((p) => p.id === id)?.name ?? null;
  const vesselName = (id: string | null) => vessels.find((v) => v.id === id)?.name ?? null;
  const zoneOf = (portId: string | null) => portTimeZone(ports.find((p) => p.id === portId));
  const routeIdsFor = (leg: TicketLeg) =>
    routes
      .filter((r) => r.departure_port_id === leg.fromPortId && r.arrival_port_id === leg.toPortId)
      .map((r) => r.id);

  const start = async (picked: File) => {
    setFile(picked);
    setStep("reading");
    setProblem(null);
    try {
      const result = await readTicket(picked, setProgress);
      const parsed = parseTicket(result.text, result.codes, {
        companies: companies.map((c) => ({ id: c.id, name: c.name })),
        vessels: vessels.map((v) => ({ id: v.id, name: v.name, company_id: v.company_id })),
        ports: ports.map((p) => ({ id: p.id, name: p.name })),
      });
      const found = new Set<string>();
      for (const [key, value] of Object.entries(parsed))
        if (value !== null && !(Array.isArray(value) && !value.length)) found.add(key);
      parsed.legs.forEach((leg, i) =>
        Object.entries(leg).forEach(([key, value]) => value && found.add(`legs.${i}.${key}`)),
      );
      setDraft(parsed);
      setRead(found);
      // Billet d'une traversée passée : on le dit tout de suite, avant la relecture.
      const times = parsed.legs
        .filter((leg) => leg.date)
        .map((leg) => ticketInstant(leg, zoneOf(leg.fromPortId))?.getTime() ?? 0);
      if (times.length && Math.max(...times) + 86_400_000 < Date.now()) setPastAlert(true);
    } catch {
      // Lecture impossible : la saisie reste ouverte, le document est gardé.
      setProblem(
        "Le billet n’a pas pu être lu automatiquement. Complétez les informations ci-dessous.",
      );
    }
    setStep("review");
  };

  // Traversées BledWay de chaque trajet (même ligne, autour de la date du billet).
  const legsKey = JSON.stringify(draft.legs);
  useEffect(() => {
    if (step !== "review") return;
    let stale = false;
    void Promise.all(draft.legs.map((leg) => candidatesFor(leg, routeIdsFor(leg)))).then(
      (lists) => {
        if (stale) return;
        setCandidates(lists);
        setChosen(
          draft.legs.map(
            (leg, i) =>
              bestDeparture(leg, lists[i] ?? [], zoneOf(leg.fromPortId), draft.companyId)?.id ??
              null,
          ),
        );
      },
    );
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, legsKey, draft.companyId, routes.length]);

  const issues = useMemo(
    () =>
      draft.legs.map((leg, i) => {
        const dep = candidates[i]?.find((d) => d.id === chosen[i]);
        return dep
          ? legIssues(
              leg,
              dep,
              zoneOf(leg.fromPortId),
              { companyId: draft.companyId, vesselName: vesselName(draft.vesselId) },
              vesselName,
            )
          : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, candidates, chosen, ports, vessels],
  );

  const setLeg = (i: number, change: Partial<TicketLeg>) =>
    setDraft((d) => ({
      ...d,
      legs: d.legs.map((leg, n) => (n === i ? { ...leg, ...change } : leg)),
    }));
  const origin = (key: string) =>
    read.has(key) ? (
      <small className="bw-ticket-field__read">{tr("ui.ticketImport.luSurLeBillet")}</small>
    ) : (
      <small className="bw-ticket-field__todo">{tr("ui.ticketImport.aCompleter")}</small>
    );

  const save = async () => {
    if (!user || !confirmed || (pastTicket && !pastOk)) return;
    setSaving(true);
    setProblem(null);
    try {
      const filePath = file ? await uploadTicketFile(user.id, file, file.name) : null;
      const linked = draft.legs.map((_, i) => chosen[i] ?? null);
      const insights = draft.legs.flatMap((leg, i) => {
        const id = linked[i];
        const list = issues[i] ?? [];
        if (!id || !list.some((issue) => issue.kind === "time" || issue.kind === "vessel"))
          return [];
        const at = ticketInstant(leg, zoneOf(leg.fromPortId));
        return [
          {
            departure_id: id,
            ticket_departure_at: leg.time && at ? at.toISOString() : null,
            ticket_vessel: vesselName(draft.vesselId),
          },
        ];
      });
      const lastLeg = [...draft.legs].reverse().find((leg) => leg.date);
      const lastAt = lastLeg ? ticketInstant(lastLeg, zoneOf(lastLeg.fromPortId)) : null;
      const details: TicketDetails = { ...draft, vesselName: vesselName(draft.vesselId) };
      const id = await saveTicket({
        filePath,
        fileName: file?.name ?? null,
        fileType: file?.type ?? null,
        details,
        companyId: draft.companyId,
        outboundId: linked[0] ?? null,
        inboundId: linked[1] ?? null,
        // Sans heure d'arrivée connue, on compte une journée de traversée.
        lastTravelAt: lastAt ? new Date(lastAt.getTime() + 86_400_000).toISOString() : null,
        agency: draft.agency,
        insights,
      });
      if (file && lastAt)
        await keepLocal(id, file, new Date(lastAt.getTime() + 8 * 86_400_000).toISOString());
      else if (file)
        await keepLocal(id, file, new Date(Date.now() + 30 * 86_400_000).toISOString());

      // Le voyage se prépare : « Ma traversée » (aller, retour), véhicule, enfants, billet vérifié.
      const [outId, inId] = linked;
      if (prepare && (outId || inId)) {
        const label = [
          portName(draft.legs[0]?.fromPortId ?? null),
          portName(draft.legs[0]?.toPortId ?? null),
        ]
          .filter(Boolean)
          .join(" → ");
        await saveTravelAction(user.id, {
          type: "follow",
          kind: "departure",
          targetId: (outId ?? inId)!,
          label: label || "Ma traversée",
          traveller: true,
          purpose: "voyageur",
          journeyLeg: outId ? "outbound" : "inbound",
          ...(outId && inId ? { returnDepartureId: inId } : {}),
        });
        for (const departureId of [outId, inId].filter(Boolean) as string[]) {
          const current = await client.fetchQuery(preparationQuery(departureId, user.id));
          await savePreparation(departureId, user.id, {
            profile: {
              ...current.profile,
              ...(draft.vehicleKind ? { vehicle: true } : {}),
              ...(draft.children ? { kids: true } : {}),
            },
            done: [...new Set([...current.done, "tickets"])],
          });
        }
      }
      void client.invalidateQueries({ queryKey: ticketsKey });
      void client.invalidateQueries({ queryKey: myTripsKey });
      void client.invalidateQueries({ queryKey: preparationKey });
      track("billet-ajoute");
      setStep("saved");
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "Enregistrement impossible. Réessayez.");
    }
    setSaving(false);
  };

  // Toutes les dates lues sont passées (lendemain du départ inclus) : rien à suivre.
  const datedLegs = draft.legs.filter((leg) => leg.date);
  const lastDated = datedLegs.length
    ? Math.max(...datedLegs.map((leg) => ticketInstant(leg, zoneOf(leg.fromPortId))?.getTime() ?? 0))
    : null;
  const pastTicket = lastDated !== null && lastDated + 86_400_000 < Date.now();
  const pastDay = pastTicket && lastDated
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(lastDated))
    : "";

  const companyVessels = vessels.filter(
    (v) => !draft.companyId || !v.company_id || v.company_id === draft.companyId,
  );
  const portOptions = [...ports].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
    <AlertDialog open={pastAlert} onOpenChange={setPastAlert}>
      <AlertDialogContent>
        <AlertDialogTitle>{tr("ui.ticketImport.ceBilletEstPourUne")}</AlertDialogTitle>
        <AlertDialogDescription>
          {pastDay ? `Date lue sur le billet : ${pastDay}. ` : ""}{tr("ui.ticketImport.bledwayNePeutLuiRattacher")}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              setPastAlert(false);
              onOpenChange(false);
            }}
          >
            {tr("ui.ticketImport.annuler")}
          </AlertDialogCancel>
          <AlertDialogCancel>{tr("ui.ticketImport.corrigerLaDate")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => setPastOk(true)}>{tr("ui.ticketImport.rangerQuandMeme")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value && step === "saved") onSaved?.();
      }}
    >
      <DialogContent className="bw-ticket-dialog">
        <DialogTitle>
          {step === "saved" ? tr("ui.ticketImport.billetEnregistre") : tr("ui.ticketImport.ajouterMonBillet")}
          {batch.total > 1 ? (
            <span className="bw-ticket-batch">
              {" "}
              · {batch.index}{tr("ui.ticketImport.sur")}{batch.total}
            </span>
          ) : null}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {tr("ui.ticketImport.importerLireEtVerifierUn")}
        </DialogDescription>

        {step === "choose" ? (
          <div className="bw-ticket-choose">
            <button type="button" onClick={() => setStep("camera")}>
              <Camera size={20} aria-hidden />
              <span>
                <strong>{tr("ui.ticketImport.photographierLeBillet")}</strong>
                <small>{tr("ui.ticketImport.avecUneAideAuCadrage")}</small>
              </span>
            </button>
            <button type="button" onClick={() => input.current?.click()}>
              <FileUp size={20} aria-hidden />
              <span>
                <strong>{tr("ui.ticketImport.importerUnePhotoOuUn")}</strong>
                <small>{tr("ui.ticketImport.unBilletParPassagerChoisissez")}</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(emptyDraft());
                setStep("review");
              }}
            >
              <PencilLine size={20} aria-hidden />
              <span>
                <strong>{tr("ui.ticketImport.saisirALaMain")}</strong>
                <small>{tr("ui.ticketImport.sansDocument")}</small>
              </span>
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (!files.length) return;
                setQueue(files.slice(1));
                setBatch({ index: 1, total: files.length });
                void start(files[0]!);
              }}
            />
            <p className="bw-ticket-note">
              {tr("ui.ticketImport.luSurVotreTelephoneRien")}
            </p>
          </div>
        ) : null}

        {step === "camera" ? (
          <TicketCamera onShot={(shot) => void start(shot)} onCancel={() => setStep("choose")} />
        ) : null}

        {step === "reading" ? (
          <div className="bw-ticket-reading" role="status">
            <LoaderCircle className="animate-spin" size={28} aria-hidden />
            <strong>{progress.step || tr("ui.ticketImport.lectureDuBillet")}</strong>
            <span className="bw-ticket-reading__bar">
              <i style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
            </span>
            <small>{tr("ui.ticketImport.laPremiereFoisLaLecture")}</small>
          </div>
        ) : null}

        {step === "review" ? (
          <form
            className="bw-ticket-review"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {problem ? <p role="alert">{problem}</p> : null}
            {file ? (
              <p className="bw-ticket-note">
                {tr("ui.ticketImport.verifiezEtCompletezChaqueInformation")}
                {draft.codes.length ? (
                  <span className="bw-ticket-codes">
                    <QrCode size={14} aria-hidden /> {draft.codes.length}{tr("ui.ticketImport.codeSLuSGarde")}
                  </span>
                ) : null}
              </p>
            ) : null}

            <fieldset>
              <legend>{tr("ui.ticketImport.compagnieEtNavire")}</legend>
              <label>
                {tr("ui.ticketImport.compagnie")}{" "}
                {draft.companyFromVessel && draft.companyId ? (
                  <small className="bw-ticket-field__read">{tr("ui.ticketImport.deduiteDuNavire")}</small>
                ) : (
                  origin("companyId")
                )}
                <select
                  value={draft.companyId ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, companyId: e.target.value || null }))}
                >
                  <option value="">—</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("ui.ticketImport.navire")}{origin("vesselId")}
                <select
                  value={draft.vesselId ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, vesselId: e.target.value || null }))}
                >
                  <option value="">{tr("ui.ticketImport.nonIndique")}</option>
                  {companyVessels.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            {draft.legs.map((leg, i) => {
              const list = (candidates[i] ?? []).filter(
                (d) => !leg.date || d.departure_at.slice(0, 10) >= shift(leg.date, -1),
              );
              const zone = zoneOf(leg.fromPortId);
              return (
                <fieldset key={i}>
                  <legend>
                    {LEG_LABEL[i]}
                    {i === 1 ? (
                      <button
                        type="button"
                        className="bw-ticket-remove"
                        onClick={() => setDraft((d) => ({ ...d, legs: d.legs.slice(0, 1) }))}
                      >
                        <Trash2 size={13} aria-hidden />{tr("ui.ticketImport.pasDeRetour")}
                      </button>
                    ) : null}
                  </legend>
                  <div className="bw-ticket-grid">
                    <label>
                      {tr("ui.ticketImport.depart")}{origin(`legs.${i}.fromPortId`)}
                      <select
                        value={leg.fromPortId ?? ""}
                        onChange={(e) => setLeg(i, { fromPortId: e.target.value || null })}
                      >
                        <option value="">—</option>
                        {portOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {tr("ui.ticketImport.arrivee")}{origin(`legs.${i}.toPortId`)}
                      <select
                        value={leg.toPortId ?? ""}
                        onChange={(e) => setLeg(i, { toPortId: e.target.value || null })}
                      >
                        <option value="">—</option>
                        {portOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {tr("ui.ticketImport.date")}{origin(`legs.${i}.date`)}
                      <input
                        type="date"
                        value={leg.date ?? ""}
                        onChange={(e) => setLeg(i, { date: e.target.value || null })}
                      />
                    </label>
                    <label>
                      {tr("ui.ticketImport.heureDeDepart")}{origin(`legs.${i}.time`)}
                      <input
                        type="time"
                        value={leg.time ?? ""}
                        onChange={(e) => setLeg(i, { time: e.target.value || null })}
                      />
                    </label>
                  </div>
                  {leg.fromPortId && leg.toPortId && leg.date ? (
                    <label>
                      {tr("ui.ticketImport.traverseeSurBledway")}
                      <select
                        value={chosen[i] ?? ""}
                        onChange={(e) =>
                          setChosen((c) => c.map((v, n) => (n === i ? e.target.value || null : v)))
                        }
                      >
                        <option value="">{tr("ui.ticketImport.aucuneDeCesTraversees")}</option>
                        {list.map((d) => (
                          <option key={d.id} value={d.id}>
                            {new Date(d.departure_at).toLocaleDateString("fr-FR", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              timeZone: zone,
                            })}{" "}
                            · {wallTimeInZone(d.departure_at, zone).slice(0, 5)}
                            {vesselName(d.vessel_id) ? ` · ${vesselName(d.vessel_id)}` : ""}
                            {d.status === "cancelled" ? tr("ui.ticketImport.annulee") : ""}
                          </option>
                        ))}
                      </select>
                      {!list.length ? (
                        <small>{tr("ui.ticketImport.aucuneTraverseeDeCetteLigne")}</small>
                      ) : null}
                    </label>
                  ) : null}
                  {(issues[i] ?? []).map((issue) => (
                    <p key={issue.kind} className="bw-ticket-issue" role="note">
                      {issueText(issue)}
                    </p>
                  ))}
                </fieldset>
              );
            })}
            {draft.legs.length < 2 ? (
              <button
                type="button"
                className="bw-ticket-add"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    legs: [
                      ...d.legs,
                      {
                        ...emptyLeg(),
                        fromPortId: d.legs[0]?.toPortId ?? null,
                        toPortId: d.legs[0]?.fromPortId ?? null,
                      },
                    ],
                  }))
                }
              >
                <Plus size={14} aria-hidden />{tr("ui.ticketImport.ajouterLeRetour")}
              </button>
            ) : null}

            <fieldset>
              <legend>{tr("ui.ticketImport.passagers")}{origin("passengers")}</legend>
              {draft.passengers.map((name, i) => (
                <div key={i} className="bw-ticket-row">
                  <input
                    value={name}
                    aria-label={`Passager ${i + 1}`}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        passengers: d.passengers.map((p, n) => (n === i ? e.target.value : p)),
                      }))
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Retirer le passager ${i + 1}`}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        passengers: d.passengers.filter((_, n) => n !== i),
                      }))
                    }
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="bw-ticket-add"
                onClick={() => setDraft((d) => ({ ...d, passengers: [...d.passengers, ""] }))}
              >
                <Plus size={14} aria-hidden />{tr("ui.ticketImport.ajouterUnPassager")}
              </button>
              <div className="bw-ticket-grid">
                <label>
                  {tr("ui.ticketImport.adultes")}{origin("adults")}
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={draft.adults ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        adults: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  {tr("ui.ticketImport.enfants")}{origin("children")}
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={draft.children ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        children: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>{tr("ui.ticketImport.reservationEtVehicule")}</legend>
              <div className="bw-ticket-grid">
                <label>
                  {tr("ui.ticketImport.reference")}{origin("reference")}
                  <input
                    value={draft.reference ?? ""}
                    maxLength={30}
                    onChange={(e) => setDraft((d) => ({ ...d, reference: e.target.value || null }))}
                  />
                </label>
                <label>
                  {tr("ui.ticketImport.vehicule")}{origin("vehicleKind")}
                  <input
                    value={draft.vehicleKind ?? ""}
                    placeholder={tr("ui.ticketImport.aPied")}
                    maxLength={40}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, vehicleKind: e.target.value || null }))
                    }
                  />
                </label>
                <label>
                  {tr("ui.ticketImport.immatriculation")}{origin("vehiclePlate")}
                  <input
                    value={draft.vehiclePlate ?? ""}
                    maxLength={20}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, vehiclePlate: e.target.value || null }))
                    }
                  />
                </label>
                <label>
                  {tr("ui.ticketImport.agenceEmettrice")}{origin("agency")}
                  <input
                    value={draft.agency ?? ""}
                    maxLength={120}
                    onChange={(e) => setDraft((d) => ({ ...d, agency: e.target.value || null }))}
                  />
                </label>
              </div>
            </fieldset>

            <label className="bw-ticket-check">
              <input
                type="checkbox"
                checked={prepare}
                onChange={(e) => setPrepare(e.target.checked)}
              />
              <span>
                {tr("ui.ticketImport.preparerMonVoyageAvecCe")}
              </span>
            </label>
            {pastTicket ? (
              <div className="bw-ticket-past" role="alert">
                <strong>{tr("ui.ticketImport.ceBilletEstPourUne2")}{pastDay ? ` (${pastDay})` : ""}.</strong>
                <p>
                  {tr("ui.ticketImport.bledwayNePeutLuiRattacher2")}
                </p>
                <label className="bw-ticket-check">
                  <input type="checkbox" checked={pastOk} onChange={(e) => setPastOk(e.target.checked)} />
                  <span>{tr("ui.ticketImport.jeLEnregistreQuandMeme")}</span>
                </label>
              </div>
            ) : null}
            <label className="bw-ticket-check" data-required>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>{tr("ui.ticketImport.jAiVerifieCesInformations")}</span>
            </label>
            <p className="bw-ticket-note">
              {tr("ui.ticketImport.bledwayNeVerifiePasLa")}
            </p>
            <div className="bw-ticket-actions">
              <button type="button" onClick={reset} disabled={saving}>
                {tr("ui.ticketImport.recommencer")}
              </button>
              <button
                type="submit"
                className="bw-action-primary"
                disabled={!confirmed || saving || !user || (pastTicket && !pastOk)}
              >
                {saving ? (
                  <LoaderCircle className="animate-spin" size={16} aria-hidden />
                ) : (
                  <Check size={16} aria-hidden />
                )}
                {user ? tr("ui.ticketImport.enregistrerMonBillet") : tr("ui.ticketImport.connectezVousPourEnregistrer")}
              </button>
            </div>
          </form>
        ) : null}

        {step === "saved" ? (
          <div className="bw-ticket-saved" role="status">
            <Check size={30} aria-hidden />
            <p>
              {tr("ui.ticketImport.votreBilletEstEnregistre")}
              {file ? tr("ui.ticketImport.etDisponibleSurCeTelephone") : ""}{tr("ui.ticketImport.retrouvezLeDansMonCompte")}
            </p>
            {queue.length ? (
              <button
                type="button"
                className="bw-action-primary"
                onClick={() => {
                  const [next, ...rest] = queue;
                  setQueue(rest);
                  setBatch((b) => ({ ...b, index: b.index + 1 }));
                  reset();
                  if (next) void start(next);
                }}
              >
                {tr("ui.ticketImport.billetSuivant")}{batch.index + 1}{tr("ui.ticketImport.sur")}{batch.total})
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="bw-action-secondary"
                  onClick={() => {
                    setBatch({ index: 0, total: 0 });
                    reset();
                  }}
                >
                  <Plus size={16} aria-hidden />{tr("ui.ticketImport.ajouterLeBilletDUn")}
                </button>
                <button type="button" className="bw-action-primary" onClick={() => { onOpenChange(false); onSaved?.(); }}>
                  {tr("ui.ticketImport.terminer")}
                </button>
              </>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
    </>
  );
}

/** AAAA-MM-JJ décalé de n jours. */
function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
