import type { ReactNode } from "react";
import { Bell } from "lucide-react";
import { adminSections as sections, adminSpaces, sectionLabel } from "./adminSections";
import { BackofficeShell, type ShellSearchItem } from "./BackofficeShell";
import { ROLE_CATALOG, rolesForTab, staffRoles } from "@/lib/admin/permissions";

/** Fiche retrouvable depuis la recherche du menu (port, navire, compagnie…). */
export type AdminSearchItem = ShellSearchItem;

/** L'espace équipe : le cadre commun, avec les rubriques et les droits de l'équipe BledWay. */
export function AdminWorkspace({
  tab,
  onNavigate,
  badges,
  children,
  canAccess = () => true,
  searchItems = [],
  onOpenItem,
  roles = [],
  refusedTab,
}: {
  tab: string;
  onNavigate: (tab: string) => void;
  badges: Record<string, number>;
  children: ReactNode;
  canAccess?: (tab: string) => boolean;
  searchItems?: AdminSearchItem[];
  onOpenItem?: (tab: string, id: string) => void;
  /** Rôles d'équipe du compte connecté, affichés sous la marque. */
  roles?: readonly string[];
  /** Rubrique demandée (lien, adresse) mais fermée à ce rôle : on explique au lieu de rediriger en silence. */
  refusedTab?: string | undefined;
}) {
  const mine = staffRoles(roles);
  const available = sections.filter((section) => canAccess(section.id));
  const current = sections.find((section) => section.id === tab) ?? sections[0]!;
  const pending = badges["notifications"] ?? 0;
  const refusedBy = refusedTab ? rolesForTab(refusedTab) : [];
  return (
    <BackofficeShell
      kind="team"
      brandLabel="Espace équipe"
      brandSub={
        mine.length ? (
          <p className="bo-role" aria-label="Votre rôle">
            {mine.map((role) => (
              <span key={role} className={`bw-role-chip bw-role-chip--${role}`}>
                {ROLE_CATALOG[role].label}
              </span>
            ))}
            <small>
              {available.length} rubrique{available.length > 1 ? "s" : ""}
            </small>
          </p>
        ) : null
      }
      spaces={adminSpaces}
      sections={sections}
      tab={tab}
      onNavigate={onNavigate}
      badges={badges}
      canAccess={canAccess}
      searchItems={searchItems}
      onOpenItem={onOpenItem}
      topActions={
        canAccess("notifications") ? (
          <button
            type="button"
            className="bo-iconbtn"
            onClick={() => onNavigate("notifications")}
            aria-label={`${pending} annonce${pending > 1 ? "s" : ""} à vérifier`}
            title="Annonces à vérifier"
          >
            <Bell aria-hidden />
            {pending > 0 ? <b>{pending}</b> : null}
          </button>
        ) : null
      }
      notice={
        refusedTab ? (
          <div role="alert" className="bo-notice" data-tone="warn">
            <strong>
              « {sectionLabel(refusedTab)} » est réservée aux{" "}
              {[...refusedBy.filter((role) => role !== "admin"), "admin" as const]
                .map((role) => `${ROLE_CATALOG[role].label.toLowerCase()}s`)
                .join(" et aux ")}
              .
            </strong>
            <span>
              Votre rôle ({mine.map((role) => ROLE_CATALOG[role].label).join(", ")}) ne l'ouvre pas.
              Pour y accéder, demandez à un administrateur. Vous voyez à la place « {current.label}{" "}
              ».
            </span>
          </div>
        ) : null
      }
    >
      {children}
    </BackofficeShell>
  );
}
