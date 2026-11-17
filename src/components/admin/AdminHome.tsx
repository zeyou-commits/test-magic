import {
  CalendarClock,
  FileSpreadsheet,
  Flag,
  Megaphone,
  MessageSquare,
  Newspaper,
  Send,
  Ship,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminCounts } from "@/hooks/useAdminCounts";
import type { AdminFilter } from "@/lib/admin/navigation";

type Tile = {
  tab: string;
  filter?: AdminFilter;
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  /** Compteur de travail à faire : rouge s'il reste quelque chose, « à jour » sinon. */
  todo?: boolean;
  hint: string;
};

/**
 * L'accueil de l'espace équipe : un bonjour, les chiffres du jour (chaque tuile ouvre la
 * rubrique où l'on agit) et les raccourcis les plus utilisés. Chiffres réels, lus en base.
 */
export function AdminHome({
  onNavigate,
  can,
}: {
  onNavigate: (id: string, filter?: AdminFilter) => void;
  can: (id: string) => boolean;
}) {
  const { profile, user } = useAuth();
  const { data, isPending, isError } = useAdminCounts();
  const first = (profile?.display_name || user?.email || "").split(/[ @]/)[0];
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  }).format(new Date());
  const tiles: Tile[] = (
    [
      {
        tab: "departures",
        filter: "today",
        label: "Départs aujourd'hui",
        value: data?.today,
        icon: CalendarClock,
        hint: "Voir la liste du jour",
      },
      {
        tab: "departures",
        filter: "unassigned",
        label: "Départs sans navire",
        value: data?.unlinked,
        icon: Ship,
        todo: true,
        hint: "À affecter",
      },
      {
        tab: "community",
        label: "Observations à vérifier",
        value: data?.anomalies,
        icon: Megaphone,
        todo: true,
        hint: "Signalements des voyageurs",
      },
      {
        tab: "reviews",
        filter: "pending",
        label: "Avis à relire",
        value: data?.reviews,
        icon: Star,
        todo: true,
        hint: "Avant publication",
      },
      {
        tab: "reports",
        filter: "new",
        label: "Erreurs signalées",
        value: data?.reports,
        icon: Flag,
        todo: true,
        hint: "Horaires ou fiches à corriger",
      },
      {
        tab: "watch",
        label: "Veille à valider",
        value: data?.watch,
        icon: Newspaper,
        todo: true,
        hint: "Propositions repérées",
      },
    ] satisfies Tile[]
  ).filter((tile) => can(tile.tab));
  const waiting = tiles
    .filter((tile) => tile.todo)
    .reduce((sum, tile) => sum + (tile.value ?? 0), 0);
  const shortcuts = [
    { tab: "notifications", label: "Écrire aux voyageurs", icon: Send },
    { tab: "flash", label: "Publier un Flash info", icon: MessageSquare },
    { tab: "import", label: "Importer un planning", icon: FileSpreadsheet },
  ].filter((item) => can(item.tab));
  return (
    <section aria-label="Vue d'ensemble">
      <div className="bo-hello">
        <div>
          <h2>Bonjour{first ? ` ${first}` : ""}</h2>
          <p>
            {today.charAt(0).toUpperCase() + today.slice(1)} ·{" "}
            {isPending
              ? "lecture des chiffres…"
              : isError
                ? "chiffres indisponibles pour le moment"
                : waiting
                  ? `${waiting} point${waiting > 1 ? "s" : ""} à traiter`
                  : "tout est à jour"}
          </p>
        </div>
        {shortcuts.length ? (
          <div className="bo-hello__actions">
            {shortcuts.map((item) => (
              <button key={item.tab} type="button" onClick={() => onNavigate(item.tab)}>
                <item.icon aria-hidden /> {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="bo-kpis">
        {tiles.map((tile) => (
          <button
            key={`${tile.tab}:${tile.filter ?? ""}`}
            type="button"
            className="bo-kpi"
            data-tone={tile.todo ? (tile.value ? "todo" : "ok") : undefined}
            onClick={() => onNavigate(tile.tab, tile.filter)}
          >
            <span className="bo-kpi__top">
              {tile.label}
              <tile.icon aria-hidden />
            </span>
            <strong>{tile.value ?? "–"}</strong>
            <small>{tile.todo && tile.value === 0 ? "À jour" : tile.hint}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
