import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  FUTURE_ROLES,
  ROLE_CATALOG,
  STAFF_ROLES,
  TAB_ACTIONS,
  TUNABLE_ROLES,
  homeForRole,
  roleAllowsTab,
  roleCanUseTab,
  type RoleConfig,
  type StaffRole,
  type TunableRole,
} from "@/lib/admin/permissions";
import { useRoleConfig } from "@/lib/admin/roleConfig";
import { RolesTune } from "./RolesTune";
import { adminSections, adminSpaces, sectionLabel } from "./adminSections";

type View = "compare" | TunableRole;
const ABBR: Record<StaffRole, string> = { admin: "Adm.", editor: "Éd.", moderator: "Mod." };
const SHORT: Record<StaffRole, string> = {
  admin: "Admin",
  editor: "Éditeur",
  moderator: "Modérateur",
};

/**
 * « Rôles et droits » : le tableau comparatif des profils (ce que chacun peut faire, rubrique
 * par rubrique) et, pour l'éditeur et le modérateur, le réglage fin de l'administrateur.
 */
export function RolesAdmin({ onPreview }: { onPreview?: (role: TunableRole) => void }) {
  const { data, isPending } = useRoleConfig();
  const config = data?.config ?? {};
  const ready = data?.ready ?? false;
  const [view, setView] = useState<View>("compare");
  return (
    <div className="bo-roles">
      <div className="bo-roles__cards">
        {STAFF_ROLES.map((role) => {
          const open = adminSections.filter((s) => roleCanUseTab(role, s.id, config)).length;
          const tunable = role !== "admin";
          return (
            <button
              key={role}
              type="button"
              className="bo-rolecard"
              data-active={view === role || undefined}
              disabled={!tunable}
              onClick={() => tunable && setView(role as TunableRole)}
            >
              <span className="bo-rolecard__top">
                <span className={`bw-role-chip bw-role-chip--${role}`}>
                  {ROLE_CATALOG[role].label}
                </span>
                <small>
                  {open} rubrique{open > 1 ? "s" : ""}
                </small>
              </span>
              <span className="bo-rolecard__text">{ROLE_CATALOG[role].summary}</span>
              <span className="bo-rolecard__foot">
                Arrivée : {sectionLabel(homeForRole(role, config))}
                {tunable ? <em>Régler</em> : <em data-muted>Tous les droits</em>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bo-seg" role="tablist" aria-label="Affichage">
        {(["compare", ...TUNABLE_ROLES] as View[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
          >
            {id === "compare"
              ? "Comparer"
              : `Régler ${id === "editor" ? "l'éditeur" : "le modérateur"}`}
          </button>
        ))}
      </div>

      {!isPending && !ready ? (
        <p className="bo-notice" data-tone="info">
          Le réglage fin n'est pas encore disponible : la mise à jour de la base
          (bw_staff_role_config) n'est pas appliquée. Le tableau montre le cadre de chaque rôle.
        </p>
      ) : null}

      {view === "compare" ? (
        <Compare config={config} />
      ) : (
        <RolesTune
          key={view}
          role={view}
          config={config}
          ready={ready}
          updatedAt={data?.updatedAt ?? null}
          onPreview={onPreview}
        />
      )}

      <p className="bo-roles__future">
        <span className="font-semibold">À venir :</span>
        {FUTURE_ROLES.map((role) => (
          <span key={role.id} className="bw-role-chip bw-role-chip--future" title={role.summary}>
            {role.label}
          </span>
        ))}
        <span>
          vues externes en préparation. Les accès des compagnies s'attribuent depuis leur fiche
          (Réseau → Compagnies).
        </span>
      </p>
    </div>
  );
}

/** Le tableau comparatif : une ligne par rubrique, une colonne par rôle. */
function Compare({ config }: { config: RoleConfig }) {
  const [diffOnly, setDiffOnly] = useState(false);
  const state = (role: StaffRole, tab: string) =>
    roleCanUseTab(role, tab, config)
      ? roleAllowsTab(role, tab)
        ? "on"
        : "added"
      : roleAllowsTab(role, tab)
        ? "closed"
        : "off";
  return (
    <section className="bo-card bo-matrix" aria-label="Comparatif des rôles">
      <div className="bo-matrix__bar">
        <label className="bo-matrix__toggle">
          <Switch checked={diffOnly} onCheckedChange={setDiffOnly} />
          Seulement ce qui diffère
        </label>
        <ul className="bo-matrix__legend" aria-label="Légende">
          <li>
            <Check aria-hidden /> Peut le faire
          </li>
          <li data-state="added">
            <Plus aria-hidden /> Ouvert en plus
          </li>
          <li data-state="closed">
            <X aria-hidden /> Fermé par vous
          </li>
          <li data-state="off">
            <span aria-hidden>—</span> Hors du rôle
          </li>
        </ul>
      </div>
      <div className="bo-matrix__head" aria-hidden>
        <span>Ce qu'on peut faire</span>
        {STAFF_ROLES.map((role) => (
          <span
            key={role}
            className={`bw-role-chip bw-role-chip--${role}`}
            title={ROLE_CATALOG[role].label}
          >
            <span className="bo-matrix__long">{SHORT[role]}</span>
            <span className="bo-matrix__abbr">{ABBR[role]}</span>
          </span>
        ))}
      </div>
      {adminSpaces.map((space) => {
        const rows = adminSections.filter(
          (section) =>
            section.group === space.id &&
            (!diffOnly || new Set(STAFF_ROLES.map((r) => state(r, section.id))).size > 1),
        );
        if (!rows.length) return null;
        return (
          <div key={space.id} className="bo-matrix__group">
            <h3>
              <space.icon aria-hidden /> {space.label}
            </h3>
            <ul>
              {rows.map((section) => (
                <li key={section.id} className="bo-matrix__row">
                  <span className="bo-matrix__what">
                    <strong>{section.label}</strong>
                    <small>{TAB_ACTIONS[section.id] ?? section.description}</small>
                  </span>
                  {STAFF_ROLES.map((role) => {
                    const value = state(role, section.id);
                    const label =
                      value === "on"
                        ? "Oui"
                        : value === "added"
                          ? "Oui, ouvert en plus"
                          : value === "closed"
                            ? "Fermé par vous"
                            : "Non";
                    return (
                      <span
                        key={role}
                        className="bo-matrix__cell"
                        data-state={value}
                        role="img"
                        aria-label={`${ROLE_CATALOG[role].label} : ${label}`}
                        title={`${ROLE_CATALOG[role].label} : ${label}`}
                      >
                        {value === "on" ? (
                          <Check />
                        ) : value === "added" ? (
                          <Plus />
                        ) : value === "closed" ? (
                          <X />
                        ) : (
                          "—"
                        )}
                      </span>
                    );
                  })}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
