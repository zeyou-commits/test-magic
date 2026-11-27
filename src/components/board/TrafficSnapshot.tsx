import { Link } from "@tanstack/react-router";
import { formatShortDay, formatTime } from "@/lib/ferry/format";
import type { SnapshotCrossing, SnapshotDisruption, TrafficSnapshot as Snapshot } from "@/lib/ferry/trafficSnapshot";
import { intlLocale, placeName, tr } from "@/lib/i18n";

const PARIS = "Europe/Paris";
const plural = (n: number) => (n > 1 ? "s" : "");

function crossingText(c: SnapshotCrossing) {
  return tr("ui.trafficSnapshot.traversee", {
    day: formatShortDay(c.departureAt, c.zone),
    time: formatTime(c.departureAt, c.zone),
    from: placeName(c.from),
    to: placeName(c.to),
    company: c.company,
  });
}

function disruptionLabel(d: SnapshotDisruption) {
  if (d.kind === "cancelled") return tr("ui.trafficSnapshot.annulee");
  if (d.kind === "postponed") return tr("ui.trafficSnapshot.reportee");
  if (d.kind === "delayed") return tr("ui.trafficSnapshot.retard", { n: d.delayMinutes ?? 0 });
  return tr("ui.trafficSnapshot.modifie");
}

/** Phrase d'en-tête datée, avec l'instant exact en <time> pour les moteurs. */
function SnapshotStamp({ at }: { at: string }) {
  const date = new Intl.DateTimeFormat(intlLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: PARIS,
  }).format(new Date(at));
  return (
    <p className="bw-snapshot__stamp">
      <time dateTime={at}>{tr("ui.trafficSnapshot.situationAu", { date, time: formatTime(at, PARIS) })}</time>
    </p>
  );
}

/**
 * Point du trafic daté (horaires publiés à l'instant du rendu). `compact` : version courte de
 * l'accueil, qui renvoie vers le tableau complet.
 */
export function TrafficSnapshot({ snapshot, compact = false }: { snapshot: Snapshot; compact?: boolean }) {
  const counts = [
    snapshot.underway.length
      ? tr("ui.trafficSnapshot.enCours", { n: snapshot.underway.length, s: plural(snapshot.underway.length) })
      : tr("ui.trafficSnapshot.aucuneEnCours"),
    tr("ui.trafficSnapshot.restantAujourdhui", { n: snapshot.leftToday, s: plural(snapshot.leftToday) }),
    tr("ui.trafficSnapshot.demain", { n: snapshot.tomorrow }),
    tr("ui.trafficSnapshot.septJours", { n: snapshot.nextSevenDays }),
  ];
  const shown = snapshot.disruptions.slice(0, compact ? 2 : 5);
  const more = snapshot.disruptions.length - shown.length;
  return (
    <section className={`bw-snapshot${compact ? " bw-snapshot--compact" : ""}`} aria-labelledby="bw-snapshot-title">
      <h2 id="bw-snapshot-title" className="bw-snapshot__title">
        {tr("ui.trafficSnapshot.titre")}
      </h2>
      <SnapshotStamp at={snapshot.at} />
      <p className="bw-snapshot__counts">{counts.join(" · ")}</p>
      {!compact && snapshot.underway.length ? (
        <ul className="bw-snapshot__list">
          {snapshot.underway.map((c) => (
            <li key={c.id}>
              {c.arrivalAt
                ? `${crossingText(c)}, ${tr("ui.trafficSnapshot.arriveePrevue", {
                    day: formatShortDay(c.arrivalAt, c.arrivalZone),
                    time: formatTime(c.arrivalAt, c.arrivalZone),
                  })}`
                : crossingText(c)}
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="bw-snapshot__next">
        {snapshot.nextToAlgeria ? (
          <div>
            <dt>{tr("ui.trafficSnapshot.prochainVers")}</dt>
            <dd>{crossingText(snapshot.nextToAlgeria)}</dd>
          </div>
        ) : null}
        {snapshot.nextFromAlgeria ? (
          <div>
            <dt>{tr("ui.trafficSnapshot.prochainDepuis")}</dt>
            <dd>{crossingText(snapshot.nextFromAlgeria)}</dd>
          </div>
        ) : null}
      </dl>
      <h3 className="bw-snapshot__subtitle">{tr("ui.trafficSnapshot.perturbations")}</h3>
      {shown.length ? (
        <ul className="bw-snapshot__list">
          {shown.map((d) => (
            <li key={d.id}>
              {`${crossingText(d)} — `}
              <b>{disruptionLabel(d)}</b>
            </li>
          ))}
          {more > 0 ? <li>{tr("ui.trafficSnapshot.etAutres", { n: more, s: plural(more) })}</li> : null}
        </ul>
      ) : (
        <p>{tr("ui.trafficSnapshot.aucunePerturbation")}</p>
      )}
      {compact ? (
        <Link to="/horaires" className="bw-snapshot__more">
          {tr("ui.trafficSnapshot.voirDetail")}
        </Link>
      ) : (
        <p className="bw-snapshot__note">{tr("ui.trafficSnapshot.avertissement")}</p>
      )}
    </section>
  );
}
