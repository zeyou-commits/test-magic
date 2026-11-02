import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { upcomingDeparturesQuery } from "@/lib/ferry/queries";
import type { Selection } from "@/lib/ferry/types";
import { enterRoom } from "@/lib/ferry/chat";
import { chatFeedQuery } from "./LiveRoom";
import { RoomPicker } from "./RoomPicker";
import { AuthorAvatar, type ChatAuthor } from "./StaffChat";
import { chatDemoQuery } from "@/lib/ferry/chatDemo";

const supabase = typedSupabase as unknown as SupabaseClient;

type RecentMessage = {
  id: string;
  /** Message d'exemple pour le lancement, tant que les salons sont calmes. */
  demo?: boolean;
  kind: "crossing" | "port";
  room: string;
  body: string;
  created_at: string;
  label: string | null;
  author: ChatAuthor;
};

/** Les derniers messages publics des salons (2 h), pour donner envie d'y entrer. */
const recentQuery = {
  queryKey: ["bw-chat", "recent"],
  queryFn: async (): Promise<RecentMessage[]> => {
    const { data, error } = await supabase.rpc("bw_chat_recent", { p_limit: 8 });
    if (error) return [];
    return (data as RecentMessage[]) ?? [];
  },
  refetchInterval: 30_000,
  retry: false,
};

/**
 * Messages d'exemple affichés au lancement, tant qu'il y a moins de 3 vrais messages récents.
 * Ils sont marqués « Exemple » et ouvrent le choix d'une traversée, jamais un faux salon.
 * L'équipe les gère dans l'admin ; ceux-ci ne servent que si la liste n'est pas disponible.
 */
const DEMO_MESSAGES: { pseudo: string; label: string; body: string; avatar?: string }[] = [
  { pseudo: "Nadia", label: "Marseille → Alger", body: "On est déjà dans la file, ça avance doucement mais ça avance !" },
  { pseudo: "Karim", label: "Alicante → Oran", body: "Quelqu'un sait si le restaurant à bord est ouvert ce soir ?" },
  { pseudo: "Samia", label: "Port de Sète", body: "Parking plein côté gare maritime, prévoyez de l'avance." },
  { pseudo: "Yacine", label: "Valence → Alger", body: "Mer calme pour l'instant, les enfants dorment enfin 😄" },
  { pseudo: "Lina", label: "Barcelone → Oran", body: "Contrôles rapides ce matin, 20 minutes à peine." },
];
const DEMO_AVATARS = ["maman", "papa", "fille_bled", "jeune_degrade", "tata_houria"];
const demoMessages = (
  list: { pseudo: string; label: string; body: string; avatar?: string }[],
): RecentMessage[] =>
  list.map((message, index) => ({
    id: `demo-${index}`,
    demo: true,
    kind: "crossing",
    room: "",
    body: message.body,
    created_at: new Date().toISOString(),
    label: message.label,
    author: {
      handle: `demo${index}`,
      pseudo: message.pseudo,
      avatar: message.avatar ?? DEMO_AVATARS[index % DEMO_AVATARS.length],
      color: "#2f7d5b",
      mood: null,
    } as unknown as ChatAuthor,
  }));

const DISMISS_KEY = "bledway:chat-preview-dismissed";
const ROTATE_MS = 6_000;

/** Le début du message, sans couper un émoji en deux. */
const shortBody = (text: string) => {
  const chars = Array.from(text.replace(/:[a-z0-9_]+:/g, "").trim());
  return chars.length > 70 ? `${chars.slice(0, 70).join("")}…` : chars.join("");
};

/** Raccourci des salons, à côté de Signaler : mon salon, ou le choix d'une traversée. */
export function MessagesFab({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const { user } = useAuth();
  const { trip } = useMyTrip();
  const [open, setOpen] = useState(false);
  const upcoming = useQuery(upcomingDeparturesQuery()).data ?? [];
  const room = useQuery({
    ...chatFeedQuery("crossing", trip?.departure.id ?? "", user?.id),
    refetchInterval: 60_000,
  }).data;
  const count = room?.messages.length ?? 0;
  const real = useQuery(recentQuery).data ?? [];
  // Au lancement, des exemples complètent l'aperçu ; les vrais messages passent toujours devant.
  const managed = useQuery(chatDemoQuery).data;
  const demos = managed ? managed.filter((message) => message.active) : DEMO_MESSAGES;
  const messages = real.length >= 3 ? real : [...real, ...demoMessages(demos)];
  // Tous les 3 messages, une bulle invite à raconter son propre voyage.
  const recent: (RecentMessage | "invite")[] = messages.flatMap((message, position) =>
    (position + 1) % 3 === 0 ? [message, "invite" as const] : [message],
  );
  if (messages.length && recent.at(-1) !== "invite") recent.push("invite");
  // L'aperçu défile d'un message à l'autre ; fermé, il ne revient pas de la visite.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (recent.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => value + 1), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [recent.length]);
  const shown = recent.length ? recent[index % recent.length] : undefined;
  const openMine = () => {
    if (!trip) {
      setOpen(true);
      return;
    }
    onSelect({ type: "departure", id: trip.departure.id });
    enterRoom("crossing", trip.departure.id);
  };
  const openMessage = (message: RecentMessage) => {
    if (message.demo) {
      setOpen(true);
      return;
    }
    if (message.kind === "crossing") onSelect({ type: "departure", id: message.room });
    else onSelect({ type: "port", id: message.room });
    enterRoom(message.kind, message.room);
  };
  return (
    <div className="bw-messages">
      <button
        type="button"
        className="bw-messages-fab"
        aria-label={count ? `Salons, ${count} messages` : "Salons"}
        onClick={openMine}
      >
        <MessagesSquare size={22} aria-hidden />
        <span>Salons</span>
        {count ? <b>{count > 99 ? "99+" : count}</b> : null}
      </button>
      {shown && !dismissed ? (
        <div className="bw-messages-preview" aria-live="polite">
          {shown === "invite" ? (
            <button
              key={`invite-${index}`}
              type="button"
              className="bw-messages-preview__bubble"
              data-invite
              onClick={openMine}
            >
              <span className="bw-messages-preview__invite-icon" aria-hidden>
                <MessagesSquare size={15} />
              </span>
              <span>
                <small>À vous</small>
                <strong>
                  {trip
                    ? "Et vous, ça se passe comment ? Racontez-le dans votre salon"
                    : "Vous voyagez bientôt ? Rejoignez le salon de votre traversée"}
                </strong>
              </span>
            </button>
          ) : (
            <button
              key={shown.id}
              type="button"
              className="bw-messages-preview__bubble"
              onClick={() => openMessage(shown)}
            >
              <AuthorAvatar author={shown.author} size={26} />
              <span>
                <small>
                    {/* Le prénom d'abord ; un exemple le dit discrètement, en fin de ligne. */}
                  {shown.demo ? null : <i aria-hidden />} {shown.author.pseudo}
                  {shown.label ? ` · ${shown.label}` : ""}
                  {shown.demo ? <em title="Message d'illustration au lancement">illustration</em> : null}
                </small>
                <strong>{shortBody(shown.body) || "…"}</strong>
              </span>
            </button>
          )}
          <button
            type="button"
            className="bw-messages-preview__close"
            aria-label="Masquer l'aperçu des salons"
            onClick={() => {
              setDismissed(true);
              try {
                sessionStorage.setItem(DISMISS_KEY, "1");
              } catch {
                /* facultatif */
              }
            }}
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      ) : null}
      <RoomPicker
        departures={upcoming.slice(0, 60)}
        onSelect={onSelect}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
