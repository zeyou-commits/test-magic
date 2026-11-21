import { useEffect, useMemo, useState } from "react";
import { Eye, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  LOCKED_TABS,
  ROLE_CATALOG,
  TAB_ACTIONS,
  roleAllowsTab,
  roleCanBeGranted,
  roleCanUseTab,
  type RoleConfig,
  type TunableRole,
} from "@/lib/admin/permissions";
import { useSaveRoleSetting } from "@/lib/admin/roleConfig";
import { adminSections, adminSpaces } from "./adminSections";

/**
 * Le réglage d'un rôle : un interrupteur par rubrique (fermer une rubrique de son cadre, ou en
 * ouvrir une en plus), la page d'arrivée, un enregistrement groupé.
 */
export function RolesTune({
  role,
  config,
  ready,
  updatedAt,
  onPreview,
}: {
  role: TunableRole;
  config: RoleConfig;
  ready: boolean;
  updatedAt: string | null;
  onPreview?: ((role: TunableRole) => void) | undefined;
}) {
  const saved = config[role];
  // L'état édité : les rubriques ouvertes. Fermées et ouvertes en plus s'en déduisent.
  const savedOpen = useMemo(
    () => adminSections.filter((s) => roleCanUseTab(role, s.id, config)).map((s) => s.id),
    [role, config],
  );
  const [open, setOpen] = useState<string[]>(savedOpen);
  const [home, setHome] = useState<string>(saved?.home ?? "overview");
  useEffect(() => {
    setOpen(savedOpen);
    setHome(saved?.home ?? "overview");
  }, [savedOpen, saved?.home]);
  const save = useSaveRoleSetting();

  const frame = adminSections.filter((section) => roleAllowsTab(role, section.id));
  const removed = frame.filter((s) => !open.includes(s.id)).map((s) => s.id);
  const added = open.filter((id) => !roleAllowsTab(role, id));
  const openTabs = adminSections.filter((section) => open.includes(section.id));
  const dirty =
    open.length !== savedOpen.length ||
    open.some((tab) => !savedOpen.includes(tab)) ||
    home !== (saved?.home ?? "overview");
  const isDefault = !removed.length && !added.length && home === "overview";
  const toggle = (tab: string, on: boolean) => {
    setOpen((list) => (on ? [...list, tab] : list.filter((id) => id !== tab)));
    if (!on && home === tab) setHome("overview");
  };
  const submit = () =>
    save.mutate(
      { role, removed, added, home: home === "overview" ? null : home },
      {
        onSuccess: () => toast.success(`Droits du rôle ${ROLE_CATALOG[role].label} enregistrés`),
        onError: (error) => toast.error(error.message || "Enregistrement impossible"),
      },
    );

  return (
    <section className="bo-card bo-tune" aria-label={`Régler le rôle ${ROLE_CATALOG[role].label}`}>
      <header className="bo-tune__head">
        <p>
          <span className={`bw-role-chip bw-role-chip--${role}`}>{ROLE_CATALOG[role].label}</span>{" "}
          ouvre <strong>{openTabs.length}</strong> rubrique{openTabs.length > 1 ? "s" : ""}
          {removed.length ? ` · ${removed.length} fermée${removed.length > 1 ? "s" : ""}` : ""}
          {added.length ? ` · ${added.length} en plus` : ""}.
          {updatedAt ? (
            <small>
              {" "}
              Dernier réglage le{" "}
              {new Date(updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.
            </small>
          ) : null}
        </p>
        <div className="bo-tune__tools">
          <label>
            Page d'arrivée
            <select value={home} onChange={(event) => setHome(event.target.value)}>
              {openTabs.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="bo-btn"
            disabled={!ready || save.isPending || isDefault}
            onClick={() => {
              setOpen(frame.map((s) => s.id));
              setHome("overview");
            }}
          >
            <RotateCcw aria-hidden /> Réglage d'origine
          </button>
          {onPreview ? (
            <button type="button" className="bo-btn" onClick={() => onPreview(role)}>
              <Eye aria-hidden /> Voir comme un {ROLE_CATALOG[role].label.toLowerCase()}
            </button>
          ) : null}
        </div>
      </header>

      {adminSpaces.map((space) => {
        const rows = adminSections.filter((section) => section.group === space.id);
        return (
          <div key={space.id} className="bo-tune__group">
            <h3>
              <space.icon aria-hidden /> {space.label}
            </h3>
            <ul>
              {rows.map((section) => {
                const inFrame = roleAllowsTab(role, section.id);
                const locked = LOCKED_TABS.has(section.id);
                const adminOnly = !inFrame && !roleCanBeGranted(role, section.id);
                const on = open.includes(section.id);
                const id = `tune-${role}-${section.id}`;
                return (
                  <li
                    key={section.id}
                    data-off={(!on && inFrame) || undefined}
                    data-extra={(on && !inFrame) || undefined}
                    data-muted={adminOnly || undefined}
                  >
                    <label htmlFor={id}>
                      <strong>
                        {section.label}
                        {on && !inFrame ? <em>En plus</em> : null}
                        {!on && inFrame ? <em data-tone="off">Fermée</em> : null}
                      </strong>
                      <small>{TAB_ACTIONS[section.id] ?? section.description}</small>
                    </label>
                    {locked ? (
                      <span className="bo-tune__lock" title="L'accueil reste toujours ouvert">
                        <Lock aria-hidden /> Toujours
                      </span>
                    ) : adminOnly ? (
                      <span
                        className="bo-tune__lock"
                        title="Comptes, rôles, notifications et référence restent à l'administrateur"
                      >
                        <Lock aria-hidden /> Admin
                      </span>
                    ) : (
                      <Switch
                        id={id}
                        checked={on}
                        disabled={!ready || save.isPending}
                        onCheckedChange={(value) => toggle(section.id, value)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <p className="bo-tune__note">
        Le réglage s'applique aussi en base de données. Une rubrique fermée refuse les actions qui
        ne relèvent que d'elle ; une rubrique ouverte en plus donne les mêmes droits que le rôle qui
        la contient. Les comptes, les rôles, les notifications aux voyageurs et les données de
        référence restent réservés à l'administrateur.
      </p>

      <div className="bo-tune__save" data-dirty={dirty || undefined}>
        <span>{dirty ? "Modifications non enregistrées" : "À jour"}</span>
        {dirty ? (
          <button
            type="button"
            className="bo-btn"
            onClick={() => {
              setOpen(savedOpen);
              setHome(saved?.home ?? "overview");
            }}
          >
            Annuler
          </button>
        ) : null}
        <button
          type="button"
          className="bo-btn bo-btn--primary"
          disabled={!ready || !dirty || save.isPending}
          onClick={submit}
        >
          {save.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </section>
  );
}
