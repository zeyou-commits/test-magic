import { useEffect, useState } from "react";
import { BellRing, Check, ChevronDown, CircleCheck, Hourglass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { longDay, type CompanyCalendar } from "@/lib/companion/salesCalendar";

const shortDay = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Les dates cherchées dépassent le calendrier commercial d'au moins une compagnie : on le dit,
 * compagnie par compagnie, on explique ce qu'est le calendrier théorique (étiquette « Estimé »),
 * et on propose d'être prévenu de l'ouverture des ventes des compagnies choisies.
 */
export function SalesCalendarNote({
  calendars,
  date,
  returnDate,
  fromLabel,
  toLabel,
  fromIds = [],
  toIds = [],
  defaultOpen = false,
}: {
  calendars: CompanyCalendar[];
  date: string;
  returnDate?: string | null;
  fromLabel?: string | null;
  toLabel?: string | null;
  /** Ports cherchés : l'envoi quotidien vérifie l'ouverture des ventes sur ces liaisons. */
  fromIds?: string[];
  toIds?: string[];
  /** Déplié d'office : quand il explique à lui seul une liste vide. */
  defaultOpen?: boolean;
}) {
  const waiting = calendars.filter((item) => !item.coversDates);
  const { user } = useAuth();
  const [picked, setPicked] = useState<string[]>(() => waiting.map((item) => item.companyId));
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const waitingKey = waiting.map((item) => item.companyId).join(",");
  // Une ligne sous les départs ; le détail par compagnie et l'alerte s'ouvrent au clic.
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    setPicked(waitingKey ? waitingKey.split(",") : []);
    setState("idle");
  }, [waitingKey, date, returnDate]);
  if (!waiting.length) return null;

  const anyEstimated = calendars.some((item) => item.estimatedUntil);
  const last = [date, returnDate].filter(Boolean).sort().at(-1)!;
  const submit = async () => {
    if (!user?.email || !picked.length) return;
    setState("sending");
    const chosen = calendars.filter((item) => picked.includes(item.companyId));
    const { error } = await supabase.from("sales_alerts").insert({
      email: user.email,
      from_label: fromLabel ?? null,
      to_label: toLabel ?? null,
      period_label: `Ouverture des ventes : ${chosen.map((item) => item.name).join(", ")}`,
      period_start: date,
      period_end: returnDate ?? date,
      consent: true,
      journey_context: {
        kind: "sales-opening",
        userId: user.id,
        fromIds,
        toIds,
        roundTrip: Boolean(returnDate),
        // La recherche à rouvrir depuis l'alerte (chemin du site seulement).
        path: `${window.location.pathname}${window.location.search}`.slice(0, 500),
        companies: chosen.map((item) => ({
          id: item.companyId,
          name: item.name,
          commercialUntil: item.commercialUntil,
        })),
      },
    } as never);
    setState(error ? "error" : "done");
  };

  const names = waiting.map((item) => item.name);
  const who =
    names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(" et ");
  const bodyId = `salescal-${date}`;
  return (
    <section
      className="bw-salescal"
      data-open={open || undefined}
      aria-label="Calendriers de vente des compagnies"
    >
      <button
        type="button"
        className="bw-salescal__bar"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <Hourglass className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <b>{who}</b> : pas encore en vente pour le {longDay(last)}
        </span>
        <span className="bw-salescal__cta">
          {open ? "Masquer" : "Me prévenir"}
          <ChevronDown
            className={`size-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </span>
      </button>
      {open ? (
      <div id={bodyId} className="bw-salescal__body">
      <p className="bw-salescal__text">
        Les compagnies ouvrent leurs ventes par saison.{" "}
        {anyEstimated
          ? "Au-delà, BledWay montre un calendrier théorique : la rotation habituelle des navires, marquée « Estimé ». Les jours et les heures peuvent changer à l'ouverture des ventes."
          : "Au-delà de ces dates, aucun départ n'est encore publié : rien n'est perdu, la saison n'est simplement pas ouverte."}
      </p>
      <ul className="bw-salescal__list">
        {calendars.map((item) => (
          <li key={item.companyId} data-ok={item.coversDates || undefined}>
            {item.coversDates ? (
              <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <Hourglass className="size-4 shrink-0 text-warning-foreground" aria-hidden />
            )}
            <span className="min-w-0 flex-1">
              <b>{item.name}</b>
              <small>
                {item.commercialUntil
                  ? `En vente jusqu'au ${shortDay(item.commercialUntil)}`
                  : "Rien en vente sur ces ports"}
                {item.estimatedUntil ? ` · estimé jusqu'au ${shortDay(item.estimatedUntil)}` : ""}
              </small>
            </span>
            <em>{item.coversDates ? "En vente" : "Pas encore"}</em>
          </li>
        ))}
      </ul>
      {state === "done" ? (
        <p className="bw-salescal__done">
          <Check className="size-4" aria-hidden /> C'est noté : on te prévient dès que{" "}
          {picked.length > 1 ? "ces compagnies ouvrent" : "cette compagnie ouvre"} ses ventes pour tes dates.
        </p>
      ) : (
        <div className="bw-salescal__form">
          <p className="bw-salescal__ask">
            <BellRing className="size-4 shrink-0" aria-hidden /> Être prévenu à l'ouverture des ventes de :
          </p>
          <div className="bw-salescal__chips">
            {waiting.map((item) => {
              const on = picked.includes(item.companyId);
              return (
                <button
                  key={item.companyId}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((list) =>
                      on ? list.filter((id) => id !== item.companyId) : [...list, item.companyId],
                    )
                  }
                >
                  {on ? "✓ " : ""}
                  {item.name}
                </button>
              );
            })}
          </div>
          {user ? (
            <button
              type="button"
              onClick={submit}
              disabled={!picked.length || state === "sending"}
              className="h-10 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {state === "sending" ? "…" : "Me prévenir"}
            </button>
          ) : (
            <>
              <a
                href={`/auth?mode=signup&next=${encodeURIComponent(
                  typeof window === "undefined" ? "/" : window.location.pathname + window.location.search,
                )}`}
                className="grid h-10 place-items-center rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground"
              >
                Créer mon compte gratuit pour être prévenu
              </a>
              <p className="text-[11px] text-muted-foreground">
                Avec un compte, l'alerte arrive sur ton téléphone et par e-mail, et tes recherches te
                suivent. Tu reviens ici juste après.
              </p>
            </>
          )}
          {state === "error" ? (
            <p className="text-xs font-semibold text-destructive">
              L'envoi n'a pas marché. Réessaie dans un instant.
            </p>
          ) : null}
        </div>
      )}
      </div>
      ) : null}
    </section>
  );
}
