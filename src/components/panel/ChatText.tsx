import { useQuery } from "@tanstack/react-query";
import { CabasImg } from "@/components/CabasImg";
import { moodsQuery, type MoodRow } from "@/lib/community/travellers";
import { chatParts, emoteBank, emoteDictionary } from "@/lib/ferry/chatEmotes";

function useActiveMoods(): MoodRow[] {
  const moods = useQuery(moodsQuery).data;
  return (moods ?? []).filter((mood) => mood.active && mood.image);
}

/** Le panneau : les humeurs de l'admin d'abord, puis tous les autres cabas du site. */
export function useChatEmotes() {
  return emoteBank(useActiveMoods());
}

/** Un message : le texte, avec les cabas de la banque à la place de leurs codes. */
export function ChatText({ body, size = 26 }: { body: string; size?: number }) {
  const parts = chatParts(body, emoteDictionary(useActiveMoods()));
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
