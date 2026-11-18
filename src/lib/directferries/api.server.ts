// Client Direct Ferries Connect, côté serveur uniquement : les clés restent dans les variables
// d'environnement (Vercel), jamais dans le navigateur.
//
//   DIRECTFERRIES_CLIENT_ID      identifiant OAuth fourni par Direct Ferries
//   DIRECTFERRIES_CLIENT_SECRET  secret associé
//   DIRECTFERRIES_ENV            « sandbox » (défaut) ou « production »
//   DIRECTFERRIES_PARTNER_CODE   code partenaire (facultatif selon le contrat)
//   DIRECTFERRIES_CURRENCY       devise des devis, « EUR » par défaut
//
// Sans identifiants, toutes les fonctions répondent « off » : le site garde ses estimations.
import type { AgeBand, CarModel, DfPort, DfRoute, RawAccommodation, RawQuote } from "./quote";

const HOSTS = {
  sandbox: {
    auth: "https://auth.sandbox.directferriesconnect.com",
    api: "https://sandbox-api.test.directferriesconnect.com",
  },
  production: {
    auth: "https://auth.directferriesconnect.com",
    api: "https://api.directferriesconnect.com",
  },
} as const;

export function dfConfig() {
  const clientId = process.env["DIRECTFERRIES_CLIENT_ID"];
  const clientSecret = process.env["DIRECTFERRIES_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  const env = process.env["DIRECTFERRIES_ENV"] === "production" ? "production" : "sandbox";
  return {
    clientId,
    clientSecret,
    env,
    hosts: HOSTS[env],
    partnerCode: process.env["DIRECTFERRIES_PARTNER_CODE"] || undefined,
    currency: (process.env["DIRECTFERRIES_CURRENCY"] || "EUR").toUpperCase(),
  } as const;
}
type Config = NonNullable<ReturnType<typeof dfConfig>>;

let token: { value: string; expiresAt: number } | null = null;
let pendingToken: Promise<string> | null = null;

async function accessToken(config: Config): Promise<string> {
  if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
  if (pendingToken) return pendingToken;
  pendingToken = (async () => {
    const response = await fetch(`${config.hosts.auth}/oauth2/token`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });
    if (!response.ok) throw new Error(`Direct Ferries : authentification refusée (${response.status})`);
    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error("Direct Ferries : jeton absent");
    token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return token.value;
  })().finally(() => {
    pendingToken = null;
  });
  return pendingToken;
}

async function call<T>(config: Config, path: string, init?: { method?: "GET" | "POST"; body?: unknown }) {
  const send = async () => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await accessToken(config)}`,
      accept: "application/json",
    };
    const request: RequestInit = {
      method: init?.method ?? "GET",
      signal: AbortSignal.timeout(init?.method === "POST" ? 20000 : 10000),
      headers,
    };
    if (init?.body) {
      headers["content-type"] = "application/json";
      request.body = JSON.stringify(init.body);
    }
    return fetch(`${config.hosts.api}/api/v1.0${path}`, request);
  };
  let response = await send();
  if (response.status === 401) {
    token = null; // jeton révoqué ou expiré plus tôt que prévu : un seul nouvel essai
    response = await send();
  }
  if (!response.ok) throw new Error(`Direct Ferries ${path} : ${response.status}`);
  const json = (await response.json()) as { data?: T; status?: string; message?: string };
  if (json.data == null) throw new Error(`Direct Ferries ${path} : ${json.message ?? "réponse vide"}`);
  return json.data;
}

// Petit cache mémoire par instance : les référentiels changent peu, les devis vivent 15 minutes.
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  if (cache.size > 800) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}
const DAY = 24 * 3600_000;

export async function dfPorts(config: Config): Promise<DfPort[]> {
  return cached("ports", DAY, async () => {
    const data = await call<{ ports?: Partial<DfPort>[] }>(config, "/ports?Culture=fr-FR");
    return (data.ports ?? [])
      .filter((port): port is Partial<DfPort> & { code: string } => Boolean(port.code))
      .map((port) => ({
        code: port.code,
        name: port.name ?? port.code,
        latitude: typeof port.latitude === "number" ? port.latitude : null,
        longitude: typeof port.longitude === "number" ? port.longitude : null,
      }));
  });
}

type RawRoute = {
  routeId?: number;
  name?: string;
  isVehicle?: boolean;
  isFootPassenger?: boolean;
  portTo?: { code?: string; name?: string };
  operatorDetails?: { id?: number; name?: string };
};

export async function dfRoutesFrom(config: Config, portCode: string): Promise<DfRoute[]> {
  return cached(`routes:${portCode}`, DAY, async () => {
    const data = await call<{ routes?: RawRoute[] }>(
      config,
      `/ports/${encodeURIComponent(portCode)}/routes`,
    );
    return (data.routes ?? [])
      .filter((route) => route.routeId && route.portTo?.code && route.operatorDetails?.id)
      .map((route) => ({
        routeId: route.routeId!,
        name: route.name ?? "",
        isVehicle: route.isVehicle !== false,
        isFootPassenger: route.isFootPassenger !== false,
        portTo: { code: route.portTo!.code!, name: route.portTo!.name ?? "" },
        operator: { id: route.operatorDetails!.id!, name: route.operatorDetails!.name ?? "" },
      }));
  });
}

export async function dfAgeBands(config: Config, operatorId: number, routeId: number) {
  return cached(`ages:${operatorId}:${routeId}`, DAY, async () => {
    try {
      const data = await call<{
        routePassengerInfo?: { passengerAgeRanges?: Partial<AgeBand>[] };
      }>(config, `/operators/${operatorId}/routes/${routeId}/passengerinfo`);
      const bands = (data.routePassengerInfo?.passengerAgeRanges ?? [])
        .filter((band) => band.label && typeof band.to === "number")
        .map((band) => ({ label: band.label!, from: band.from ?? 0, to: band.to! }));
      return bands.length ? bands : null;
    } catch {
      return null; // tranches par défaut
    }
  });
}

type RawVehicle = Partial<CarModel> & { dataVersion?: number | null };

/** Catalogue des voitures d'une marque (dernière version des données seulement). */
export async function dfVehiclesOfMake(config: Config, make: string): Promise<CarModel[]> {
  const key = make.trim().toLowerCase();
  return cached(`vehicles:${key}`, 7 * DAY, async () => {
    const params = new URLSearchParams({ makeStartsWith: make.trim(), latestVersionOnly: "true" });
    const data = await call<{ vehicles?: RawVehicle[] }>(config, `/Vehicles?${params}`);
    return (data.vehicles ?? [])
      .filter((vehicle) => vehicle.make && vehicle.model)
      .map((vehicle) => ({
        typeId: vehicle.typeId ?? null,
        makeModelId: vehicle.makeModelId ?? null,
        make: vehicle.make!,
        model: vehicle.model!,
        height: vehicle.height ?? null,
        length: vehicle.length ?? null,
      }));
  });
}

export async function dfQuotes(config: Config, body: unknown, cacheKey: string): Promise<RawQuote[]> {
  return cached(`quote:${cacheKey}`, 15 * 60_000, async () => {
    const data = await call<{ quotes?: RawQuote[] }>(config, "/Quotes/get-quotes-request", {
      method: "POST",
      body,
    });
    return data.quotes ?? [];
  });
}

/** Fauteuils et cabines d'un devis (le devis brut est renvoyé tel quel, comme l'exige l'API). */
export async function dfAccommodations(config: Config, quote: RawQuote): Promise<RawAccommodation[]> {
  return cached(`acc:${quote.quoteToken ?? JSON.stringify(quote).slice(0, 400)}`, 15 * 60_000, async () => {
    const data = await call<{ legs?: { accommodations?: RawAccommodation[] | null }[] }>(
      config,
      "/Quotes/get-accommodation-request",
      { method: "POST", body: { quote } },
    );
    return data.legs?.[0]?.accommodations ?? [];
  });
}
