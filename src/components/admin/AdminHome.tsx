import { useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  Flag,
  Megaphone,
  MessageSquare,
  Newspaper,
  Send,
  Ship,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useAdminCounts } from "@/hooks/useAdminCounts";
import { userAdminAction, type UsersStats } from "@/lib/admin/users";
import type { AdminFilter } from "@/lib/admin/navigation";
import { ROLE_CATALOG, TAB_ACTIONS, staffRoles } from "@/lib/admin/permissions";
import { adminSections } from "./adminSections";

type Shortcut = { tab: string; filter?: AdminFilter; label: string; icon: LucideIcon };
/** Raccourcis du bonjour, selon le métier : chacun arrive sur ce qu'il fait le plus. */
const SHORTCUTS: Record<string, Shortcut[]> = {
  admin: [
    { tab: "users", label: "Utilisateurs", icon: Users },
    { tab: "notifications", label: "Écrire aux voyageurs", icon: Send },
    { tab: "flash", label: "Publier un Flash info", icon: MessageSquare },
    { tab: "import", label: "Importer un planning", icon: FileSpreadsheet },
  ],
  editor: [
    { tab: "departures", filter: "today", label: "Départs du jour", icon: CalendarClock },
    { tab: "planning", label: "Planning de la semaine", icon: CalendarDays },
    { tab: "flash", label: "Publier un Flash info", icon: MessageSquare },
    { tab: "import", label: "Importer un planning", icon: FileSpreadsheet },
  ],
  moderator: [
    { tab: "reviews", filter: "pending", label: "Avis à relire", icon: Star },
    { tab: "community", label: "Signalements", icon: Megaphone },
    { tab: "reports", filter: "new", label: "Erreurs signalées", icon: Flag },
    { tab: "companyRequests", label: "Demandes des compagnies", icon: ClipboardList },
  ],
};

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
  roles = [],
}: {
  onNavigate: (id: string, filter?: AdminFilter) => void;
  can: (id: string) => boolean;
  /** Rôles d'équipe effectifs (ou celui de l'aperçu). */
  roles?: readonly string[];
}) {
  const [showMine, setShowMine] = useState(false);
  const mine = staffRoles(roles);
  const mySections = adminSections.filter((section) => can(section.id));
  const { profile, user } = useAuth();
  const { data, isPending, isError } = useAdminCounts();
  // Les comptes : mêmes chiffres (et même cache) que la rubrique Utilisateurs, réservés à l'admin.
  const users = useQuery({
    queryKey: ["admin", "users", "stats", user?.id],
    queryFn: () => userAdminAction<UsersStats>({ action: "stats" }),
    enabled: Boolean(user) && can("users"),
    retry: false,
  });
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
        tab: "users",
        label: "Utilisateurs",
        value: users.data?.total,
        icon: Users,
        hint: users.data
          ? `${users.data.active7} actifs sur 7 jours · voir la liste`
          : "Voir la liste des comptes",
      },
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
  const shortcuts = (SHORTCUTS[mine[0] ?? "admin"] ?? [])
    .filter((item) => can(item.tab))
    .slice(0, 4);
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
              <button
                key={item.tab}
                type="button"
                onClick={() => onNavigate(item.tab, item.filter)}
              >
                <item.icon aria-hidden /> {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {mine.length && !mine.includes("admin") ? (
        <>
          <p className="bo-myrole">
            {mine.map((role) => (
              <span key={role} className={`bw-role-chip bw-role-chip--${role}`}>
                {ROLE_CATALOG[role].label}
              </span>
            ))}
            <span>
              {mySections.length} rubrique{mySections.length > 1 ? "s" : ""} ouverte
              {mySections.length > 1 ? "s" : ""}
            </span>
            <button type="button" aria-expanded={showMine} onClick={() => setShowMine((v) => !v)}>
              {showMine ? "Masquer" : "Ce que je peux faire"}
            </button>
          </p>
          {showMine ? (
            <ul className="bo-mylist">
              {mySections.map((section) => (
                <li key={section.id}>
                  <strong>{section.label}</strong>
                  <small>{TAB_ACTIONS[section.id] ?? section.description}</small>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
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
