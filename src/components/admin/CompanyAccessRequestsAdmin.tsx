import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { companyAccessRequest } from "@/lib/company/access";
import {
  ACCESS_REQUEST_STATUS,
  type AccessRequestList,
  type AccessRequestRow,
  type AccessRequestStatus,
} from "@/lib/company/accessRequest";
import { ModerationCard, ModerationSection, moderationEmpty, StatusFilter } from "./ModerationCard";

const whenFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});
const PILL: Record<AccessRequestStatus, string> = {
  new: "pending",
  contacted: "published",
  invited: "approved",
  declined: "rejected",
  spam: "hidden",
};

const accessRequestsKey = (userId: string) => ["company-access", userId, "access-requests"];

/** Demandes reçues depuis la page d'accueil professionnelle. Administrateurs seulement. */
export function useAccessRequests() {
  const { user, isAdmin } = useAuth();
  return useQuery({
    queryKey: accessRequestsKey(user?.id ?? ""),
    queryFn: () => companyAccessRequest<AccessRequestList>({ action: "admin_access_requests" }),
    enabled: Boolean(user) && isAdmin,
    staleTime: 30_000,
    refetchInterval: 120_000,
    retry: false,
  });
}

export function useAccessRequestsCount() {
  return useAccessRequests().data?.pending ?? 0;
}

type Filter = "new" | "done";

export function CompanyAccessRequestsAdmin() {
  const { isAdmin } = useAuth();
  const list = useAccessRequests();
  const [filter, setFilter] = useState<Filter>("new");
  if (!isAdmin) return null;
  const rows = (list.data?.requests ?? []).filter((row) =>
    filter === "new" ? row.status === "new" : row.status !== "new",
  );
  return (
    <div className="mt-5">
      <ModerationSection
        title="Demandes d'accès"
        count={list.data?.pending}
        hint="Envoyées depuis la page d'accueil de l'espace compagnie. Une demande n'ouvre aucun accès : vérifiez la personne auprès de la compagnie, puis créez l'invitation dans « Fiches compagnies → Accès professionnels »."
        toolbar={
          <StatusFilter
            label="Afficher"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "new", label: "Nouvelles" },
              { value: "done", label: "Suivies" },
            ]}
          />
        }
      >
        {list.isPending ? (
          moderationEmpty("Chargement…")
        ) : list.isError ? (
          moderationEmpty((list.error as Error).message)
        ) : rows.length ? (
          <ul className="bo-modlist">
            {rows.map((row) => (
              <AccessRequestCard key={row.id} row={row} />
            ))}
          </ul>
        ) : (
          moderationEmpty(filter === "new" ? "Aucune nouvelle demande." : "Aucune demande suivie.")
        )}
      </ModerationSection>
    </div>
  );
}

function AccessRequestCard({ row }: { row: AccessRequestRow }) {
  const client = useQueryClient();
  const [note, setNote] = useState(row.decisionNote ?? "");
  const decide = useMutation({
    mutationFn: (status: AccessRequestStatus) =>
      companyAccessRequest({
        action: "admin_access_request_decide",
        id: row.id,
        status,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: (_, status) =>
      toast.success(`Demande marquée « ${ACCESS_REQUEST_STATUS[status]} ».`),
    onError: (error) => toast.error((error as Error).message),
    onSettled: () => void client.invalidateQueries({ queryKey: ["company-access"] }),
  });
  const next: AccessRequestStatus[] = (
    ["contacted", "invited", "declined", "spam", "new"] as AccessRequestStatus[]
  ).filter((status) => status !== row.status);
  return (
    <ModerationCard
      title={`${row.fullName} · ${row.companyName}`}
      status={PILL[row.status]}
      statusLabel={ACCESS_REQUEST_STATUS[row.status]}
      meta={
        <>
          {row.jobTitle} · reçue le {whenFmt.format(new Date(row.createdAt))}
          {row.knownCompany
            ? ` · compagnie reconnue : ${row.knownCompany}`
            : " · compagnie absente de la liste"}
          {row.hasAccount ? " · déjà inscrite sur BledWay" : ""}
        </>
      }
      actions={
        <div className="grid w-full gap-2">
          <Textarea
            value={note}
            maxLength={500}
            rows={2}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note interne (facultative) : qui a été contacté, ce qui a été vérifié…"
            aria-label="Note interne"
          />
          <div className="flex flex-wrap gap-2">
            {next.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === "invited" ? "default" : "outline"}
                disabled={decide.isPending}
                onClick={() => decide.mutate(status)}
              >
                {status === "new" ? "Remettre en nouvelle" : ACCESS_REQUEST_STATUS[status]}
              </Button>
            ))}
          </div>
        </div>
      }
    >
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <a className="inline-flex items-center gap-1.5 underline" href={`mailto:${row.email}`}>
          <Mail className="size-3.5" aria-hidden />
          {row.email}
        </a>
        {row.phone ? (
          <span className="inline-flex items-center gap-1.5">
            <Phone className="size-3.5" aria-hidden />
            {row.phone}
          </span>
        ) : null}
      </p>
      {row.message ? <p className="mt-1 whitespace-pre-line">« {row.message} »</p> : null}
      {row.decisionNote && row.status !== "new" ? (
        <p className="mt-1 text-xs text-muted-foreground">Note : {row.decisionNote}</p>
      ) : null}
    </ModerationCard>
  );
}
