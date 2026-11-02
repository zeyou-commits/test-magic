// Les émoticônes du site s'écrivent :code: dans le message et s'affichent en image.
export type EmoteRef = { code: string; label: string; image: string };
export type ChatPart =
  { type: "text"; text: string } | { type: "emote"; code: string; label: string; image: string };

export const emoteToken = (code: string) => `:${code}:`;

/** Un code inconnu (humeur retirée de la banque) reste affiché tel quel. */
export function chatParts(body: string, emotes: EmoteRef[]): ChatPart[] {
  const byCode = new Map(emotes.map((emote) => [emote.code, emote]));
  const parts: ChatPart[] = [];
  let text = "";
  for (const piece of body.split(/(:[a-z0-9_]+:)/)) {
    const emote = /^:[a-z0-9_]+:$/.test(piece) ? byCode.get(piece.slice(1, -1)) : undefined;
    if (emote) {
      if (text) parts.push({ type: "text", text });
      text = "";
      parts.push({ type: "emote", code: emote.code, label: emote.label, image: emote.image });
    } else text += piece;
  }
  if (text) parts.push({ type: "text", text });
  return parts;
}
