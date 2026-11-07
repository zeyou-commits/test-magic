import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LoaderCircle, Plus, Ticket, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { companiesQuery, portsQuery } from "@/lib/ferry/queries";
import {
  deleteTicket,
  myTicketsQuery,
  pruneLocal,
  ticketFile,
  ticketsKey,
  type TicketRow,
} from "@/lib/tickets/tickets";
import { TicketImport } from "./TicketImport";

const day = (date: string | null) =>
  date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      })
    : "date à compléter";

/** Les billets d'une même traversée (un billet par passager) regroupés en un seul voyage. */
export function groupTickets(rows: TicketRow[]) {
  const groups = new Map<string, TicketRow[]>();
  for (const t of rows) {
    const leg = t.details.legs[0];
    const key =
      t.outbound_departure_id ??
      t.inbound_departure_id ??
      (leg?.date && leg.fromPortId ? `${leg.fromPortId}:${leg.toPortId}:${leg.date}` : t.id);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.values()];
}

/** Le nom affiché d'un billet : ses passagers, sinon « Billet n ». */
const ticketName = (t: TicketRow, i: number) =>
  t.details.passengers.length
    ? t.details.passengers
        .map((name) => name.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()))
        .join(", ")
    : `Billet ${i + 1}`;

function useTicketLabels() {
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const port = (id: string | null) => ports.find((p) => p.id === id)?.name ?? "?";
  return {
    route: (t: TicketRow) => {
      const leg = t.details.legs[0];
      return leg
        ? `${port(leg.fromPortId)} → ${port(leg.toPortId)}${t.details.legs.length > 1 ? " · aller-retour" : ""}`
        : "Billet";
    },
    company: (t: TicketRow) => companies.find((c) => c.id === t.company_id)?.name ?? null,
    port,
  };
}

/** Le billet original, tel qu'importé (QR code compris), consultable même sans connexion. */
export function TicketViewer({
  ticket,
  onClose,
}: {
  ticket: TicketRow | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const labels = useTicketLabels();
  const [url, setUrl] = useState<string | null>(null);
  /** PDF : ses pages dessinées en images (aperçu qui marche aussi sur Android et sans connexion). */
  const [pages, setPages] = useState<string[]>([]);
  const [zoom, setZoom] = useState(false);
  const [type, setType] = useState<string>("");
  const [offline, setOffline] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    setUrl(null);
    setPages([]);
    setProblem(null);
    setConfirming(false);
    if (!ticket?.file_path) return;
    let objectUrl: string | null = null;
    void ticketFile(ticket)
      .then(({ file, offline: local }) => {
        objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        const kind = file.type || ticket.file_type || "";
        setType(kind);
        if (kind === "application/pdf")
          void import("@/lib/tickets/read")
            .then((m) => m.pdfPageImages(file))
            .then(setPages)
            .catch(() => setProblem("Aperçu indisponible : utilisez « Télécharger »."));
        setOffline(local);
      })
      .catch((error: Error) => setProblem(error.message));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ticket]);
  const remove = useMutation({
    mutationFn: () => deleteTicket(ticket!),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ticketsKey });
      toast.success("Billet supprimé, document compris.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const d = ticket?.details;
  return (
    <Dialog open={Boolean(ticket)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bw-ticket-dialog">
        <DialogTitle>{ticket ? labels.route(ticket) : "Billet"}</DialogTitle>
        <DialogDescription className="sr-only">
          Billet original et informations confirmées
        </DialogDescription>
        {ticket && d ? (
          <div className="bw-ticket-view">
            {ticket.file_path ? (
              url ? (
                type === "application/pdf" ? (
                  pages.length ? (
                    <div className="bw-ticket-pages" data-zoom={zoom || undefined}>
                      {pages.map((page, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setZoom((value) => !value)}
                          aria-label={zoom ? "Réduire le billet" : "Agrandir le billet (QR code)"}
                        >
                          <img src={page} alt={`Billet, page ${i + 1}`} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p role="status">
                      <LoaderCircle className="animate-spin" size={16} aria-hidden /> Préparation de
                      l’aperçu…
                    </p>
                  )
                ) : (
                  <img src={url} alt="Billet original" />
                )
              ) : problem ? (
                <p role="alert">{problem}</p>
              ) : (
                <p role="status">
                  <LoaderCircle className="animate-spin" size={16} aria-hidden /> Ouverture du
                  billet…
                </p>
              )
            ) : (
              <p className="bw-ticket-note">Billet saisi à la main : pas de document joint.</p>
            )}
            {url ? (
              <div className="bw-ticket-actions">
                <a className="bw-action-primary" href={url} download={ticket.file_name ?? "billet"}>
                  <Download size={16} aria-hidden /> Télécharger
                </a>
                {offline ? (
                  <span className="bw-ticket-offline">
                    <WifiOff size={14} aria-hidden /> Disponible sans connexion sur ce téléphone
                  </span>
                ) : null}
              </div>
            ) : null}
            <dl className="bw-ticket-summary">
              {labels.company(ticket) ? (
                <>
                  <dt>Compagnie</dt>
                  <dd>
                    {labels.company(ticket)}
                    {d.vesselName ? ` · ${d.vesselName}` : ""}
                  </dd>
                </>
              ) : null}
              {d.legs.map((leg, i) => (
                <div key={i}>
                  <dt>{i ? "Retour" : "Aller"}</dt>
                  <dd>
                    {labels.port(leg.fromPortId)} → {labels.port(leg.toPortId)} · {day(leg.date)}
                    {leg.time ? ` · ${leg.time}` : ""}
                  </dd>
                </div>
              ))}
              {d.reference ? (
                <>
                  <dt>Référence</dt>
                  <dd>{d.reference}</dd>
                </>
              ) : null}
              {d.passengers.length ? (
                <>
                  <dt>Passagers</dt>
                  <dd>{d.passengers.join(", ")}</dd>
                </>
              ) : null}
              {d.vehicleKind ? (
                <>
                  <dt>Véhicule</dt>
                  <dd>
                    {d.vehicleKind}
                    {d.vehiclePlate ? ` · ${d.vehiclePlate}` : ""}
                  </dd>
                </>
              ) : null}
            </dl>
            <p className="bw-ticket-note">
              Effacé automatiquement le{" "}
              {new Date(ticket.delete_after).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
              })}
              . BledWay ne vérifie pas la validité du billet : seule la compagnie fait foi.
            </p>
            {confirming ? (
              <button
                type="button"
                className="bw-ticket-delete"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                <Trash2 size={14} aria-hidden /> Confirmer la suppression
              </button>
            ) : (
              <button
                type="button"
                className="bw-ticket-delete"
                onClick={() => setConfirming(true)}
              >
                <Trash2 size={14} aria-hidden /> Supprimer ce billet maintenant
              </button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** « Mes billets » : la liste, l'ajout et la consultation. */
export function MyTickets() {
  const { user } = useAuth();
  const tickets = useQuery(myTicketsQuery(user?.id));
  const labels = useTicketLabels();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<TicketRow | null>(null);
  useEffect(() => {
    if (tickets.data) void pruneLocal(tickets.data);
  }, [tickets.data]);
  if (!user || tickets.data === null) return null;
  return (
    <section className="bw-my-tickets" aria-label="Mes billets">
      <header>
        <h2>
          <Ticket size={18} aria-hidden /> Mes billets
        </h2>
        <button type="button" onClick={() => setAdding(true)}>
          <Plus size={15} aria-hidden /> Ajouter un billet
        </button>
      </header>
      {tickets.data?.length ? (
        <ul>
          {groupTickets(tickets.data).map((group) => {
            const first = group[0]!;
            const people = group.flatMap((t) => t.details.passengers);
            return (
              <li key={first.id} className="bw-ticket-group">
                <button type="button" onClick={() => setOpen(first)}>
                  <strong>{labels.route(first)}</strong>
                  <small>
                    {day(first.details.legs[0]?.date ?? null)}
                    {labels.company(first) ? ` · ${labels.company(first)}` : ""}
                    {group.length > 1
                      ? ` · ${group.length} billets${people.length ? ` · ${people.length} passager${people.length > 1 ? "s" : ""}` : ""}`
                      : people.length
                        ? ` · ${people.join(", ")}`
                        : ""}
                  </small>
                </button>
                {group.length > 1 ? (
                  // Au contrôle du port : un tap sur le nom ouvre le bon billet.
                  <div className="bw-ticket-people">
                    {group.map((t, i) => (
                      <button key={t.id} type="button" onClick={() => setOpen(t)}>
                        <Ticket size={13} aria-hidden /> {ticketName(t, i)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>Ajoutez votre billet : il est lu sur votre téléphone et prépare votre voyage.</p>
      )}
      <TicketImport open={adding} onOpenChange={setAdding} />
      <TicketViewer ticket={open} onClose={() => setOpen(null)} />
    </section>
  );
}

/** Dans la préparation : « Ajouter mon billet », ou « Voir mon billet » s'il est déjà là. */
export function TicketAction({ departureId }: { departureId: string }) {
  const { user } = useAuth();
  const tickets = useQuery(myTicketsQuery(user?.id));
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<TicketRow | null>(null);
  if (!user || tickets.data === null) return null;
  const mine =
    tickets.data?.filter(
      (t) => t.outbound_departure_id === departureId || t.inbound_departure_id === departureId,
    ) ?? [];
  return (
    <>
      {mine.length > 1 ? (
        mine.map((t, i) => (
          <button key={t.id} type="button" className="bw-ticket-link" onClick={() => setOpen(t)}>
            <Ticket size={13} aria-hidden /> {ticketName(t, i)}
          </button>
        ))
      ) : (
        <button
          type="button"
          className="bw-ticket-link"
          onClick={() => (mine[0] ? setOpen(mine[0]) : setAdding(true))}
        >
          <Ticket size={13} aria-hidden /> {mine[0] ? "Voir mon billet" : "Ajouter mon billet"}
        </button>
      )}
      <TicketImport open={adding} onOpenChange={setAdding} />
      <TicketViewer ticket={open} onClose={() => setOpen(null)} />
    </>
  );
}
