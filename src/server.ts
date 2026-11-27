import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Pages publiques dont le HTML est le même pour tout le monde (aucune lecture de cookie ni d'en-tête
 * au rendu) et qui changent peu : le CDN de Vercel les garde 5 minutes, puis les sert pendant qu'il
 * les recalcule. Le navigateur, lui, revalide toujours (déploiements et appli installée).
 * Restent hors cache : la carte (/), les départs du jour (/horaires), les actualités et tout le privé.
 */
const CDN_CACHED = /^\/(lignes|ports|bateaux|compagnies|guide|covoiturage|simulateurs|barometre-prix|questions-frequentes|decouvrir|voyage-algerie|papiers-voyage-algerie|vehicules-moins-3-ans|importer-ma-voiture|methode-editoriale|a-propos|mentions-legales|confidentialite|charte|conditions-utilisation|routes-du-bled|mes-dinars)(\/[^/]+)?\/?$/;

function withCdnCache(request: Request, response: Response): Response {
  if (request.method !== "GET" || response.status !== 200) return response;
  const url = new URL(request.url);
  if (url.search || !CDN_CACHED.test(url.pathname)) return response;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  if (response.headers.has("set-cookie")) return response;
  const headers = new Headers(response.headers);
  headers.set("Vercel-CDN-Cache-Control", "max-age=300, stale-while-revalidate=86400");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withCdnCache(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
