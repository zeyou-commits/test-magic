import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { CandidateDeparture } from "./match";
import type { TicketDraft, TicketLeg } from "./parse";

// Table, stockage et fonctions du script « billets », absents des types générés.
const db = typedSupabase as unknown as SupabaseClient;
const BUCKET = "bledway-billets";

/** Ce que le voyageur a confirmé (données personnelles : visibles de lui seul). */
export type TicketDetails = Omit<TicketDraft, "codes"> & {
  codes: string[];
  vesselName?: string | null;
};

export type TicketRow = {
  id: string;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  details: TicketDetails;
  company_id: string | null;
  outbound_departure_id: string | null;
  inbound_departure_id: string | null;
  last_travel_at: string | null;
  delete_after: string;
  created_at: string;
};

export const ticketsKey = ["my-tickets"] as const;

/** Mes billets ; null si le script n'est pas encore exécuté. */
export const myTicketsQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: [...ticketsKey, userId ?? "anonyme"],
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<TicketRow[] | null> => {
      const { data, error } = await db
        .from("bw_tickets")
        .select(
          "id,file_path,file_name,file_type,details,company_id,outbound_departure_id,inbound_departure_id,last_travel_at,delete_after,created_at",
        )
        .order("created_at", { ascending: false });
      if (error) return null;
      return data as TicketRow[];
    },
  });

const extension = (file: Blob, name?: string) => {
  if (file.type === "application/pdf") return "pdf";
  const fromName = name?.split(".").pop()?.toLowerCase();
  if (fromName && /^(jpe?g|png|webp|heic|heif)$/.test(fromName)) return fromName;
  return file.type.split("/")[1] ?? "jpg";
};

/** Le fichier original, gardé tel quel (QR code compris), dans l'espace privé du voyageur. */
export async function uploadTicketFile(userId: string, file: Blob, name?: string) {
  const path = `${userId}/${crypto.randomUUID()}.${extension(file, name)}`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error("Envoi du billet impossible. Vérifiez la connexion et réessayez.");
  return path;
}

export type SaveTicketInput = {
  id?: string | null;
  filePath: string | null;
  fileName: string | null;
  fileType: string | null;
  details: TicketDetails;
  companyId: string | null;
  outboundId: string | null;
  inboundId: string | null;
  /** Dernière date de voyage lue sur le billet (si aucune traversée BledWay n'est associée). */
  lastTravelAt: string | null;
  agency: string | null;
  insights: {
    departure_id: string;
    ticket_departure_at: string | null;
    ticket_vessel: string | null;
  }[];
};

export async function saveTicket(input: SaveTicketInput) {
  const { data, error } = await db.rpc("bw_ticket_save", {
    p_id: input.id ?? null,
    p_file_path: input.filePath,
    p_file_name: input.fileName,
    p_file_type: input.fileType,
    p_details: input.details,
    p_company: input.companyId,
    p_outbound: input.outboundId,
    p_inbound: input.inboundId,
    p_last_travel_at: input.lastTravelAt,
    p_agency: input.agency,
    p_insights: input.insights,
  });
  if (error)
    throw new Error(
      /Patientez|Connectez-vous|introuvable|invalide/.test(error.message)
        ? error.message
        : "Le billet n’a pas pu être enregistré. Réessayez.",
    );
  return data as string;
}

export async function deleteTicket(ticket: TicketRow) {
  const { error } = await db.from("bw_tickets").delete().eq("id", ticket.id);
  if (error) throw new Error("Suppression impossible. Réessayez.");
  if (ticket.file_path) await db.storage.from(BUCKET).remove([ticket.file_path]);
  await forgetLocal(ticket.id);
}

// --- Copie sur l'appareil : le billet reste consultable sans connexion -----------------------

const DB_NAME = "bledway-billets";
const STORE = "files";

function openLocal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function local<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  try {
    const base = await openLocal();
    return await new Promise<T | null>((resolve) => {
      const request = run(base.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Garde le billet sur cet appareil, avec sa date d'effacement. */
export const keepLocal = (id: string, file: Blob, deleteAfter: string) =>
  local("readwrite", (store) => store.put({ file, deleteAfter }, id));
export const forgetLocal = (id: string) => local("readwrite", (store) => store.delete(id));
const readLocal = (id: string) =>
  local<{ file: Blob; deleteAfter: string }>("readonly", (store) => store.get(id));

/** Les copies échues ou supprimées ailleurs sont effacées de l'appareil. */
export async function pruneLocal(keep: TicketRow[]) {
  try {
    const base = await openLocal();
    const keys = await new Promise<IDBValidKey[]>((resolve) => {
      const request = base.transaction(STORE, "readonly").objectStore(STORE).getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });
    const alive = new Set(
      keep.filter((t) => Date.parse(t.delete_after) > Date.now()).map((t) => t.id),
    );
    for (const key of keys) if (!alive.has(String(key))) await forgetLocal(String(key));
  } catch {
    /* stockage indisponible : rien à nettoyer */
  }
}

/** Le billet original : la copie de l'appareil d'abord, sinon l'espace privé (puis copie). */
export async function ticketFile(ticket: TicketRow): Promise<{ file: Blob; offline: boolean }> {
  const kept = await readLocal(ticket.id);
  if (kept && Date.parse(kept.deleteAfter) > Date.now()) return { file: kept.file, offline: true };
  if (!ticket.file_path)
    throw new Error("Ce billet a été saisi à la main : pas de document joint.");
  const { data, error } = await db.storage.from(BUCKET).download(ticket.file_path);
  if (error || !data) throw new Error("Billet indisponible sans connexion sur cet appareil.");
  await keepLocal(ticket.id, data, ticket.delete_after);
  return { file: data, offline: false };
}

// --- Traversées BledWay candidates -----------------------------------------------------------

/** Départs de la ligne du trajet, de la veille au surlendemain de la date du billet. */
export async function candidatesFor(
  leg: TicketLeg,
  routeIds: string[],
): Promise<CandidateDeparture[]> {
  if (!leg.date || !routeIds.length) return [];
  const day = Date.parse(`${leg.date}T12:00:00Z`);
  const { data } = await db
    .from("departures")
    .select("id,route_id,company_id,vessel_id,departure_at,status")
    .in("route_id", routeIds)
    .gte("departure_at", new Date(day - 1.5 * 86_400_000).toISOString())
    .lte("departure_at", new Date(day + 1.5 * 86_400_000).toISOString())
    .order("departure_at");
  return (data ?? []) as CandidateDeparture[];
}
