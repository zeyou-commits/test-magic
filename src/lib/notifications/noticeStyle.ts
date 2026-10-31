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

/** Picto du téléphone : le motif quand il est connu, sinon la nature du message. */
export function noticePicto(eventKey: string | null | undefined, title: string) {
  const origin = (eventKey ?? "").split(":")[0];
  if (origin === "port-access") return /entrée/i.test(title) ? "access-moved" : "access-closed";
  if (origin === "help-new" || origin === "help-reply")
    return /SOS|médical/i.test(title) ? "help-medical" : "help";
  const kind = noticeKind(eventKey, title);
  return kind === "warning" && /retard/i.test(title) ? "delay" : kind;
}

/** Réponses proposées dans la notification. L'élément visé est le dernier segment de sa clé. */
export function noticeReply(eventKey: string | null | undefined) {
  const parts = (eventKey ?? "").split(":");
  const id = parts[parts.length - 1];
  if (!id) return null;
  if (parts[0] === "port-access" || parts[0] === "signal")
    return {
      reply: { target: "alert", id },
      actions: [
        { action: "confirm", title: "Je confirme" },
        { action: "deny", title: "Plus le cas" },
      ],
    };
  if (parts[0] === "help-new")
    return { reply: { target: "help", id }, actions: [{ action: "go", title: "J’y vais" }] };
  return null;
}

/** Le lien d'une notification amène à sa fiche, avec le message affiché en tête. */
export function noticeHref(url: string, noticeId: string) {
  return url.startsWith("/?") && url.includes("select=")
    ? `${url}&notice=${encodeURIComponent(noticeId)}`
    : url;
}

export const noticeRank = (kind: NoticeKind) => (kind === "alert" ? 2 : kind === "warning" ? 1 : 0);
