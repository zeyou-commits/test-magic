import type { CSSProperties } from "react";
import { AlertCircle, Check, ChevronRight, FileText, type LucideIcon } from "lucide-react";
import { tr } from "@/lib/i18n";

export type GlanceTile = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Le chiffre ou le mot qui se lit de loin (« 0/6 », « ≈ 1 200 € », « À prendre »). */
  value: string;
  detail: string;
  /** ok : prêt ; todo : il reste à faire ; missing : pas encore renseigné. */
  status: "ok" | "todo" | "missing";
  /** Avancement de 0 à 1 (papiers) : une petite barre sous le chiffre. */
  progress?: number;
  onClick: () => void;
};

const statusText = { ok: "Prêt", todo: "À faire", missing: "À compléter" } as const;

/**
 * Le récap en un coup d'œil : le départ et le compte à rebours en tête, puis une tuile par
 * rubrique avec un état franc (prêt, à faire, à compléter). Rien n'est coché s'il reste à faire.
 */
export function TripGlance({
  title,
  when,
  daysLeft,
  line,
  tiles,
}: {
  title: string;
  when: string;
  /** Jours avant le départ (null sans date précise). */
  daysLeft: number | null;
  line: string | null;
  tiles: GlanceTile[];
}) {
  const ready = tiles.filter((tile) => tile.status === "ok").length;
  const left = tiles.filter((tile) => tile.status !== "ok");
  const ratio = tiles.length ? ready / tiles.length : 0;
  return (
    <section className="bw-glance" aria-labelledby="glance-title">
      <header className="bw-glance__head">
        <div className="min-w-0">
          <small>
            <FileText size={12} aria-hidden />{tr("ui.tripGlance.votreRecap")}
          </small>
          <h2 id="glance-title">{title}</h2>
          <p>
            {when}
            {line ? ` · ${line}` : ""}
          </p>
        </div>
        {daysLeft !== null && daysLeft >= 0 ? (
          <span className="bw-glance__count" aria-label={`Départ dans ${daysLeft} jours`}>
            <b>{daysLeft === 0 ? tr("ui.tripGlance.jourJ") : `J-${daysLeft}`}</b>
            <small>{daysLeft === 0 ? tr("ui.tripGlance.cEstAujourdHui") : tr("ui.tripGlance.avantLeDepart")}</small>
          </span>
        ) : null}
      </header>
      <div className="bw-glance__progress">
        <div className="bw-glance__bar" style={{ "--r": ratio } as CSSProperties} aria-hidden>
          <span />
        </div>
        <p>
          <b>
            {ready}{tr("ui.tripGlance.sur")}{tiles.length}{tr("ui.tripGlance.prets")}
          </b>
          {left.length ? (
            <>{tr("ui.tripGlance.reste")}{left.map((tile) => tile.label.toLowerCase()).join(", ")}</>
          ) : (
            <>{tr("ui.tripGlance.toutEstPretBonVoyage")}</>
          )}
        </p>
      </div>
      <ul className="bw-glance__tiles">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <li key={tile.key} data-status={tile.status}>
              <button
                type="button"
                onClick={tile.onClick}
                aria-label={`${tile.label} : ${tile.value}, ${tile.detail}. ${statusText[tile.status]}. Ouvrir`}
              >
                <span className="bw-glance__top">
                  <span className="bw-glance__ico" aria-hidden>
                    <Icon size={16} />
                  </span>
                  <span className="bw-glance__lbl">{tile.label}</span>
                </span>
                <b className="bw-glance__val">{tile.value}</b>
                {tile.progress !== undefined ? (
                  <span
                    className="bw-glance__mini"
                    style={{ "--r": tile.progress } as CSSProperties}
                    aria-hidden
                  >
                    <span />
                  </span>
                ) : null}
                <span className="bw-glance__det">{tile.detail}</span>
                <span className="bw-glance__foot">
                  <span className="bw-glance__state" aria-hidden>
                    {tile.status === "ok" ? (
                      <Check size={11} strokeWidth={3} />
                    ) : (
                      <AlertCircle size={11} strokeWidth={2.6} />
                    )}
                    {statusText[tile.status]}
                  </span>
                  <ChevronRight size={15} className="bw-glance__go" aria-hidden />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
