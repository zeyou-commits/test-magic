import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import {
  adminPortsQuery,
  adminRoutesQuery,
  companiesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { dateKeyInZone, portTimeZone, wallTimeInZone } from "@/lib/ferry/time";
import { planningDeparturesQuery } from "@/lib/admin/planning";
import { runAutoAssign } from "@/lib/admin/autoAssign";
import { assignConfigQuery, assignDb, scheduleVesselsQuery } from "@/lib/admin/assignQueries";
import {
  aliasKey,
  matchName,
  SURE_SCORE,
  type MatchCandidate,
  type MatchKind,
  type MatchResult,
} from "@/lib/admin/importMatching";
import {
  diffImport,
  type ImportDiff,
  type ImportedDeparture,
  type PublishedDeparture,
} from "@/lib/admin/importDiff";
import {
  readRows,
  TEMPLATE_COLUMNS,
  toDeparture,
  type RawImportRow,
} from "@/lib/admin/seasonImport";

// Tables de l'import (script SQL « import_saison ») pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

type Batch = {
  id: string;
  file_name: string;
  company_id: string | null;
  counts: { added?: number; changed?: number; cancelled?: number };
  created_at: string;
  undone_at: string | null;
};

type Decision = { mode: "link" | "new" | "ignore" | null; targetId: string | null };
type NameItem = {
  kind: MatchKind;
  raw: string;
  count: number;
  match: MatchResult;
  decision: Decision;
};

type Step =
  | { name: "start" }
  | {
      name: "names";
      fileName: string;
      companyId: string | null;
      rows: RawImportRow[];
      items: NameItem[];
    }
  | {
      name: "diff";
      fileName: string;
      companyId: string | null;
      diff: ImportDiff;
      rejected: { line: number; reason: string }[];
      ignoredRows: number;
      scope: { companyIds: string[]; from: string; to: string };
      aliases: { kind: MatchKind; raw_key: string; target_id: string }[];
    }
  | {
      name: "done";
      batchId: string;
      counts: { added: number; changed: number; cancelled: number };
    };

const kindLabel: Record<MatchKind, string> = {
  port: "Port",
  company: "Compagnie",
  vessel: "Navire",
};
const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const dayLabel = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
const sqlMissing = (message: string) =>
  /function|does not exist|schema cache|relation/i.test(message);
const SQL_HINT =
  "Exécutez d'abord le script SQL « import_saison » (supabase/migrations/20261110130000_import_saison.sql) dans Supabase.";

/**
 * Import de saison en 4 étapes : choisir la compagnie (ou un fichier multi-compagnies),
 * vérifier les noms, voir les différences avec ce qui est publié, publier (annulable 30 jours).
 */
export function SeasonImport() {
  const queryClient = useQueryClient();
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: planning = [] } = useQuery(planningDeparturesQuery);
  const aliasesQuery = useQuery({
    queryKey: ["admin", "import-aliases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_import_aliases")
        .select("kind, raw_key, target_id");
      if (error) throw new Error(error.message);
      return (data ?? []) as { kind: MatchKind; raw_key: string; target_id: string }[];
    },
    retry: false,
  });
  const batchesQuery = useQuery({
    queryKey: ["admin", "import-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_import_batches")
        .select("id, file_name, company_id, counts, created_at, undone_at")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw new Error(error.message);
      return (data ?? []) as Batch[];
    },
    retry: false,
  });
  const [step, setStep] = useState<Step>({ name: "start" });
  const [remember, setRemember] = useState(true);
  const [missingMode, setMissingMode] = useState<"keep" | "cancel">("keep");
  const [busy, setBusy] = useState(false);

  const portById = (id: string) => ports.find((p) => p.id === id);
  const companyName = (id: string | null) =>
    companies.find((c) => c.id === id)?.name ?? "Plusieurs compagnies";
  const vesselName = (id: string | null) => vessels.find((v) => v.id === id)?.name ?? "—";
  const routeLabel = (id: string) => {
    const route = routes.find((r) => r.id === id);
    return route
      ? `${portById(route.departure_port_id)?.name ?? "?"} → ${portById(route.arrival_port_id)?.name ?? "?"}`
      : "?";
  };
  const localWhen = (d: { route_id: string; departure_at: string }) => {
    const route = routes.find((r) => r.id === d.route_id);
    const zone = portTimeZone(portById(route?.departure_port_id ?? ""));
    const day = new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: zone,
    }).format(new Date(d.departure_at));
    return `${day} ${wallTimeInZone(d.departure_at, zone).slice(0, 5)}`;
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["departures"] });
    void queryClient.invalidateQueries({ queryKey: ["routes"] });
    void queryClient.invalidateQueries({ queryKey: ["companies"] });
    void queryClient.invalidateQueries({ queryKey: ["vessels"] });
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };

  // ------------------------------------------------------------------ Modèles Excel
  const downloadTemplate = async (companyId: string | null) => {
    const XLSX = await import("xlsx");
    const columns = TEMPLATE_COLUMNS.map(([key]) => key).filter(
      (key) => !(companyId && key === "compagnie"),
    );
    const now = Date.now();
    const rows = planning
      .filter(
        (d) => (!companyId || d.company_id === companyId) && Date.parse(d.departure_at) >= now,
      )
      .map((d) => {
        const route = routes.find((r) => r.id === d.route_id);
        const from = portById(route?.departure_port_id ?? "");
        const to = portById(route?.arrival_port_id ?? "");
        const fromZone = portTimeZone(from);
        const toZone = portTimeZone(to);
        const values: Record<string, string | number> = {
          date: dateKeyInZone(d.departure_at, fromZone),
          heure: wallTimeInZone(d.departure_at, fromZone).slice(0, 5),
          heure_arrivee: d.arrival_at ? wallTimeInZone(d.arrival_at, toZone).slice(0, 5) : "",
          port_depart: from?.name ?? "",
          port_arrivee: to?.name ?? "",
          compagnie: companyName(d.company_id),
          navire: d.vessel_id ? vesselName(d.vessel_id) : "",
          duree_minutes: d.duration_minutes ?? "",
          statut:
            d.status === "cancelled" ? "annule" : d.status === "modified" ? "modifie" : "prevu",
        };
        return columns.map((key) => values[key] ?? "");
      });
    if (!rows.length) {
      rows.push(
        columns.map(
          (key) =>
            (
              ({
                date: "2027-02-05",
                heure: "18:30",
                heure_arrivee: "05:30",
                port_depart: "Alger",
                port_arrivee: "Marseille",
                compagnie: "Algérie Ferries",
                statut: "prevu",
              }) as Record<string, string>
            )[key] ?? "",
        ),
      );
    }
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([columns, ...rows]), "planning");
    const companyRoutes = routes.filter((r) =>
      companyId
        ? r.company_ids.includes(companyId) ||
          planning.some((d) => d.route_id === r.id && d.company_id === companyId)
        : true,
    );
    const fleet = vessels.filter(
      (v) => (!companyId || v.company_id === companyId) && v.status === "active",
    );
    const help: (string | number)[][] = [
      ["Colonne", "À saisir"],
      ...TEMPLATE_COLUMNS.filter(([key]) => columns.includes(key)).map(([key, text]) => [
        key,
        text,
      ]),
      [],
      ["Liaisons connues (port_depart → port_arrivee)"],
      ...companyRoutes.map((r) => [
        portById(r.departure_port_id)?.name ?? "",
        portById(r.arrival_port_id)?.name ?? "",
      ]),
      [],
      ["Navires connus"],
      ...fleet.map((v) => [v.name]),
    ];
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(help), "aide");
    XLSX.writeFile(
      book,
      `planning-${companyId ? slug(companyName(companyId)) : "multi-compagnies"}.xlsx`,
    );
  };

  // ------------------------------------------------------------------ Étape 1 → 2
  const readFile = async (file: File, companyId: string | null) => {
    try {
      const XLSX = await import("xlsx");
      // Un CSV est lu en UTF-8 (sinon « Sète » devient « SÃ¨te ») ; Excel garde sa lecture binaire.
      const book = /\.csv$/i.test(file.name)
        ? XLSX.read((await file.text()).replace(/^﻿/, ""), { type: "string" })
        : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const sheet = book.Sheets[book.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("Le fichier ne contient aucune feuille.");
      const rows = readRows(
        XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          raw: false,
          dateNF: "yyyy-mm-dd",
          defval: "",
        }),
      ).filter((row) => row.date || row.from || row.to);
      if (!rows.length) throw new Error("Aucune ligne trouvée dans le fichier.");
      const aliases = new Map<string, string>();
      for (const alias of aliasesQuery.data ?? [])
        aliases.set(`${alias.kind}|${alias.raw_key}`, alias.target_id);
      const scoped = (kind: MatchKind) =>
        new Map(
          [...aliases]
            .filter(([key]) => key.startsWith(`${kind}|`))
            .map(([key, id]) => [key.slice(kind.length + 1), id]),
        );

      const portCandidates: MatchCandidate[] = ports.map((p) => ({
        id: p.id,
        name: p.name,
        altNames: [p.slug, p.city],
      }));
      const companyCandidates: MatchCandidate[] = companies.map((c) => ({
        id: c.id,
        name: c.name,
        altNames: [c.slug],
      }));
      const vesselCandidates = (rowCompany: string | null): MatchCandidate[] => {
        const own = vessels.filter((v) => !rowCompany || v.company_id === rowCompany);
        return (own.length ? own : vessels).map((v) => ({
          id: v.id,
          name: v.name,
          altNames: [v.slug],
          noise: [companyName(v.company_id)],
        }));
      };

      const counts = new Map<string, NameItem>();
      const add = (kind: MatchKind, raw: string, candidates: MatchCandidate[]) => {
        if (!raw) return;
        const key = `${kind}|${aliasKey(raw)}`;
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
          return;
        }
        const match = matchName(raw, candidates, scoped(kind));
        const sure = match.id && (match.score >= SURE_SCORE || match.reason === "alias");
        counts.set(key, {
          kind,
          raw,
          count: 1,
          match,
          decision: sure
            ? { mode: "link", targetId: match.id }
            : match.id
              ? { mode: null, targetId: match.id }
              : { mode: kind === "port" ? null : "new", targetId: null },
        });
      };
      for (const row of rows) {
        add("port", row.from, portCandidates);
        add("port", row.to, portCandidates);
        if (!companyId) add("company", row.company, companyCandidates);
        const rowCompany =
          companyId ?? matchName(row.company, companyCandidates, scoped("company")).id;
        add("vessel", row.vessel, vesselCandidates(rowCompany));
      }
      setStep({ name: "names", fileName: file.name, companyId, rows, items: [...counts.values()] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fichier illisible.");
    }
  };

  // ------------------------------------------------------------------ Étape 2 → 3
  const buildDiff = async (current: Extract<Step, { name: "names" }>) => {
    setBusy(true);
    try {
      const resolved = new Map<string, string | null>(); // clé → id (null = ignoré)
      const keyOf = (kind: MatchKind, raw: string) => `${kind}|${aliasKey(raw)}`;
      const takenCompanySlugs = companies.map((c) => c.slug);
      const takenVesselSlugs = vessels.map((v) => v.slug);
      const unique = (base: string, taken: string[]) => {
        let candidate = slug(base) || "element";
        for (let i = 2; taken.includes(candidate); i += 1) candidate = `${slug(base)}-${i}`;
        taken.push(candidate);
        return candidate;
      };
      // Compagnies nouvelles d'abord : les navires nouveaux y seront rattachés.
      for (const item of current.items.filter((i) => i.kind === "company")) {
        if (item.decision.mode === "ignore") resolved.set(keyOf("company", item.raw), null);
        else if (item.decision.mode === "link")
          resolved.set(keyOf("company", item.raw), item.decision.targetId);
        else {
          const { data, error } = await supabase
            .from("companies")
            .insert({ name: item.raw, slug: unique(item.raw, takenCompanySlugs), status: "active" })
            .select("id")
            .single();
          if (error) throw new Error(`Compagnie « ${item.raw} » : ${error.message}`);
          resolved.set(keyOf("company", item.raw), (data as { id: string }).id);
        }
      }
      for (const item of current.items.filter((i) => i.kind === "port")) {
        resolved.set(
          keyOf("port", item.raw),
          item.decision.mode === "link" ? item.decision.targetId : null,
        );
      }
      const companyOf = (row: RawImportRow) =>
        current.companyId ?? resolved.get(keyOf("company", row.company)) ?? undefined;
      for (const item of current.items.filter((i) => i.kind === "vessel")) {
        if (item.decision.mode === "ignore") resolved.set(keyOf("vessel", item.raw), null);
        else if (item.decision.mode === "link")
          resolved.set(keyOf("vessel", item.raw), item.decision.targetId);
        else {
          const owner = current.rows.find((row) => row.vessel === item.raw);
          const { data, error } = await supabase
            .from("vessels")
            .insert({
              name: item.raw,
              slug: unique(item.raw, takenVesselSlugs),
              company_id: owner ? (companyOf(owner) ?? null) : null,
              status: "active",
            })
            .select("id")
            .single();
          if (error) throw new Error(`Navire « ${item.raw} » : ${error.message}`);
          resolved.set(keyOf("vessel", item.raw), (data as { id: string }).id);
        }
      }

      // Lignes manquantes entre deux ports connus : créées avec la compagnie comme opérateur.
      const routeList = [...routes];
      const rejected: { line: number; reason: string }[] = [];
      const departures: ImportedDeparture[] = [];
      let ignoredRows = 0;
      for (const row of current.rows) {
        const fromId = resolved.get(keyOf("port", row.from));
        const toId = resolved.get(keyOf("port", row.to));
        const companyId = companyOf(row);
        // Un navire ignoré n'écarte pas la ligne : la traversée est importée sans bateau.
        const vesselKey = keyOf("vessel", row.vessel);
        if (fromId === null || toId === null || companyId === null) {
          ignoredRows += 1;
          continue;
        }
        let route = routeList.find(
          (r) => r.departure_port_id === fromId && r.arrival_port_id === toId,
        );
        if (!route && fromId && toId && fromId !== toId && companyId) {
          const from = portById(fromId);
          const to = portById(toId);
          const { data, error } = await supabase
            .from("routes")
            .insert({
              slug: unique(
                `${from?.name ?? "port"}-${to?.name ?? "port"}`,
                routeList.map((r) => r.slug),
              ),
              departure_port_id: fromId,
              arrival_port_id: toId,
              status: "active",
            })
            .select("*")
            .single();
          if (error) throw new Error(`Liaison ${from?.name} → ${to?.name} : ${error.message}`);
          await supabase
            .from("route_operators")
            .insert({ route_id: (data as { id: string }).id, company_id: companyId });
          route = { ...(data as (typeof routeList)[number]), company_ids: [companyId] };
          routeList.push(route);
        }
        const result = toDeparture(
          row,
          {
            fromPort: fromId ? portById(fromId) : undefined,
            toPort: toId ? portById(toId) : undefined,
            routeId: route?.id,
            companyId: companyId ?? undefined,
            vesselId: row.vessel ? (resolved.get(vesselKey) ?? null) : null,
          },
          route?.typical_duration_minutes ?? null,
        );
        if ("error" in result) rejected.push({ line: row.line, reason: result.error });
        else departures.push(result.departure);
      }
      if (!departures.length)
        throw new Error("Aucune ligne exploitable : vérifiez les dates, heures et ports.");

      const companyIds = current.companyId
        ? [current.companyId]
        : [...new Set(departures.map((d) => d.company_id))];
      const times = departures.map((d) => Date.parse(d.departure_at));
      const scope = {
        companyIds,
        from: new Date(Math.min(...times) - 12 * 3_600_000).toISOString(),
        to: new Date(Math.max(...times) + 12 * 3_600_000).toISOString(),
      };
      const published: PublishedDeparture[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("departures")
          .select(
            "id, route_id, company_id, vessel_id, departure_at, arrival_at, duration_minutes, status, source_name",
          )
          .in("company_id", companyIds)
          .gte("departure_at", scope.from)
          .lte("departure_at", scope.to)
          .order("departure_at")
          .range(offset, offset + 999);
        if (error) throw new Error(error.message);
        published.push(...((data ?? []) as PublishedDeparture[]));
        if (!data || data.length < 1000) break;
      }
      const aliases = remember
        ? current.items
            .filter(
              (i) =>
                i.decision.mode === "link" &&
                i.decision.targetId &&
                i.match.reason !== "exact" &&
                i.match.reason !== "alias",
            )
            .map((i) => ({
              kind: i.kind,
              raw_key: aliasKey(i.raw),
              target_id: i.decision.targetId!,
            }))
        : [];
      refresh();
      setMissingMode("keep");
      setStep({
        name: "diff",
        fileName: current.fileName,
        companyId: current.companyId,
        diff: diffImport(departures, published, scope),
        rejected,
        ignoredRows,
        scope,
        aliases,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Préparation impossible.");
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------ Étape 3 → 4
  const publish = useMutation({
    mutationFn: async (current: Extract<Step, { name: "diff" }>) => {
      const strip = ({ line: _line, ...rest }: ImportedDeparture) => rest;
      const { data, error } = await supabase.rpc("bw_admin_publish_import", {
        p_file_name: current.fileName,
        p_company: current.companyId,
        p_from: current.scope.from,
        p_to: current.scope.to,
        p_inserts: current.diff.added.map(strip),
        p_updates: current.diff.changed.map((c) => ({ id: c.before.id, ...strip(c.after) })),
        p_cancels: missingMode === "cancel" ? current.diff.missing.map((d) => d.id) : [],
        p_aliases: current.aliases,
      });
      if (error) throw new Error(sqlMissing(error.message) ? SQL_HINT : error.message);
      return {
        batchId: data as string,
        counts: {
          added: current.diff.added.length,
          changed: current.diff.changed.length,
          cancelled: missingMode === "cancel" ? current.diff.missing.length : 0,
        },
      };
    },
    onSuccess: (result) => {
      refresh();
      setStep({ name: "done", ...result });
      // Les nouvelles traversées des compagnies en « Automatique » reçoivent leur navire tout de suite.
      void (async () => {
        const [departures, config, scheduleVessel] = await Promise.all([
          queryClient.fetchQuery({ ...planningDeparturesQuery, staleTime: 0 }),
          queryClient.fetchQuery({ ...assignConfigQuery, staleTime: 0 }),
          queryClient.fetchQuery(scheduleVesselsQuery),
        ]);
        const { count } = await runAutoAssign(assignDb, {
          departures,
          vessels,
          config,
          scheduleVessel,
          source: "import",
        });
        if (count) {
          toast.success(`${count} traversée(s) importée(s) ont reçu leur navire automatiquement.`);
          refresh();
        }
      })().catch((error: Error) => toast.error(`Affectation automatique : ${error.message}`));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const undo = useMutation({
    mutationFn: async (batchId: string) => {
      const { data, error } = await supabase.rpc("bw_admin_undo_import", { p_batch: batchId });
      if (error) throw new Error(sqlMissing(error.message) ? SQL_HINT : error.message);
      return data as { deleted: number; restored: number };
    },
    onSuccess: (result) => {
      toast.success(
        `Import annulé : ${result.deleted} départ(s) retiré(s), ${result.restored} remis comme avant.`,
      );
      refresh();
      setStep({ name: "start" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const steps = ["Fichier", "Noms à vérifier", "Différences", "Publication"];
  const stepIndex = { start: 0, names: 1, diff: 2, done: 3 }[step.name];

  return (
    <div className="grid gap-5">
      <ol className="grid gap-2 sm:grid-cols-4" aria-label="Étapes de l'import">
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === stepIndex ? "step" : undefined}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
              index === stepIndex
                ? "border-foreground bg-foreground text-background"
                : index < stepIndex
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-border bg-white text-muted-foreground"
            }`}
          >
            <span className="grid size-6 place-items-center rounded-full border border-current text-xs">
              {index < stepIndex ? <Check className="size-3.5" /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {(aliasesQuery.error || batchesQuery.error) && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {SQL_HINT} En attendant, l'import fonctionne pour vérifier un fichier, mais ni la mémoire
          des noms ni la publication.
        </p>
      )}

      {step.name === "start" && (
        <>
          <section className="grid gap-3">
            <h2 className="text-base font-semibold">Mettre à jour le planning d'une compagnie</h2>
            <p className="text-sm text-muted-foreground">
              Téléchargez le modèle de la compagnie : il contient déjà son planning publié et la
              liste de ses lignes et navires. Modifiez-le, puis importez-le : seules les
              traversées de cette compagnie sont comparées et mises à jour.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {companies
                .filter((c) => c.status === "active")
                .map((company) => {
                  const upcoming = planning.filter(
                    (d) =>
                      d.company_id === company.id &&
                      Date.parse(d.departure_at) >= Date.now() &&
                      d.status !== "cancelled",
                  );
                  const last = upcoming.at(-1);
                  const lastImport = batchesQuery.data?.find(
                    (b) => b.company_id === company.id && !b.undone_at,
                  );
                  return (
                    <article
                      key={company.id}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4"
                    >
                      <div>
                        <h3 className="text-sm font-semibold">{company.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {upcoming.length
                            ? `${upcoming.length} traversée(s) à venir, jusqu'au ${dayLabel(last!.departure_at)}`
                            : "Aucune traversée à venir publiée"}
                          {lastImport
                            ? ` · dernier import le ${dayLabel(lastImport.created_at)}`
                            : ""}
                        </p>
                      </div>
                      <div className="mt-auto flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void downloadTemplate(company.id)}
                        >
                          <Download className="size-4" /> Modèle {company.name}
                        </Button>
                        <FilePick
                          label={`Importer le planning ${company.name}`}
                          onFile={(f) => void readFile(f, company.id)}
                        />
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
          <section className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-white p-4">
            <FileSpreadsheet className="size-5 text-muted-foreground" aria-hidden />
            <div className="min-w-60 flex-1">
              <h2 className="text-sm font-semibold">Fichier avec plusieurs compagnies</h2>
              <p className="text-xs text-muted-foreground">
                Même modèle, avec une colonne « compagnie ».
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void downloadTemplate(null)}>
              <Download className="size-4" /> Modèle multi-compagnies
            </Button>
            <FilePick
              label="Importer un fichier multi-compagnies"
              onFile={(f) => void readFile(f, null)}
            />
          </section>
          {(batchesQuery.data?.length ?? 0) > 0 && (
            <section className="rounded-xl border border-border bg-white p-4">
              <h2 className="text-sm font-semibold">Imports récents</h2>
              <ul className="mt-2 divide-y divide-border">
                {batchesQuery.data!.map((batch) => {
                  const canUndo =
                    !batch.undone_at && Date.parse(batch.created_at) > Date.now() - 30 * 86_400_000;
                  return (
                    <li key={batch.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <span className="min-w-60 flex-1">
                        <strong>{companyName(batch.company_id)}</strong> ·{" "}
                        {batch.file_name || "fichier"}
                        <span className="block text-xs text-muted-foreground">
                          {new Date(batch.created_at).toLocaleString("fr-FR")} ·{" "}
                          {batch.counts.added ?? 0} ajoutée(s), {batch.counts.changed ?? 0}{" "}
                          modifiée(s), {batch.counts.cancelled ?? 0} annulée(s)
                          {batch.undone_at ? " · annulé" : ""}
                        </span>
                      </span>
                      {canUndo && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={undo.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Annuler cet import ? Les traversées créées sont retirées, les autres reviennent comme avant.",
                              )
                            )
                              undo.mutate(batch.id);
                          }}
                        >
                          <RotateCcw className="size-4" /> Annuler cet import
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {step.name === "names" && (
        <NamesStep
          step={step}
          remember={remember}
          busy={busy}
          onRemember={setRemember}
          candidates={{
            port: ports.map((p) => ({ id: p.id, label: p.name })),
            company: companies.map((c) => ({ id: c.id, label: c.name })),
            vessel: vessels
              .filter((v) => !step.companyId || v.company_id === step.companyId)
              .map((v) => ({ id: v.id, label: v.name })),
          }}
          onChange={(items) => setStep({ ...step, items })}
          onBack={() => setStep({ name: "start" })}
          onNext={() => void buildDiff(step)}
        />
      )}

      {step.name === "diff" && (
        <section className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Tile label="Nouvelles" value={step.diff.added.length} tone="text-emerald-700" />
            <Tile label="Modifiées" value={step.diff.changed.length} tone="text-blue-700" />
            <Tile label="Inchangées" value={step.diff.unchanged.length} />
            <Tile
              label="Absentes du fichier"
              value={step.diff.missing.length}
              tone="text-amber-700"
            />
            <Tile
              label="Lignes écartées"
              value={step.rejected.length + step.ignoredRows + step.diff.repeated.length}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Comparaison avec ce qui est publié pour{" "}
            {step.companyId ? companyName(step.companyId) : "les compagnies du fichier"}, du{" "}
            {dayLabel(step.scope.from)} au {dayLabel(step.scope.to)}.
          </p>
          <DiffList
            title="Nouvelles traversées"
            items={step.diff.added.map(
              (d) => `${routeLabel(d.route_id)} · ${localWhen(d)} · ${vesselName(d.vessel_id)}`,
            )}
          />
          <DiffList
            title="Traversées modifiées"
            items={step.diff.changed.map(
              (c) =>
                `${routeLabel(c.after.route_id)} · ${localWhen(c.before)}${
                  c.fields.includes("time") ? ` → ${localWhen(c.after)}` : ""
                }${c.fields.includes("vessel") ? ` · navire : ${vesselName(c.before.vessel_id)} → ${vesselName(c.after.vessel_id)}` : ""}${
                  c.fields.includes("duration")
                    ? ` · durée ${c.before.duration_minutes} → ${c.after.duration_minutes} min`
                    : ""
                }${c.fields.includes("status") ? ` · statut ${c.before.status} → ${c.after.status}` : ""}`,
            )}
          />
          {step.diff.missing.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <DiffList
                title="Publiées mais absentes du fichier"
                items={step.diff.missing.map(
                  (d) =>
                    `${routeLabel(d.route_id)} · ${localWhen(d)} · ${d.source_name ?? "source inconnue"}`,
                )}
                bare
              />
              <fieldset className="mt-3 grid gap-2 text-sm">
                <legend className="font-semibold">Que faire de ces traversées ?</legend>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={missingMode === "keep"}
                    onChange={() => setMissingMode("keep")}
                  />
                  Les garder telles quelles (recommandé si le fichier ne couvre pas tout)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={missingMode === "cancel"}
                    onChange={() => setMissingMode("cancel")}
                  />
                  Les marquer annulées (les voyageurs qui les suivent le verront)
                </label>
              </fieldset>
            </div>
          )}
          {step.rejected.length + step.diff.repeated.length > 0 && (
            <DiffList
              title="Lignes écartées"
              items={[
                ...step.rejected.map((r) => `Ligne ${r.line} : ${r.reason}`),
                ...step.diff.repeated.map((r) => `Ligne ${r.line} : en double dans le fichier`),
              ]}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setStep({ name: "start" })}>
              Abandonner
            </Button>
            <Button
              disabled={
                publish.isPending ||
                step.diff.added.length +
                  step.diff.changed.length +
                  (missingMode === "cancel" ? step.diff.missing.length : 0) ===
                  0
              }
              onClick={() => publish.mutate(step)}
            >
              {publish.isPending
                ? "Publication…"
                : `Publier : ${step.diff.added.length} nouvelle(s), ${step.diff.changed.length} modification(s)${
                    missingMode === "cancel" && step.diff.missing.length
                      ? `, ${step.diff.missing.length} annulation(s)`
                      : ""
                  }`}
            </Button>
          </div>
        </section>
      )}

      {step.name === "done" && (
        <section className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-base font-semibold text-emerald-900">Import publié</h2>
          <p className="text-sm text-emerald-900">
            {step.counts.added} traversée(s) ajoutée(s), {step.counts.changed} modifiée(s),{" "}
            {step.counts.cancelled} annulée(s). Vous pouvez annuler cet import pendant 30 jours.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep({ name: "start" })}>
              Importer un autre fichier
            </Button>
            <Button
              variant="ghost"
              disabled={undo.isPending}
              onClick={() => undo.mutate(step.batchId)}
            >
              <RotateCcw className="size-4" /> Annuler cet import
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function FilePick({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring">
      <Upload className="size-4" aria-hidden />
      Importer
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        aria-label={label}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

function Tile({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function DiffList({
  title,
  items,
  bare = false,
}: {
  title: string;
  items: string[];
  bare?: boolean;
}) {
  if (!items.length) return null;
  return (
    <details className={bare ? "" : "rounded-xl border border-border bg-white p-4"}>
      <summary className="cursor-pointer text-sm font-semibold">
        {title} ({items.length})
      </summary>
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-xs">
        {items.slice(0, 500).map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

function NamesStep({
  step,
  remember,
  busy,
  candidates,
  onRemember,
  onChange,
  onBack,
  onNext,
}: {
  step: Extract<Step, { name: "names" }>;
  remember: boolean;
  busy: boolean;
  candidates: Record<MatchKind, { id: string; label: string }[]>;
  onRemember: (value: boolean) => void;
  onChange: (items: NameItem[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const exact = step.items.filter((i) => i.match.reason === "exact" && i.decision.mode === "link");
  const toReview = step.items.filter((i) => !exact.includes(i));
  const undecided = step.items.filter(
    (i) => !i.decision.mode || (i.decision.mode === "link" && !i.decision.targetId),
  );
  const set = (item: NameItem, decision: Decision) =>
    onChange(step.items.map((i) => (i === item ? { ...i, decision } : i)));
  const tone = (item: NameItem) =>
    item.match.reason === "alias"
      ? "text-blue-700"
      : item.match.score >= SURE_SCORE
        ? "text-emerald-700"
        : item.match.id
          ? "text-amber-700"
          : "text-red-700";

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-base font-semibold">
          Ces noms du fichier ressemblent à des fiches existantes
        </h2>
        <p className="text-sm text-muted-foreground">
          {step.fileName} · {step.rows.length} ligne(s)
          {step.companyId ? "" : " · plusieurs compagnies"}. Accents, majuscules, chiffres romains
          et préfixes de compagnie sont ignorés. {exact.length} nom(s) reconnus à l'identique ne
          sont pas affichés.
        </p>
      </div>
      {toReview.length ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Dans le fichier</th>
                <th className="px-3 py-2 font-semibold">Fiche BledWay</th>
                <th className="px-3 py-2 font-semibold">Décision</th>
              </tr>
            </thead>
            <tbody>
              {toReview.map((item) => (
                <tr
                  key={`${item.kind}|${item.raw}`}
                  className={`border-t border-border ${item.decision.mode ? "" : "bg-amber-50/60"}`}
                >
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {kindLabel[item.kind]}
                  </td>
                  <td className="px-3 py-2">
                    <strong className="font-mono text-[13px]">{item.raw}</strong>
                    <span className="block text-xs text-muted-foreground">
                      {item.count} ligne(s)
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Fiche pour ${item.raw}`}
                      value={item.decision.targetId ?? ""}
                      onChange={(event) =>
                        set(item, {
                          mode: event.target.value ? "link" : item.decision.mode,
                          targetId: event.target.value || null,
                        })
                      }
                      className="h-9 w-full max-w-64 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">— choisir —</option>
                      {candidates[item.kind].map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span className={`mt-1 block text-xs font-semibold ${tone(item)}`}>
                      {item.match.why}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="inline-flex overflow-hidden rounded-md border border-border">
                      {(
                        [
                          ["link", "Associer"],
                          ...(item.kind === "port" ? [] : [["new", "Nouveau"] as const]),
                          ["ignore", "Ignorer"],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={item.decision.mode === mode}
                          disabled={mode === "link" && !item.decision.targetId}
                          onClick={() => set(item, { ...item.decision, mode })}
                          className={`min-h-9 border-l border-border px-3 text-xs font-semibold first:border-l-0 disabled:opacity-40 ${
                            item.decision.mode === mode
                              ? "bg-foreground text-background"
                              : "bg-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {item.kind === "port" && item.decision.mode === "ignore" && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Les lignes de ce port seront écartées.
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-white p-4 text-sm">
          Tous les noms sont reconnus à l'identique.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => onRemember(event.target.checked)}
        />
        Retenir ces correspondances pour les prochains imports
      </label>
      <p className="text-xs text-muted-foreground">
        « Nouveau » crée la compagnie ou le navire avec ce nom. Un port inconnu ne peut pas être
        créé ici (il faut ses coordonnées) : ajoutez-le dans « Ports » ou ignorez ses lignes. Les
        lignes manquantes entre deux ports connus sont créées automatiquement.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onBack}>
          Retour
        </Button>
        <Button disabled={busy || undecided.length > 0} onClick={onNext}>
          {busy
            ? "Préparation…"
            : undecided.length
              ? `Encore ${undecided.length} nom(s) à décider`
              : "Voir les différences →"}
        </Button>
      </div>
    </section>
  );
}
