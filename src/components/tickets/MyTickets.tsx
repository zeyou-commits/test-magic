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
  const [type, setType] = useState<string>("");
  const [offline, setOffline] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    setUrl(null);
    setProblem(null);
    setConfirming(false);
    if (!ticket?.file_path) return;
    let objectUrl: string | null = null;
    void ticketFile(ticket)
      .then(({ file, offline: local }) => {
        objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        setType(file.type || ticket.file_type || "");
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
                  <object data={url} type="application/pdf" aria-label="Billet PDF">
                    <a href={url} target="_blank" rel="noreferrer">
                      Ouvrir le billet PDF
                    </a>
                  </object>
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
          {tickets.data.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setOpen(t)}>
                <strong>{labels.route(t)}</strong>
                <small>
                  {day(t.details.legs[0]?.date ?? null)}
                  {labels.company(t) ? ` · ${labels.company(t)}` : ""}
                </small>
              </button>
            </li>
          ))}
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
  const mine = tickets.data?.find(
    (t) => t.outbound_departure_id === departureId || t.inbound_departure_id === departureId,
  );
  return (
    <>
      <button
        type="button"
        className="bw-ticket-link"
        onClick={() => (mine ? setOpen(mine) : setAdding(true))}
      >
        <Ticket size={13} aria-hidden /> {mine ? "Voir mon billet" : "Ajouter mon billet"}
      </button>
      <TicketImport open={adding} onOpenChange={setAdding} />
      <TicketViewer ticket={open} onClose={() => setOpen(null)} />
    </>
  );
}
