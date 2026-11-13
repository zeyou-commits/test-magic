import { Check } from "lucide-react";
import { FUTURE_ROLES, ROLE_CATALOG, STAFF_ROLES, roleCanUseTab } from "@/lib/admin/permissions";
import { adminGroups, adminSections } from "./adminSections";

/**
 * « Qui peut faire quoi » : tableau rubrique × rôle calculé à partir du catalogue des rôles
 * et du menu. Une nouvelle rubrique ou un changement de droit s'y reporte tout seul.
 */
export function RoleMatrix() {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Qui peut faire quoi</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {STAFF_ROLES.map((role) => {
          const count = adminSections.filter((section) => roleCanUseTab(role, section.id)).length;
          return (
            <div key={role} className="rounded-xl border border-border p-3">
              <p className="flex items-center justify-between gap-2">
                <span className={`bw-role-chip bw-role-chip--${role}`}>
                  {ROLE_CATALOG[role].label}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {count} rubrique{count > 1 ? "s" : ""}
                </span>
              </p>
              <p className="mt-2 text-xs leading-relaxed">{ROLE_CATALOG[role].summary}</p>
            </div>
          );
        })}
      </div>
      <details className="mt-3 rounded-xl border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
          Voir le détail, rubrique par rubrique
        </summary>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Rubrique</th>
                {STAFF_ROLES.map((role) => (
                  <th key={role} className="w-28 px-3 py-2 text-center font-medium">
                    {ROLE_CATALOG[role].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adminGroups.map((group) => {
                const rows = adminSections.filter((section) => section.group === group);
                if (!rows.length) return null;
                return [
                  <tr key={`g:${group}`} className="bg-muted/40">
                    <td
                      colSpan={STAFF_ROLES.length + 1}
                      className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      {group || "Quotidien"}
                    </td>
                  </tr>,
                  ...rows.map((section) => (
                    <tr key={section.id} className="border-t border-border">
                      <td className="px-3 py-1.5">{section.label}</td>
                      {STAFF_ROLES.map((role) => (
                        <td key={role} className="px-3 py-1.5 text-center">
                          {roleCanUseTab(role, section.id) ? (
                            <Check size={15} className="inline text-primary" aria-label="Oui" />
                          ) : (
                            <span className="text-border" aria-label="Non">
                              —
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-semibold">À venir :</span>
        {FUTURE_ROLES.map((role) => (
          <span key={role.id} className="bw-role-chip bw-role-chip--future" title={role.summary}>
            {role.label}
          </span>
        ))}
        <span>vues externes en préparation, pas encore attribuables.</span>
      </div>
    </section>
  );
}
