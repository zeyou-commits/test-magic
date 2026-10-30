// Présentation d'une notification selon sa nature : même règle dans la cloche et sur le téléphone.
export type NoticeKind = "alert" | "warning" | "trip" | "community" | "info";

/** Gravité d'abord (lue dans le titre : les messages de l'équipe sont libres), puis l'origine. */
export function noticeKind(eventKey: string | null | undefined, title: string): NoticeKind {
  if (/immobilis|annul[ée]/i.test(title)) return "alert";
  if (/retard|perturb|ferm[ée]|nouvel horaire|horaire modifi/i.test(title)) return "warning";
  const origin = (eventKey ?? "").split(":")[0];
  if (origin === "port-access") return "warning";
  if (origin === "departure" || origin === "voyage-update") return "trip";
  if (
    ["signal", "review", "thanks", "alert-feedback", "help-new", "help-reply"].includes(
      origin ?? "",
    )
  )
    return "community";
  return "info";
}

/** Le lien d'une notification amène à sa fiche, avec le message affiché en tête. */
export function noticeHref(url: string, noticeId: string) {
  return url.startsWith("/?") && url.includes("select=")
    ? `${url}&notice=${encodeURIComponent(noticeId)}`
    : url;
}

export const noticeRank = (kind: NoticeKind) => (kind === "alert" ? 2 : kind === "warning" ? 1 : 0);
