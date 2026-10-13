import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MailPlus, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import {
  inviteMember,
  listTeam,
  setMemberRole,
  TEAM_ROLES,
  type TeamRole,
} from "@/lib/admin/team.functions";
import { ROLE_INFO } from "./roles";

export function TeamAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchTeam = useServerFn(listTeam);
  const toggleRole = useServerFn(setMemberRole);
  const invite = useServerFn(inviteMember);
  const [search, setSearch] = useState("");
  const [onlyTeam, setOnlyTeam] = useState(true);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("editor");

  const { data: members = [], isLoading, error } = useQuery({
    queryKey: ["admin", "team"],
    queryFn: () => fetchTeam(),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: TeamRole; enabled: boolean }) =>
      toggleRole({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "team"] });
      toast.success("Droits mis à jour.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      invite({ data: { email, role: inviteRole, redirectTo: `${window.location.origin}/auth?mode=reset` } }),
    onSuccess: () => {
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin", "team"] });
      toast.success("Invitation envoyée par e-mail.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const q = search.trim().toLowerCase();
  const visible = members.filter(
    (m) =>
      (!onlyTeam || m.roles.length > 0) &&
      (!q || m.email?.toLowerCase().includes(q) || m.displayName?.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <MailPlus className="h-4 w-4 text-primary" /> Inviter un collaborateur
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Il reçoit un e-mail pour créer son mot de passe, avec le rôle choisi déjà attribué.
        </p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (email) inviteMutation.mutate();
          }}
        >
          <Input
            type="email"
            required
            placeholder="prenom@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="sm:flex-1"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as TeamRole)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {TEAM_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].label}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={inviteMutation.isPending}>
            {inviteMutation.isPending ? "Envoi…" : "Envoyer l'invitation"}
          </Button>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {TEAM_ROLES.map((r) => {
          const info = ROLE_INFO[r];
          return (
            <div key={r} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <info.icon className="h-4 w-4 text-primary" /> {info.label}
                <span className="ml-auto rounded-full bg-muted px-2 text-xs text-muted-foreground">
                  {members.filter((m) => m.roles.includes(r)).length}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{info.description}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher un e-mail ou un nom"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex rounded-lg bg-muted p-1 text-sm">
            <button
              type="button"
              onClick={() => setOnlyTeam(true)}
              className={`rounded-md px-3 py-1 ${onlyTeam ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Équipe
            </button>
            <button
              type="button"
              onClick={() => setOnlyTeam(false)}
              className={`rounded-md px-3 py-1 ${!onlyTeam ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Tous les comptes ({members.length})
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Chargement…</p>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">{(error as Error).message}</p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Aucun compte ne correspond.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((m) => (
              <li key={m.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(m.displayName ?? m.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.displayName ?? "Sans nom"}
                      {m.id === user?.id ? <span className="ml-2 text-xs text-primary">(vous)</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email} · {m.confirmed ? "confirmé" : "invitation en attente"}
                      {m.lastSignInAt
                        ? ` · vu le ${new Date(m.lastSignInAt).toLocaleDateString("fr-FR")}`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TEAM_ROLES.map((r) => {
                    const active = m.roles.includes(r);
                    const locked = r === "admin" && m.id === user?.id;
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={locked || roleMutation.isPending}
                        title={locked ? "Vous ne pouvez pas retirer vos propres droits" : undefined}
                        onClick={() => {
                          if (
                            active &&
                            !window.confirm(`Retirer le rôle ${ROLE_INFO[r].label} à ${m.email} ?`)
                          )
                            return;
                          roleMutation.mutate({ userId: m.id, role: r, enabled: !active });
                        }}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                        } disabled:opacity-60`}
                      >
                        {active ? <ShieldCheck className="h-3 w-3" /> : null}
                        {ROLE_INFO[r].label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
