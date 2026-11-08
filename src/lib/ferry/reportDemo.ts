// Signalements d'exemple pour le lancement (08/11/2026) : la carte montre à quoi ressemble un
// signalement de voyageurs tant qu'il n'y en a pas de vrai. Toujours marqués « Exemple ».
// Uniquement des situations sans conséquence (file, guichets, contrôles) : jamais d'annulation,
// de retard ni d'accès fermé, pour ne tromper personne. Même réglage que les exemples des salons.
import type { DemoSetting } from "./chatDemo";
import type { TravelAlert } from "./community";
import type { Port } from "./types";

const DEMO_PREFIX = "demo-report-";

/** Port (début du nom), situation et précision du catalogue, ancienneté et confirmations. */
const BUILT_IN: { port: string; category: string; detail: string; minutes: number; confirmations: number }[] = [
  { port: "Marseille", category: "queue", detail: "queue_moving", minutes: 12, confirmations: 3 },
  { port: "Alicante", category: "formalities", detail: "formalities_short", minutes: 8, confirmations: 2 },
  { port: "Alger", category: "access", detail: "access_ok", minutes: 18, confirmations: 4 },
];

export const isDemoReport = (alert: Pick<TravelAlert, "id">) => alert.id.startsWith(DEMO_PREFIX);

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/**
 * Les exemples à afficher : aucun si le réglage est « jamais » ; en « auto », seulement tant qu'il
 * n'y a aucun vrai signalement public ; en « toujours », en plus des vrais.
 */
export function demoReports(
  ports: Port[],
  realCount: number,
  setting: DemoSetting,
  now = Date.now(),
): TravelAlert[] {
  if (setting.mode === "never") return [];
  if (setting.mode === "auto" && realCount > 0) return [];
  return BUILT_IN.flatMap((demo, index): TravelAlert[] => {
    const port = ports.find((item) => norm(item.name).startsWith(norm(demo.port)));
    if (!port) return [];
    return [
      {
        id: `${DEMO_PREFIX}${index}`,
        target_kind: "port",
        target_id: port.id,
        departure_id: null,
        category: demo.category,
        delay_minutes: null,
        detail: demo.detail,
        on_site: false,
        on_site_confirmations: 0,
        created_at: new Date(now - demo.minutes * 60_000).toISOString(),
        expires_at: new Date(now + 24 * 3_600_000).toISOString(),
        own: false,
        confirmations: demo.confirmations,
        confirmed: false,
        denials: 0,
        denied: false,
        validated: true,
      },
    ];
  });
}
