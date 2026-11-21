import { useEffect, useMemo, useState } from "react";
import { Check, Eye, Lock, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  FUTURE_ROLES,
  LOCKED_TABS,
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
import { useRoleConfig, useSaveRoleSetting } from "@/lib/admin/roleConfig";
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
        <Tune
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
    roleCanUseTab(role, tab, config) ? "on" : roleAllowsTab(role, tab) ? "closed" : "off";
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
                      value === "on" ? "Oui" : value === "closed" ? "Fermé par vous" : "Non";
                    return (
                      <span
                        key={role}
                        className="bo-matrix__cell"
                        data-state={value}
                        role="img"
                        aria-label={`${ROLE_CATALOG[role].label} : ${label}`}
                        title={`${ROLE_CATALOG[role].label} : ${label}`}
                      >
                        {value === "on" ? <Check /> : value === "closed" ? <X /> : "—"}
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

/** Le réglage d'un rôle : interrupteur par rubrique, page d'arrivée, enregistrement groupé. */
function Tune({
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
  const savedRemoved = useMemo(() => saved?.removed ?? [], [saved]);
  const [removed, setRemoved] = useState<string[]>([...savedRemoved]);
  const [home, setHome] = useState<string>(saved?.home ?? "overview");
  useEffect(() => {
    setRemoved([...savedRemoved]);
    setHome(saved?.home ?? "overview");
  }, [savedRemoved, saved?.home]);
  const save = useSaveRoleSetting();

  const inFrame = adminSections.filter((section) => roleAllowsTab(role, section.id));
  const outside = adminSections.filter((section) => !roleAllowsTab(role, section.id));
  const openTabs = inFrame.filter((section) => !removed.includes(section.id));
  const dirty =
    removed.length !== savedRemoved.length ||
    removed.some((tab) => !savedRemoved.includes(tab)) ||
    home !== (saved?.home ?? "overview");
  const toggle = (tab: string, on: boolean) => {
    setRemoved((list) => (on ? list.filter((id) => id !== tab) : [...list, tab]));
    if (!on && home === tab) setHome("overview");
  };
  const submit = () =>
    save.mutate(
      { role, removed, home: home === "overview" ? null : home },
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
          ouvre <strong>{openTabs.length}</strong> rubrique{openTabs.length > 1 ? "s" : ""} sur{" "}
          {inFrame.length} possibles.
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
            disabled={!ready || save.isPending || (!removed.length && home === "overview")}
            onClick={() => {
              setRemoved([]);
              setHome("overview");
            }}
          >
            <RotateCcw aria-hidden /> Tout rouvrir
          </button>
          {onPreview ? (
            <button type="button" className="bo-btn" onClick={() => onPreview(role)}>
              <Eye aria-hidden /> Voir comme un {ROLE_CATALOG[role].label.toLowerCase()}
            </button>
          ) : null}
        </div>
      </header>

      {adminSpaces.map((space) => {
        const rows = inFrame.filter((section) => section.group === space.id);
        if (!rows.length) return null;
        return (
          <div key={space.id} className="bo-tune__group">
            <h3>
              <space.icon aria-hidden /> {space.label}
            </h3>
            <ul>
              {rows.map((section) => {
                const locked = LOCKED_TABS.has(section.id);
                const on = !removed.includes(section.id);
                const id = `tune-${role}-${section.id}`;
                return (
                  <li key={section.id} data-off={!on || undefined}>
                    <label htmlFor={id}>
                      <strong>{section.label}</strong>
                      <small>{TAB_ACTIONS[section.id] ?? section.description}</small>
                    </label>
                    {locked ? (
                      <span className="bo-tune__lock" title="L'accueil reste toujours ouvert">
                        <Lock aria-hidden /> Toujours
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

      <details className="bo-tune__outside">
        <summary>
          Hors du rôle {ROLE_CATALOG[role].label.toLowerCase()} ({outside.length})
        </summary>
        <p>
          Ces rubriques sont réservées par la base de données à d'autres rôles : on ne peut pas les
          ouvrir d'ici. Pour qu'une personne y accède, donnez-lui le rôle qui les contient
          (Utilisateurs → Équipe).
        </p>
        <ul>
          {outside.map((section) => (
            <li key={section.id}>
              {section.label}
              <small>
                {STAFF_ROLES.filter((r) => roleAllowsTab(r, section.id))
                  .map((r) => SHORT[r])
                  .join(", ")}
              </small>
            </li>
          ))}
        </ul>
      </details>

      <div className="bo-tune__save" data-dirty={dirty || undefined}>
        <span>{dirty ? "Modifications non enregistrées" : "À jour"}</span>
        {dirty ? (
          <button
            type="button"
            className="bo-btn"
            onClick={() => {
              setRemoved([...savedRemoved]);
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
