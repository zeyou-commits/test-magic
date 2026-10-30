import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeftRight, Combine, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { companiesQuery, vesselsQuery } from "@/lib/ferry/queries";
import type { Company } from "@/lib/ferry/types";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminDrawer, AdminListToolbar, matches } from "./AdminDrawer";

// Fonctions de fusion (script du 31/10), absentes des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;
const SCRIPT = "20261031130000_admin_compagnies_fusion.sql";

const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const stopWords = new Set(["ferries", "ferry", "lines", "line", "sa", "spa", "cie", "compagnie", "de", "la", "le", "the"]);
const tokens = (name: string) => plain(name).split(" ").filter((word) => word && !stopWords.has(word));
/** Deux noms qui désignent probablement la même compagnie (accents, tirets, sigle, nom raccourci). */
function sameCompany(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.every((word) => long.includes(word))) return true;
  const initials = (words: string[]) => words.map((word) => word[0]).join("");
  return (short.length === 1 && short[0] === initials(long)) || ta.join("") === tb.join("");
}
function slugFrom(name: string, taken: string[]) {
  const base = plain(name).replace(/ /g, "-") || "compagnie";
  let slug = base;
  for (let n = 2; taken.includes(slug); n += 1) slug = `${base}-${n}`;
  return slug;
}
const usageText: Record<string, string> = {
  "departures.company_id": "départ",
  "vessels.company_id": "navire",
  "schedules.company_id": "calendrier",
  "route_operators.company_id": "liaison opérée",
  "bw_news.company_ids": "Flash info",
};
const describeUsage = (usage: Record<string, number>) =>
  Object.entries(usage)
    .map(([key, count]) => `${count} ${usageText[key] ?? key}${count > 1 && usageText[key] ? "s" : ""}`)
    .join(", ");
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
const failure = (error: { code?: string; message: string }) =>
  error.code === "PGRST202"
    ? `Fonction absente : exécutez le script ${SCRIPT} dans Supabase.`
    : /utilisée|introuvable|différentes|impossible/.test(error.message)
      ? error.message
      : /row-level|permission|Accès refusé|42501/.test(error.message)
        ? "Droits insuffisants : rôle admin requis."
        : "L’opération n’a pas abouti. Réessayez.";

/** Nombre de départs, navires et liaisons par compagnie (lecture publique, calcul côté admin). */
function useCompanyCounts() {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const links = useQuery({
    queryKey: ["admin", "company-links"],
    queryFn: async () => {
      const [departures, operators] = await Promise.all([
        supabase.from("departures").select("company_id").limit(20000),
        supabase.from("route_operators").select("company_id").limit(5000),
      ]);
      if (departures.error) throw new Error(departures.error.message);
      return {
        departures: (departures.data ?? []) as { company_id: string | null }[],
        operators: (operators.data ?? []) as { company_id: string | null }[],
      };
    },
    staleTime: 60_000,
  });
  return (id: string) => ({
    departures: links.data?.departures.filter((row) => row.company_id === id).length ?? 0,
    vessels: vessels.filter((vessel) => vessel.company_id === id).length,
    routes: links.data?.operators.filter((row) => row.company_id === id).length ?? 0,
  });
}

export function CompaniesAdmin({ itemId }: { itemId?: string | undefined } = {}) {
  const { data: companies = [] } = useQuery(companiesQuery);
  const countsOf = useCompanyCounts();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | "new" | null>(itemId ?? null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  useEffect(() => {
    if (itemId) setOpenId(itemId);
  }, [itemId]);
  const list = companies.filter((company) => matches(search, company.name, company.website_url));
  const duplicates = companies.flatMap((a, i) =>
    companies.slice(i + 1).filter((b) => sameCompany(a.name, b.name)).map((b) => [a, b] as const),
  );
  const open = openId && openId !== "new" ? companies.find((company) => company.id === openId) : undefined;
  return (
    <div className="bw-admin-surface bw-admin-editor mt-4 p-4 sm:p-5">
      {duplicates.length ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <TriangleAlert className="size-4" aria-hidden />
            {duplicates.length} doublon{duplicates.length > 1 ? "s" : ""} possible{duplicates.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-2 grid gap-1.5">
            {duplicates.map(([a, b]) => (
              <li key={`${a.id}:${b.id}`} className="flex flex-wrap items-center gap-2">
                <span>
                  « {a.name} » et « {b.name} »
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // On garde celle qui porte le plus de départs ; l'admin peut inverser ensuite.
                    const [keep, remove] = countsOf(a.id).departures >= countsOf(b.id).departures ? [a, b] : [b, a];
                    setOpenId(keep.id);
                    setMergeTarget(remove.id);
                  }}
                >
                  <Combine className="size-4" aria-hidden /> Fusionner
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <AdminListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Chercher une compagnie"
        count={list.length}
        total={companies.length}
        onCreate={() => setOpenId("new")}
        createLabel="Nouvelle compagnie"
      />
      <ul className="bw-admin-list mt-3">
        {list.map((company) => {
          const counts = countsOf(company.id);
          return (
            <li key={company.id}>
              <button
                type="button"
                className="bw-admin-list__main"
                onClick={() => {
                  setMergeTarget(null);
                  setOpenId(company.id);
                }}
              >
                <CompanyBadge name={company.name} logoUrl={company.logo_url} size={36} />
                <span className="min-w-0">
                  <strong>{company.name}</strong>
                  <small>
                    {plural(counts.departures, "départ")} · {plural(counts.vessels, "navire")} ·{" "}
                    {plural(counts.routes, "liaison")}
                  </small>
                </span>
                {!company.logo_url ? <span className="bw-admin-chip">Logo manquant</span> : null}
                {!counts.departures && !counts.vessels && !counts.routes ? (
                  <span className="bw-admin-chip">Inutilisée</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {openId ? (
        <CompanyEditor
          key={`${openId}:${mergeTarget ?? ""}`}
          company={open ?? null}
          companies={companies}
          initialMerge={mergeTarget}
          countsOf={countsOf}
          onClose={() => {
            setOpenId(null);
            setMergeTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CompanyEditor({
  company,
  companies,
  initialMerge,
  countsOf,
  onClose,
}: {
  company: Company | null;
  companies: Company[];
  initialMerge: string | null;
  countsOf: (id: string) => { departures: number; vessels: number; routes: number };
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(company?.name ?? "");
  const [logo, setLogo] = useState(company?.logo_url ?? "");
  const [site, setSite] = useState(company?.website_url ?? "");
  const [booking, setBooking] = useState(company?.booking_url ?? "");
  const [contact, setContact] = useState(company?.contact_url ?? "");
  const [claims, setClaims] = useState(company?.claims_url ?? "");
  const [phone, setPhone] = useState(company?.phone ?? "");
  const [email, setEmail] = useState(company?.contact_email ?? "");
  const [contactSource, setContactSource] = useState(company?.contact_source_url ?? "");
  const [contactVerified, setContactVerified] = useState(
    company?.contact_verified_at?.slice(0, 10) ?? "",
  );
  const [description, setDescription] = useState(company?.description ?? "");
  const [other, setOther] = useState<string>(initialMerge ?? "");
  // Sens de la fusion : par défaut, la fiche ouverte est gardée et l'autre disparaît.
  const [keepOpen, setKeepOpen] = useState(true);
  const refreshAll = () => void client.invalidateQueries();
  const save = useMutation({
    mutationFn: async () => {
      const values = {
        name: name.trim(),
        logo_url: logo.trim() || null,
        website_url: site.trim() || null,
        booking_url: booking.trim() || null,
        contact_url: contact.trim() || null,
        claims_url: claims.trim() || null,
        phone: phone.trim() || null,
        contact_email: email.trim() || null,
        contact_source_url: contactSource.trim() || null,
        contact_verified_at: contactVerified ? new Date(contactVerified).toISOString() : null,
        description: description.trim() || null,
      };
      if (!values.name) throw new Error("Indiquez le nom de la compagnie.");
      for (const url of [values.logo_url, values.website_url, values.booking_url, values.contact_url, values.claims_url, values.contact_source_url])
        if (url && !/^https:\/\//i.test(url)) throw new Error("Les adresses doivent commencer par https://");
      const { error } = company
        ? await supabase.from("companies").update(values).eq("id", company.id)
        : await supabase.from("companies").insert({
            ...values,
            slug: slugFrom(values.name, companies.map((item) => item.slug)),
            status: "active",
            is_demo: false,
          });
      if (error) throw new Error(failure(error));
    },
    onSuccess: () => {
      refreshAll();
      toast.success(company ? "Compagnie mise à jour." : "Compagnie ajoutée.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const usage = useQuery({
    queryKey: ["admin", "company-usage", company?.id],
    enabled: Boolean(company),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bw_admin_company_usage", { p_company: company!.id });
      if (error) throw new Error(failure(error));
      return (data ?? {}) as Record<string, number>;
    },
    retry: false,
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("bw_admin_delete_company", { p_company: company!.id });
      if (error) throw new Error(failure(error));
    },
    onSuccess: () => {
      refreshAll();
      toast.success("Compagnie supprimée.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const otherCompany = companies.find((item) => item.id === other);
  const keep = keepOpen ? company : otherCompany;
  const drop = keepOpen ? otherCompany : company;
  const merge = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("bw_admin_merge_companies", {
        p_keep: keep!.id,
        p_remove: drop!.id,
      });
      if (error) throw new Error(failure(error));
      return (data ?? {}) as Record<string, number>;
    },
    onSuccess: (moved) => {
      refreshAll();
      toast.success(
        `« ${drop!.name} » fusionnée dans « ${keep!.name} »${Object.keys(moved).length ? ` : ${describeUsage(moved)} rattaché(s)` : ""}.`,
      );
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const counts = company ? countsOf(company.id) : null;
  const unused = usage.data ? Object.keys(usage.data).length === 0 : false;
  return (
    <AdminDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={company ? company.name : "Nouvelle compagnie"}
      description={company ? "Informations publiques, utilisation, fusion et suppression." : "Elle sera proposée dans les programmes, les navires et les filtres du site."}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <CompanyBadge name={name || "?"} logoUrl={logo || null} size={56} />
          <div className="text-xs text-muted-foreground">
            {counts
              ? `${plural(counts.departures, "départ")} · ${plural(counts.vessels, "navire")} · ${plural(counts.routes, "liaison")}`
              : "Sans logo, une pastille avec les initiales s’affiche."}
          </div>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Nom
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Adresse du logo officiel
          <Input value={logo} placeholder="https://…" onChange={(e) => setLogo(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Site officiel
          <Input value={site} placeholder="https://…" onChange={(e) => setSite(e.target.value)} />
        </label>
        <fieldset className="grid gap-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Contacts affichés aux voyageurs</legend>
          <label className="grid gap-1 text-xs font-medium">
            Page de réservation
            <Input value={booking} placeholder="https://…" onChange={(e) => setBooking(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Page de contact
            <Input value={contact} placeholder="https://…" onChange={(e) => setContact(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Réclamations et droits des passagers
            <Input value={claims} placeholder="https://…" onChange={(e) => setClaims(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Téléphone
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            E-mail
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Où vérifier ces informations
            <Input value={contactSource} placeholder="https://…" onChange={(e) => setContactSource(e.target.value)} />
          </label>
          {contactSource.startsWith("https://") ? (
            <a
              href={contactSource}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-primary underline"
            >
              Ouvrir la page de vérification ↗
            </a>
          ) : null}
        </fieldset>
        <label className="grid gap-1.5 text-sm font-medium">
          Description
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        {company ? (
          <section className="grid gap-3 rounded-xl border border-border p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Combine className="size-4" aria-hidden /> Fusionner un doublon
            </h3>
            <p className="text-xs text-muted-foreground">
              Tous les départs, navires, calendriers, liaisons et Flash info de la compagnie supprimée
              passent sur celle qui est gardée. Les logo, site et description manquants sont repris.
            </p>
            <select
              value={other}
              onChange={(e) => setOther(e.target.value)}
              aria-label="Autre compagnie"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choisir l’autre compagnie…</option>
              {companies
                .filter((item) => item.id !== company.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            {keep && drop ? (
              <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                <p>
                  <strong>Garder :</strong> {keep.name}
                </p>
                <p>
                  <strong>Supprimer :</strong> {drop.name} (à rattacher :{" "}
                  {plural(countsOf(drop.id).departures, "départ")}, {plural(countsOf(drop.id).vessels, "navire")},{" "}
                  {plural(countsOf(drop.id).routes, "liaison")})
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setKeepOpen(!keepOpen)}>
                    <ArrowLeftRight className="size-4" aria-hidden /> Inverser
                  </Button>
                  <Button
                    size="sm"
                    disabled={merge.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Fusionner « ${drop.name} » dans « ${keep.name} » ?\n\n« ${drop.name} » sera supprimée et tout ce qui la concerne passera sur « ${keep.name} ». Cette opération ne peut pas être annulée.`,
                        )
                      )
                        merge.mutate();
                    }}
                  >
                    {merge.isPending ? "Fusion…" : "Fusionner"}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {company ? (
          <section className="grid gap-2 rounded-xl border border-border p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Trash2 className="size-4" aria-hidden /> Supprimer
            </h3>
            <p className="text-xs text-muted-foreground">
              {usage.isPending
                ? "Vérification de l’utilisation…"
                : usage.isError
                  ? (usage.error as Error).message
                  : unused
                    ? "Cette compagnie n’est utilisée nulle part : elle peut être supprimée."
                    : `Encore utilisée (${describeUsage(usage.data ?? {})}) : fusionnez-la avec la bonne compagnie.`}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start text-destructive"
              disabled={!unused || remove.isPending}
              onClick={() => {
                if (window.confirm(`Supprimer définitivement « ${company.name} » ?`)) remove.mutate();
              }}
            >
              Supprimer la compagnie
            </Button>
          </section>
        ) : null}
      </div>
    </AdminDrawer>
  );
}
