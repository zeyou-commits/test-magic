import { useEffect, useMemo, useRef, useState } from "react";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
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
    if (!open) reset();
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
      <small className="bw-ticket-field__read">lu sur le billet</small>
    ) : (
      <small className="bw-ticket-field__todo">à compléter</small>
    );

  const save = async () => {
    if (!user || !confirmed) return;
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
      setStep("saved");
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "Enregistrement impossible. Réessayez.");
    }
    setSaving(false);
  };

  const companyVessels = vessels.filter(
    (v) => !draft.companyId || !v.company_id || v.company_id === draft.companyId,
  );
  const portOptions = [...ports].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bw-ticket-dialog">
        <DialogTitle>{step === "saved" ? "Billet enregistré" : "Ajouter mon billet"}</DialogTitle>
        <DialogDescription className="sr-only">
          Importer, lire et vérifier un billet de ferry
        </DialogDescription>

        {step === "choose" ? (
          <div className="bw-ticket-choose">
            <button type="button" onClick={() => setStep("camera")}>
              <Camera size={20} aria-hidden />
              <span>
                <strong>Photographier le billet</strong>
                <small>Avec une aide au cadrage et à la netteté</small>
              </span>
            </button>
            <button type="button" onClick={() => input.current?.click()}>
              <FileUp size={20} aria-hidden />
              <span>
                <strong>Importer une photo ou un PDF</strong>
                <small>Billet électronique reçu par e-mail, capture d’écran…</small>
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
                <strong>Saisir à la main</strong>
                <small>Sans document</small>
              </span>
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(event) => {
                const picked = event.target.files?.[0];
                event.target.value = "";
                if (picked) void start(picked);
              }}
            />
            <p className="bw-ticket-note">
              Lu sur votre téléphone : rien n’est envoyé à un service extérieur. Le document est
              gardé dans votre espace privé, puis effacé 7 jours après votre dernière traversée.
            </p>
          </div>
        ) : null}

        {step === "camera" ? (
          <TicketCamera onShot={(shot) => void start(shot)} onCancel={() => setStep("choose")} />
        ) : null}

        {step === "reading" ? (
          <div className="bw-ticket-reading" role="status">
            <LoaderCircle className="animate-spin" size={28} aria-hidden />
            <strong>{progress.step || "Lecture du billet…"}</strong>
            <span className="bw-ticket-reading__bar">
              <i style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
            </span>
            <small>La première fois, la lecture se prépare (quelques secondes).</small>
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
                Vérifiez et complétez chaque information : seules celles marquées « lu sur le billet
                » ont été trouvées. Rien n’a été deviné.
                {draft.codes.length ? (
                  <span className="bw-ticket-codes">
                    <QrCode size={14} aria-hidden /> {draft.codes.length} code(s) lu(s), gardé(s)
                    sur le billet original.
                  </span>
                ) : null}
              </p>
            ) : null}

            <fieldset>
              <legend>Compagnie et navire</legend>
              <label>
                Compagnie {origin("companyId")}
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
                Navire {origin("vesselId")}
                <select
                  value={draft.vesselId ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, vesselId: e.target.value || null }))}
                >
                  <option value="">— Non indiqué</option>
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
                        <Trash2 size={13} aria-hidden /> Pas de retour
                      </button>
                    ) : null}
                  </legend>
                  <div className="bw-ticket-grid">
                    <label>
                      Départ {origin(`legs.${i}.fromPortId`)}
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
                      Arrivée {origin(`legs.${i}.toPortId`)}
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
                      Date {origin(`legs.${i}.date`)}
                      <input
                        type="date"
                        value={leg.date ?? ""}
                        onChange={(e) => setLeg(i, { date: e.target.value || null })}
                      />
                    </label>
                    <label>
                      Heure de départ {origin(`legs.${i}.time`)}
                      <input
                        type="time"
                        value={leg.time ?? ""}
                        onChange={(e) => setLeg(i, { time: e.target.value || null })}
                      />
                    </label>
                  </div>
                  {leg.fromPortId && leg.toPortId && leg.date ? (
                    <label>
                      Traversée sur BledWay
                      <select
                        value={chosen[i] ?? ""}
                        onChange={(e) =>
                          setChosen((c) => c.map((v, n) => (n === i ? e.target.value || null : v)))
                        }
                      >
                        <option value="">Aucune de ces traversées</option>
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
                            {d.status === "cancelled" ? " · annulée" : ""}
                          </option>
                        ))}
                      </select>
                      {!list.length ? (
                        <small>Aucune traversée de cette ligne ce jour-là sur BledWay.</small>
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
                <Plus size={14} aria-hidden /> Ajouter le retour
              </button>
            ) : null}

            <fieldset>
              <legend>Passagers {origin("passengers")}</legend>
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
                <Plus size={14} aria-hidden /> Ajouter un passager
              </button>
              <div className="bw-ticket-grid">
                <label>
                  Adultes {origin("adults")}
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
                  Enfants {origin("children")}
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
              <legend>Réservation et véhicule</legend>
              <div className="bw-ticket-grid">
                <label>
                  Référence {origin("reference")}
                  <input
                    value={draft.reference ?? ""}
                    maxLength={30}
                    onChange={(e) => setDraft((d) => ({ ...d, reference: e.target.value || null }))}
                  />
                </label>
                <label>
                  Véhicule {origin("vehicleKind")}
                  <input
                    value={draft.vehicleKind ?? ""}
                    placeholder="À pied"
                    maxLength={40}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, vehicleKind: e.target.value || null }))
                    }
                  />
                </label>
                <label>
                  Immatriculation {origin("vehiclePlate")}
                  <input
                    value={draft.vehiclePlate ?? ""}
                    maxLength={20}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, vehiclePlate: e.target.value || null }))
                    }
                  />
                </label>
                <label>
                  Agence émettrice {origin("agency")}
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
                Préparer mon voyage avec ce billet (Ma traversée, aller et retour, véhicule)
              </span>
            </label>
            <label className="bw-ticket-check" data-required>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>J’ai vérifié ces informations.</span>
            </label>
            <p className="bw-ticket-note">
              BledWay ne vérifie pas la validité du billet : seule la compagnie fait foi, pour le
              billet comme pour les horaires.
            </p>
            <div className="bw-ticket-actions">
              <button type="button" onClick={reset} disabled={saving}>
                Recommencer
              </button>
              <button
                type="submit"
                className="bw-action-primary"
                disabled={!confirmed || saving || !user}
              >
                {saving ? (
                  <LoaderCircle className="animate-spin" size={16} aria-hidden />
                ) : (
                  <Check size={16} aria-hidden />
                )}
                {user ? "Enregistrer mon billet" : "Connectez-vous pour enregistrer"}
              </button>
            </div>
          </form>
        ) : null}

        {step === "saved" ? (
          <div className="bw-ticket-saved" role="status">
            <Check size={30} aria-hidden />
            <p>
              Votre billet est enregistré
              {file ? " et disponible sur ce téléphone, même sans connexion" : ""}. Retrouvez-le
              dans « Mon compte » et dans la préparation de votre voyage.
            </p>
            <button type="button" className="bw-action-primary" onClick={() => onOpenChange(false)}>
              Fermer
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** AAAA-MM-JJ décalé de n jours. */
function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
