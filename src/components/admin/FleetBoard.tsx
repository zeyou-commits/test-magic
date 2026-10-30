import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Archive, Plus, Ship } from "lucide-react";
import { toast } from "sonner";
import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import {
  adminPortsQuery,
  adminRoutesQuery,
  companiesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import type { Vessel } from "@/lib/ferry/types";
import { planningDeparturesQuery } from "@/lib/admin/planning";
import { aliasKey, matchName, REVIEW_SCORE } from "@/lib/admin/importMatching";
import { aisHealthQuery, ageLabel } from "@/lib/admin/aisHealth";

// Fonctions de la flotte (script SQL « admin_flotte ») pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;
const SQL_HINT =
  "Exécutez d'abord le script SQL « admin_flotte » (supabase/migrations/20261110140000_admin_flotte.sql) dans Supabase.";
const explain = (message: string) =>
  /function|does not exist|schema cache/i.test(message) ? SQL_HINT : message;

type RemoveMode = "archive" | "replace" | "merge" | "delete";
const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Flotte & compagnies : une compagnie à gauche, ses navires à droite. Retirer un navire ouvre
 * un choix guidé (archiver, remplacer, fusionner un doublon, supprimer) avec ce qui en dépend.
 */
export function FleetBoard({
  initialVesselId,
  renderEditor,
  onOpenCompany,
}: {
  initialVesselId?: string | undefined;
  renderEditor: (vessel: Vessel) => ReactNode;
  onOpenCompany: (companyId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: planning = [] } = useQuery(planningDeparturesQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const aisHealth = useQuery(aisHealthQuery).data;
  const initial = vessels.find((v) => v.id === initialVesselId);
  // Rien de choisi : la compagnie du navire demandé, sinon la première (données parfois pas encore chargées).
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialVesselId ?? null);
  const [removing, setRemoving] = useState<Vessel | null>(null);
  const [creating, setCreating] = useState<"vessel" | "company" | null>(null);

  const now = Date.now();
  const upcomingOf = (id: string) =>
    planning.filter(
      (d) => d.vessel_id === id && Date.parse(d.departure_at) >= now && d.status !== "cancelled",
    );
  const routeLabel = (id: string) => {
    const route = routes.find((r) => r.id === id);
    const name = (portId: string | undefined) => ports.find((p) => p.id === portId)?.name ?? "?";
    return route ? `${name(route.departure_port_id)} → ${name(route.arrival_port_id)}` : "?";
  };
  const companyName = (id: string | null) =>
    companies.find((c) => c.id === id)?.name ?? "Sans compagnie";
  const selectedCompany = companyId ?? initial?.company_id ?? companies[0]?.id ?? "none";
  const fleetOf = (id: string) =>
    vessels.filter((v) => (id === "none" ? !v.company_id : v.company_id === id));
  const shown = fleetOf(selectedCompany).filter((v) => showArchived || v.status === "active");
  const archivedCount = fleetOf(selectedCompany).filter((v) => v.status !== "active").length;

  // Doublons possibles : deux fiches actives de la même compagnie aux noms très proches.
  const active = vessels.filter((v) => v.status === "active");
  const duplicates: [Vessel, Vessel][] = [];
  for (const [index, vessel] of active.entries()) {
    const others = active
      .slice(index + 1)
      .filter((o) => !vessel.company_id || !o.company_id || o.company_id === vessel.company_id);
    const match = matchName(
      vessel.name,
      others.map((o) => ({ id: o.id, name: o.name, noise: [companyName(o.company_id)] })),
    );
    const twin = others.find((o) => o.id === match.id);
    if (twin && match.score >= REVIEW_SCORE) duplicates.push([vessel, twin]);
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["vessels"] });
    void queryClient.invalidateQueries({ queryKey: ["departures"] });
    void queryClient.invalidateQueries({ queryKey: ["schedules"] });
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };
  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vessels").update({ status: "active" }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Navire réactivé : il réapparaît sur le site.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const open = vessels.find((v) => v.id === openId);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          {companies.length} compagnies · {active.length} navires actifs
          {vessels.length > active.length ? ` · ${vessels.length - active.length} archivé(s)` : ""}
        </p>
        <Button size="sm" variant="outline" onClick={() => setCreating("company")}>
          <Plus className="size-4" /> Compagnie
        </Button>
        <Button size="sm" onClick={() => setCreating("vessel")}>
          <Plus className="size-4" /> Navire
        </Button>
      </div>

      {duplicates.map(([a, b]) => (
        <div
          key={`${a.id}:${b.id}`}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <span className="flex-1">
            <strong>Doublon possible :</strong> « {a.name} » et « {b.name} » (
            {companyName(a.company_id ?? b.company_id)}).
          </span>
          <Button size="sm" variant="outline" onClick={() => setRemoving(b)}>
            Fusionner…
          </Button>
        </div>
      ))}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Compagnies" className="bw-admin-surface grid content-start gap-1 p-2">
          {[
            ...companies.map((c) => ({ id: c.id, name: c.name })),
            ...(fleetOf("none").length ? [{ id: "none", name: "Sans compagnie" }] : []),
          ].map((company) => {
            const on = selectedCompany === company.id;
            return (
              <button
                key={company.id}
                type="button"
                aria-pressed={on}
                onClick={() => setCompanyId(company.id)}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm ${
                  on ? "bg-foreground text-background" : "hover:bg-muted"
                }`}
              >
                <span className="flex-1 leading-snug">{company.name}</span>
                <span className="text-xs font-semibold tabular-nums">
                  {fleetOf(company.id).filter((v) => v.status === "active").length}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="grid content-start gap-3">
          <div className="bw-admin-surface flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-56 flex-1">
              <h2 className="text-lg font-semibold">
                {companyName(selectedCompany === "none" ? null : selectedCompany)}
              </h2>
              <p className="text-xs text-muted-foreground">
                {shown.filter((v) => v.status === "active").length} navire(s) actif(s)
                {fleetOf(selectedCompany).filter((v) => v.status === "active").length === 1
                  ? " · un seul navire : ses traversées sans navire lui sont proposées automatiquement"
                  : ""}
              </p>
            </div>
            {archivedCount > 0 && (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Afficher les {archivedCount} archivé(s)
              </label>
            )}
            {selectedCompany !== "none" && (
              <Button size="sm" variant="outline" onClick={() => onOpenCompany(selectedCompany)}>
                Fiche, fusion, suppression
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((vessel) => {
              const upcoming = upcomingOf(vessel.id);
              const next = upcoming[0];
              const archived = vessel.status !== "active";
              return (
                <article
                  key={vessel.id}
                  className={`flex flex-col gap-3 rounded-xl border border-border bg-white p-3 ${archived ? "opacity-60" : ""}`}
                >
                  {vessel.photo_url ? (
                    <img
                      src={vessel.photo_url}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-28 w-full rounded-lg border object-cover"
                    />
                  ) : (
                    <span className="grid h-28 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Ship className="size-8" aria-hidden />
                    </span>
                  )}
                  <div>
                    <h3 className="text-sm font-semibold">{vessel.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {archived
                        ? "Archivé : n'apparaît plus sur le site"
                        : next
                          ? `Prochaine : ${routeLabel(next.route_id)}, ${new Date(next.departure_at).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${upcoming.length} à venir`
                          : "Aucune traversée à venir"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {vessel.mmsi ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Signal AIS {ageLabel(aisHealth?.lastSignal.get(Number(vessel.mmsi)))}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        Sans MMSI
                      </span>
                    )}
                    {!vessel.photo_url && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
                        Sans photo
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setOpenId(vessel.id)}
                    >
                      Ouvrir la fiche
                    </Button>
                    {archived ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={reactivate.isPending}
                        onClick={() => reactivate.mutate(vessel.id)}
                      >
                        Réactiver
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setRemoving(vessel)}
                      >
                        Retirer…
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
            {shown.length === 0 && (
              <p className="rounded-xl border border-border bg-white p-4 text-sm text-muted-foreground">
                Aucun navire pour cette compagnie.
              </p>
            )}
          </div>
        </section>
      </div>

      {open && (
        <AdminDrawer
          open
          onOpenChange={(next) => !next && setOpenId(null)}
          title={open.name}
          description="Suivi en direct (MMSI), lien VesselFinder (IMO), photo et caractéristiques."
        >
          {renderEditor(open)}
        </AdminDrawer>
      )}

      {removing && (
        <RemoveVesselDialog
          vessel={removing}
          fleet={vessels.filter((v) => v.id !== removing.id && v.status === "active")}
          upcoming={upcomingOf(removing.id).length}
          companyName={companyName}
          onClose={() => setRemoving(null)}
          onDone={(message, undoArchive) => {
            setRemoving(null);
            refresh();
            toast.success(
              message,
              undoArchive
                ? { action: { label: "Annuler", onClick: () => reactivate.mutate(removing.id) } }
                : {},
            );
          }}
        />
      )}

      {creating && (
        <CreateDialog
          kind={creating}
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          defaultCompany={selectedCompany === "none" ? "" : selectedCompany}
          takenSlugs={
            creating === "vessel" ? vessels.map((v) => v.slug) : companies.map((c) => c.slug)
          }
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null);
            void queryClient.invalidateQueries({ queryKey: ["vessels"] });
            void queryClient.invalidateQueries({ queryKey: ["companies"] });
            if (creating === "company") setCompanyId(id);
            else setOpenId(id);
          }}
        />
      )}
    </div>
  );
}

function RemoveVesselDialog({
  vessel,
  fleet,
  upcoming,
  companyName,
  onClose,
  onDone,
}: {
  vessel: Vessel;
  fleet: Vessel[];
  upcoming: number;
  companyName: (id: string | null) => string;
  onClose: () => void;
  onDone: (message: string, undoArchive: boolean) => void;
}) {
  const usage = useQuery({
    queryKey: ["admin", "vessel-usage", vessel.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bw_admin_vessel_usage", { p_vessel: vessel.id });
      if (error) throw new Error(explain(error.message));
      return data as Record<string, number>;
    },
    retry: false,
  });
  // Les navires de la même compagnie d'abord : c'est presque toujours le bon remplaçant.
  const options = [...fleet].sort(
    (a, b) =>
      Number(b.company_id === vessel.company_id) - Number(a.company_id === vessel.company_id) ||
      a.name.localeCompare(b.name, "fr"),
  );
  const [mode, setMode] = useState<RemoveMode>("archive");
  const [target, setTarget] = useState(options[0]?.id ?? "");
  const [release, setRelease] = useState(true);
  const used = usage.data ? Object.keys(usage.data).length > 0 : true;

  const run = useMutation({
    mutationFn: async () => {
      const call = async (name: string, args: Record<string, unknown>) => {
        const { error } = await supabase.rpc(name, args);
        if (error) throw new Error(explain(error.message));
      };
      const targetName = fleet.find((v) => v.id === target)?.name ?? "";
      if (mode === "archive") {
        await call("bw_admin_archive_vessel", { p_vessel: vessel.id, p_release_upcoming: release });
        return { message: `« ${vessel.name} » archivé.`, undo: true };
      }
      if (mode === "replace") {
        await call("bw_admin_replace_vessel", { p_vessel: vessel.id, p_replacement: target });
        return {
          message: `Traversées à venir de « ${vessel.name} » transférées à « ${targetName} ».`,
          undo: false,
        };
      }
      if (mode === "merge") {
        await call("bw_admin_merge_vessels", {
          p_keep: target,
          p_remove: vessel.id,
          p_alias_key: aliasKey(vessel.name),
        });
        return { message: `« ${vessel.name} » fusionné dans « ${targetName} ».`, undo: false };
      }
      await call("bw_admin_delete_vessel", { p_vessel: vessel.id });
      return { message: `« ${vessel.name} » supprimé.`, undo: false };
    },
    onSuccess: ({ message, undo }) => onDone(message, undo),
    onError: (error: Error) => toast.error(error.message),
  });

  const usageText = usage.isPending
    ? "Vérification de ce qui dépend de ce navire…"
    : usage.error
      ? `${usage.error.message} ${upcoming ? `Il a ${upcoming} traversée(s) à venir.` : ""}`
      : used
        ? `${upcoming} traversée(s) à venir, ${usage.data?.["public.departures.vessel_id"] ?? 0} au total, ${
            usage.data?.["public.schedules.default_vessel_id"] ?? 0
          } programme(s) récurrent(s), ainsi que des avis, signalements ou suivis éventuels.`
        : "Rien ne dépend de ce navire.";

  const choices: { id: RemoveMode; title: string; text: string; disabled?: boolean }[] = [
    {
      id: "archive",
      title: "Archiver (recommandé)",
      text: "Le navire disparaît du site et des listes, son historique est gardé. Réactivable en un clic.",
    },
    {
      id: "replace",
      title: "Remplacer par un autre navire",
      text: "Ses traversées à venir et ses programmes passent sur le navire choisi, puis il est archivé.",
      disabled: !options.length,
    },
    {
      id: "merge",
      title: "C'est un doublon : fusionner",
      text: "Tout passe sur l'autre fiche (traversées, avis, suivis, MMSI, photo), puis cette fiche est supprimée. Le nom reste reconnu aux prochains imports.",
      disabled: !options.length,
    },
    {
      id: "delete",
      title: "Supprimer définitivement",
      text: used
        ? "Impossible tant que quelque chose dépend de ce navire : archivez, remplacez ou fusionnez."
        : "Pour une fiche créée par erreur.",
      disabled: used,
    },
  ];

  return (
    <Dialog open onOpenChange={(next) => !next && !run.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Retirer « {vessel.name} » ?</DialogTitle>
          <DialogDescription>
            {companyName(vessel.company_id)} · {usageText}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="sr-only">Que faire de ce navire ?</legend>
          {choices.map((choice) => (
            <label
              key={choice.id}
              className={`flex gap-3 rounded-xl border-2 p-3 ${
                mode === choice.id ? "border-primary" : "border-border"
              } ${choice.disabled ? "cursor-not-allowed bg-muted/40 opacity-70" : "cursor-pointer"}`}
            >
              <input
                type="radio"
                name="vessel-remove"
                className="mt-1"
                checked={mode === choice.id}
                disabled={choice.disabled}
                onChange={() => setMode(choice.id)}
              />
              <span>
                <span className="block text-sm font-semibold">{choice.title}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {choice.text}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {mode === "archive" && upcoming > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={release}
              onChange={(e) => setRelease(e.target.checked)}
            />
            Passer ses {upcoming} traversée(s) à venir en « navire à choisir »
          </label>
        )}
        {(mode === "replace" || mode === "merge") && (
          <label className="grid gap-1 text-sm font-medium">
            {mode === "replace" ? "Navire de remplacement" : "Fiche à garder"}
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-2"
            >
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {companyName(v.company_id)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={run.isPending} onClick={onClose}>
            Garder le navire
          </Button>
          <Button
            variant={mode === "delete" ? "destructive" : "default"}
            disabled={run.isPending || ((mode === "replace" || mode === "merge") && !target)}
            onClick={() => run.mutate()}
          >
            {mode === "archive" ? (
              <>
                <Archive className="size-4" /> Archiver
              </>
            ) : mode === "replace" ? (
              "Transférer et archiver"
            ) : mode === "merge" ? (
              "Fusionner"
            ) : (
              "Supprimer"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({
  kind,
  companies,
  defaultCompany,
  takenSlugs,
  onClose,
  onCreated,
}: {
  kind: "vessel" | "company";
  companies: { id: string; name: string }[];
  defaultCompany: string;
  takenSlugs: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState(defaultCompany);
  const [mmsi, setMmsi] = useState("");
  const [website, setWebsite] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const base = slug(name) || "element";
      let candidate = base;
      for (let i = 2; takenSlugs.includes(candidate); i += 1) candidate = `${base}-${i}`;
      const values: Record<string, string | number | null> =
        kind === "vessel"
          ? {
              name: name.trim(),
              slug: candidate,
              company_id: company || null,
              mmsi: mmsi ? Number(mmsi) : null,
              status: "active",
            }
          : {
              name: name.trim(),
              slug: candidate,
              website_url: website.trim() || null,
              status: "active",
            };
      const { data, error } = await supabase
        .from(kind === "vessel" ? "vessels" : "companies")
        .insert(values)
        .select("id")
        .single();
      if (error)
        throw new Error(
          error.message.includes("unique") ? "Ce MMSI ou ce nom existe déjà." : error.message,
        );
      return (data as { id: string }).id;
    },
    onSuccess: (id) => {
      toast.success(
        kind === "vessel" ? "Navire ajouté : complétez sa fiche." : "Compagnie ajoutée.",
      );
      onCreated(id);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const valid =
    name.trim().length >= 2 &&
    (kind === "company" || mmsi === "" || /^\d{9}$/.test(mmsi)) &&
    (kind === "vessel" || website === "" || /^https:\/\//.test(website));
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === "vessel" ? "Ajouter un navire" : "Ajouter une compagnie"}
          </DialogTitle>
          <DialogDescription>
            {kind === "vessel"
              ? "Le nom suffit : photo et caractéristiques se complètent ensuite dans sa fiche."
              : "Le logo et la description se complètent ensuite dans sa fiche."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Nom
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </label>
          {kind === "vessel" ? (
            <>
              <label className="grid gap-1 text-sm font-medium">
                Compagnie
                <select
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-2"
                >
                  <option value="">Sans compagnie</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                MMSI (facultatif, 9 chiffres)
                <Input
                  inputMode="numeric"
                  maxLength={9}
                  value={mmsi}
                  onChange={(e) => setMmsi(e.target.value.replace(/\D/g, ""))}
                />
              </label>
            </>
          ) : (
            <label className="grid gap-1 text-sm font-medium">
              Site officiel (facultatif)
              <Input
                type="url"
                placeholder="https://…"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              Ajouter
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
