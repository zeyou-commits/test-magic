/* eslint-disable @typescript-eslint/no-explicit-any -- table absente des types générés */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { holidayCalendars, VACANCES_CHECKED } from "@/content/vacancesScolaires.data";
import { CONSULATS_EUROPE_CHECKED, europePosts } from "@/content/consulatsEurope.data";
import type { HolidayCalendar } from "@/content/vacancesScolaires";
import type { EuropeCountryPosts } from "@/content/consulatsEurope";
import {
  compareConsulates,
  compareHolidays,
  fetchEuropePosts,
  fetchHolidayCalendars,
  referenceDue,
  type ReferenceKey,
  type ReferenceSummary,
} from "./sources";

/** Le relevé (vacances, consulats) : relancé par l'admin, comparé, puis approuvé. */

const keySchema = z.object({ key: z.enum(["vacances", "consulats"]) });

export interface ReferenceStatus {
  key: ReferenceKey;
  label: string;
  /** La date du relevé en service (approuvé, sinon celui du dépôt). */
  checked: string;
  fromRepository: boolean;
  approvedAt: string | null;
  due: string | null;
  pending: { checked: string; at: string; summary: ReferenceSummary } | null;
}

const LABELS: Record<ReferenceKey, string> = {
  vacances: "Vacances scolaires (France et Europe)",
  consulats: "Consulats d'Algérie en Europe",
};

async function admin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Accès réservé aux administrateurs.");
  return supabaseAdmin as any;
}

const today = () => new Date().toISOString().slice(0, 10);

type Row = {
  key: ReferenceKey;
  active: unknown;
  active_checked: string | null;
  pending: unknown;
  pending_checked: string | null;
  pending_summary: ReferenceSummary | null;
  pending_at: string | null;
  approved_at: string | null;
};

const current = (key: ReferenceKey, row?: Row) => {
  if (row?.active && row.active_checked)
    return { data: row.active, checked: row.active_checked, fromRepository: false };
  return key === "vacances"
    ? { data: holidayCalendars, checked: VACANCES_CHECKED, fromRepository: true }
    : { data: europePosts, checked: CONSULATS_EUROPE_CHECKED, fromRepository: true };
};

function status(key: ReferenceKey, row?: Row): ReferenceStatus {
  const live = current(key, row);
  return {
    key,
    label: LABELS[key],
    checked: live.checked,
    fromRepository: live.fromRepository,
    approvedAt: row?.approved_at ?? null,
    due: referenceDue(
      key,
      live.checked,
      today(),
      key === "vacances" ? (live.data as HolidayCalendar[]) : [],
    ),
    pending:
      row?.pending && row.pending_checked && row.pending_summary
        ? { checked: row.pending_checked, at: row.pending_at ?? "", summary: row.pending_summary }
        : null,
  };
}

async function rows(db: any): Promise<Row[]> {
  const { data, error } = await db.from("bw_reference_data").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const referenceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context.userId);
    const list = await rows(db);
    return (["vacances", "consulats"] as const).map((key) =>
      status(
        key,
        list.find((r) => r.key === key),
      ),
    );
  });

/** Relève la source maintenant et garde le résultat en attente d'approbation. */
export const checkReferenceUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => keySchema.parse(input))
  .handler(async ({ context, data: { key } }) => {
    const db = await admin(context.userId);
    const row = (await rows(db)).find((r) => r.key === key);
    const live = current(key, row);
    const notes: string[] = [];
    const log = (m: string) => notes.push(m);
    let fresh: HolidayCalendar[] | EuropeCountryPosts[];
    let summary: ReferenceSummary;
    if (key === "vacances") {
      const calendars = await fetchHolidayCalendars(log);
      summary = compareHolidays(live.data as HolidayCalendar[], calendars, today());
      fresh = calendars;
    } else {
      const before = live.data as EuropeCountryPosts[];
      const known = new Map<string, [number, number]>();
      for (const c of before) for (const p of c.posts) if (p.point) known.set(p.name, p.point);
      const posts = await fetchEuropePosts(known, log);
      summary = compareConsulates(before, posts);
      fresh = posts;
    }
    if (!fresh.length)
      throw new Error("Aucune source n'a répondu : rien à approuver, réessayez plus tard.");
    summary = { ...summary, warnings: [...summary.warnings, ...notes] };
    const { error } = await db.from("bw_reference_data").upsert({
      key,
      pending: fresh,
      pending_checked: today(),
      pending_summary: summary,
      pending_by: context.userId,
      pending_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return summary;
  });

/** Met en service le relevé en attente : le site le lit dès le prochain chargement. */
export const approveReferenceUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => keySchema.parse(input))
  .handler(async ({ context, data: { key } }) => {
    const db = await admin(context.userId);
    const row = (await rows(db)).find((r) => r.key === key);
    if (!row?.pending || !row.pending_checked) throw new Error("Aucun relevé en attente.");
    const { error } = await db
      .from("bw_reference_data")
      .update({
        active: row.pending,
        active_checked: row.pending_checked,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        pending: null,
        pending_checked: null,
        pending_summary: null,
        pending_by: null,
        pending_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Écarte le relevé en attente : le site garde la version en service. */
export const rejectReferenceUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => keySchema.parse(input))
  .handler(async ({ context, data: { key } }) => {
    const db = await admin(context.userId);
    const { error } = await db
      .from("bw_reference_data")
      .update({
        pending: null,
        pending_checked: null,
        pending_summary: null,
        pending_by: null,
        pending_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
