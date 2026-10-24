import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Search,
  UserPlus,
  ShieldCheck,
  Ban,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { userAdminAction, type ManagedUser, type UsersPage } from "@/lib/admin/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const auditLabels: Record<string, string> = {
  invitation_requested: "Invitation demandée",
  invitation_sent: "Invitation envoyée",
  ban_requested: "Bannissement demandé",
  ban_completed: "Compte banni",
  unban_requested: "Réactivation demandée",
  unban_completed: "Compte réactivé",
  delete_requested: "Suppression demandée",
  delete_completed: "Compte supprimé",
  role_requested: "Changement de rôle demandé",
  role_changed: "Permissions modifiées",
  role_completed: "Changement de rôle confirmé",
};
const roleLabels = { admin: "Administrateur", editor: "Éditeur", moderator: "Modérateur" };
type Change = {
  action: "ban" | "unban" | "delete" | "role";
  member: ManagedUser;
  role?: string;
  enabled?: boolean;
};
export function UsersAdmin() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [change, setChange] = useState<Change | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("168h");
  const result = useQuery({
    queryKey: ["admin", "users", user?.id, query, filter, page],
    queryFn: () => userAdminAction<UsersPage>({ action: "list", search: query, filter, page }),
    enabled: Boolean(user),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => userAdminAction(input),
    onSuccess: () => {
      toast.success("Opération enregistrée.");
      setInviteOpen(false);
      setChange(null);
      setEmail("");
      void client.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const openChange = (next: Change) => {
    setChange(next);
    setConfirmation("");
    setReason("");
    mutation.reset();
  };
  const banned = (member: ManagedUser) =>
    Boolean(member.banned_until && Date.parse(member.banned_until) > Date.now());
  const actionTitle =
    change?.action === "delete"
      ? "Supprimer le compte"
      : change?.action === "ban"
        ? "Bannir le compte"
        : change?.action === "unban"
          ? "Réactiver le compte"
          : "Modifier les permissions";
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Les utilisateurs</h2>
            <p className="text-xs text-muted-foreground">
              Comptes voyageurs, accès équipe et historique des opérations.
            </p>
          </div>
          <Button
            onClick={() => {
              setInviteOpen(true);
              mutation.reset();
            }}
          >
            <UserPlus size={16} /> Inviter
          </Button>
        </div>
        <form
          className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher par nom ou e-mail</span>
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom ou e-mail"
              maxLength={150}
              className="pl-9"
            />
          </label>
          <Button type="submit" variant="outline">
            Rechercher
          </Button>
          <select
            aria-label="Afficher les comptes"
            className="col-span-2 min-h-10 w-full max-w-full rounded-lg border bg-background px-3 text-sm sm:w-auto"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tous les comptes</option>
            <option value="team">Équipe</option>
            <option value="banned">Bannis</option>
          </select>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          {result.data ? `${result.data.total} compte(s) · page ${page}` : ""}
        </p>
      </section>
      {result.isPending ? (
        <p role="status">Chargement des utilisateurs…</p>
      ) : result.error ? (
        <div role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">
          {result.error.message}
          <Button variant="outline" className="mt-2 block" onClick={() => void result.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {result.data?.members.map((member) => {
              const self = member.id === user?.id;
              const protectedAdmin = member.roles.includes("admin");
              return (
                <article key={member.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-bold text-primary"
                    >
                      {(member.display_name || member.email || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-bold">
                        {member.display_name || "Voyageur"}
                        {self ? " · vous" : ""}
                      </h3>
                      <p className="break-all text-xs text-muted-foreground">
                        {member.email || member.id}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {banned(member)
                          ? "Banni"
                          : member.email_confirmed_at
                            ? "Actif"
                            : "E-mail à confirmer"}{" "}
                        · Inscrit le {new Date(member.created_at).toLocaleDateString("fr-FR")}
                        {member.last_sign_in_at
                          ? ` · Dernière connexion : ${new Date(member.last_sign_in_at).toLocaleDateString("fr-FR")}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(Object.keys(roleLabels) as (keyof typeof roleLabels)[]).map((role) => (
                      <button
                        key={role}
                        type="button"
                        disabled={self || mutation.isPending || banned(member)}
                        aria-pressed={member.roles.includes(role)}
                        onClick={() =>
                          openChange({
                            action: "role",
                            member,
                            role,
                            enabled: !member.roles.includes(role),
                          })
                        }
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-50 ${member.roles.includes(role) ? "border-primary/30 bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}
                      >
                        <ShieldCheck size={13} />
                        {roleLabels[role]}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={self || protectedAdmin || mutation.isPending}
                      onClick={() =>
                        openChange({ action: banned(member) ? "unban" : "ban", member })
                      }
                    >
                      <Ban size={14} />
                      {banned(member) ? "Réactiver" : "Bannir"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={self || protectedAdmin || mutation.isPending}
                      className="text-destructive"
                      onClick={() => openChange({ action: "delete", member })}
                    >
                      <Trash2 size={14} />
                      Supprimer
                    </Button>
                    {protectedAdmin && (
                      <p className="self-center text-[10px] text-muted-foreground">
                        Compte administrateur protégé
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {!result.data?.members.length && (
            <p className="rounded-xl border p-5 text-sm">
              Aucun compte ne correspond à cette recherche.
            </p>
          )}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              disabled={page === 1 || result.isFetching}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} />
              Précédent
            </Button>
            <Button
              variant="outline"
              disabled={page * 30 >= (result.data?.total ?? 0) || result.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Suivant
              <ChevronRight size={16} />
            </Button>
          </div>
          <details className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer text-sm font-semibold">Dernières opérations</summary>
            <ul className="mt-3 space-y-2 text-xs">
              {result.data?.audit.map((entry, i) => (
                <li key={`${entry.created_at}-${i}`} className="break-all border-b pb-2">
                  <b>{auditLabels[entry.action] ?? "Opération sur un compte"}</b> ·{" "}
                  {new Date(entry.created_at).toLocaleString("fr-FR")}
                  <span className="block text-[10px] text-muted-foreground">
                    Auteur : {entry.actor_id ?? "Compte supprimé"} · Cible :{" "}
                    {entry.target_id ?? "Invitation"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (!mutation.isPending) setInviteOpen(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inviter un utilisateur</DialogTitle>
            <DialogDescription>
              Un e-mail lui permet de créer son compte voyageur. Vous pourrez ensuite attribuer un
              rôle à son compte.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({ action: "invite", email });
            }}
            className="space-y-4"
          >
            <label className="block text-sm">
              Adresse e-mail
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                autoComplete="off"
              />
            </label>
            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Envoi…" : "Envoyer l’invitation"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(change)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setChange(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>{change?.member.email ?? change?.member.id}</DialogDescription>
          </DialogHeader>
          {change && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({
                  action: change.action,
                  userId: change.member.id,
                  confirmation,
                  reason,
                  ...(change.action === "ban" ? { duration } : {}),
                  ...(change.action === "role"
                    ? { role: change.role, enabled: change.enabled }
                    : {}),
                });
              }}
            >
              <p className="text-sm">
                {change.action === "delete"
                  ? "Action définitive : suppression du compte, de ses suivis et de ses avatars. Ses données liées suivent les règles de suppression de la base."
                  : change.action === "ban"
                    ? "Le compte ne pourra plus se connecter ni utiliser ses droits sur les données. Ses abonnements push et suivis seront désactivés."
                    : change.action === "unban"
                      ? "Le voyageur pourra se reconnecter. Il devra réactiver ses suivis et ses notifications."
                      : `${change.enabled ? "Accorder" : "Retirer"} le rôle ${roleLabels[change.role as keyof typeof roleLabels]}.`}
              </p>
              {change.action === "ban" && (
                <label className="block text-sm">
                  Durée
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="mt-1 block min-h-10 w-full rounded-lg border bg-background px-3"
                  >
                    <option value="24h">24 heures</option>
                    <option value="168h">7 jours</option>
                    <option value="876000h">Durée indéterminée</option>
                  </select>
                </label>
              )}
              <label className="block text-sm">
                Motif
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={3}
                  maxLength={500}
                  className="mt-1 block min-h-20 w-full rounded-lg border bg-background p-2"
                />
              </label>
              <label className="block text-sm">
                Recopiez {change.member.email ? "l’adresse e-mail" : "l’identifiant"} du compte pour
                confirmer
                <Input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              {mutation.error && (
                <p role="alert" className="text-sm text-destructive">
                  {mutation.error.message}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => setChange(null)}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  variant={change.action === "delete" ? "destructive" : "default"}
                  disabled={
                    mutation.isPending ||
                    confirmation.trim().toLowerCase() !==
                      (change.member.email ?? change.member.id).toLowerCase() ||
                    reason.trim().length < 3
                  }
                >
                  {mutation.isPending ? "Traitement…" : "Confirmer"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
