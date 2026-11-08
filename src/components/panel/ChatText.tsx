import { useQuery } from "@tanstack/react-query";
import { CabasImg } from "@/components/CabasImg";
import { moodsQuery, type MoodRow } from "@/lib/community/travellers";
import { chatParts, emoteBank, emoteDictionary } from "@/lib/ferry/chatEmotes";
import { MENTION_PATTERN } from "@/lib/ferry/chat";
import { avatarsQuery } from "@/lib/community/avatars";

function useActiveMoods(): MoodRow[] {
  const moods = useQuery(moodsQuery).data;
  return (moods ?? []).filter((mood) => mood.active && mood.image);
}

/** Le panneau : les humeurs de l'admin d'abord, puis tous les autres cabas du site. */
export function useChatEmotes() {
  return emoteBank(useActiveMoods());
}

/** Un message : le texte, avec les cabas de la banque à la place de leurs codes et les @mentions. */
export function ChatText({
  body,
  size = 26,
  mentions,
  myHandle,
}: {
  body: string;
  size?: number;
  /** Identifiant → pseudo des personnes mentionnées. */
  mentions?: Record<string, string> | undefined;
  myHandle?: string | undefined;
}) {
  // Toute la bibliothèque (retirées comprises, pour les anciens messages), puis les humeurs et les
  // codes historiques, qui l'emportent en cas de code identique.
  const library = useQuery(avatarsQuery).data?.rows ?? [];
  const dictionary = [
    ...library.map((row) => ({ code: row.id, label: row.label, image: row.image })),
    ...emoteDictionary(useActiveMoods()),
  ];
  // Une mention inconnue (compte supprimé) reste discrète : « @voyageur ».
  const pieces = body.split(new RegExp(MENTION_PATTERN.source));
  if (pieces.length > 1)
    return (
      <>
        {pieces.map((piece, index) =>
          index % 2 ? (
            <b key={index} className="bw-mention" data-me={piece === myHandle || undefined}>
              @{mentions?.[piece] ?? "voyageur"}
            </b>
          ) : piece ? (
            <ChatText key={index} body={piece} size={size} />
          ) : null,
        )}
      </>
    );
  const parts = chatParts(body, dictionary);
  const alone =
    parts.length > 0 && parts.every((part) => part.type === "emote" || !part.text.trim());
  return (
    <>
      {parts.map((part, index) =>
        part.type === "text" ? (
          <span key={index}>{part.text}</span>
        ) : (
          <CabasImg
            key={index}
            className="bw-chat-emote"
            src={part.image}
            alt={part.label}
            title={part.label}
            width={alone ? size * 2.2 : size}
            height={alone ? size * 2.2 : size}
            loading="lazy"
          />
        ),
      )}
    </>
  );
}
