import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bell, Check, Zap } from "lucide-react";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { markFlashSeen, readSeenFlash, relativeAge } from "@/lib/ferry/flash";
import type { Selection } from "@/lib/ferry/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FlashFeed, useFlashCards } from "./FlashFeed";

// Notifications personnelles (table bw_notifications), absentes des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

/** Demande d'ouverture d'une fiche sur la page carte depuis le fil de l'en-tête. */
export const FLASH_SELECT_EVENT = "bledway:flash-select";

type Notice = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  url: string;
};

function useNotices(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-notifications", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Notice[]> => {
      const { data, error } = await supabase
        .from("bw_notifications")
        .select("id,title,body,created_at,read_at,url")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as Notice[];
    },
    refetchInterval: 60_000,
    retry: false,
  });
}

/** Infos déjà vues, synchronisées entre l'icône et le fil. */
function useSeenFlash() {
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const sync = () => setSeen(readSeenFlash());
    sync();
    window.addEventListener("bledway:flash-seen", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("bledway:flash-seen", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return seen;
}

function NoticeList({ userId, notices }: { userId: string; notices: Notice[] }) {
  const queryClient = useQueryClient();
  async function markRead(id: string) {
    const { error } = await supabase
      .from("bw_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    if (!error) await queryClient.invalidateQueries({ queryKey: ["my-notifications", userId] });
  }
  if (!notices.length)
    return (
      <p className="bw-flash-empty">
        Rien de nouveau. Les informations sur vos traversées suivies arriveront ici.
      </p>
    );
  return (
    <ul className="bw-flash-list">
      {notices.slice(0, 15).map((notice) => (
        <li key={notice.id} className="bw-flash-row" data-tone="brand" data-open="true">
          <div className="bw-flash-row__head" role="presentation">
            <span className="bw-flash-row__icon" aria-hidden>
              <Bell size={15} />
            </span>
            <span className="bw-flash-row__text">
              <strong>{notice.title}</strong>
              <small>{relativeAge(notice.created_at)}</small>
            </span>
            {!notice.read_at ? <span className="bw-flash-new" aria-label="Non lue" /> : null}
          </div>
          <div className="bw-flash-row__body">
            <p>{notice.body}</p>
            <div className="bw-flash-footer">
              <span />
              <span className="bw-flash-actions">
                {!notice.read_at ? (
                  <button type="button" onClick={() => void markRead(notice.id)}>
                    <Check size={14} aria-hidden /> Marquer comme lue
                  </button>
                ) : null}
                <a href={notice.url}>Voir</a>
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * En-tête (ordinateur et mobile) : une icône réunit le Flash info et les notifications du compte.
 * La pastille ne compte que les nouveautés ; ouvrir le fil les marque comme vues.
 */
export function HeaderInbox() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { cards, disabled } = useFlashCards();
  const notices = useNotices(user?.id);
  const seen = useSeenFlash();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"flash" | "notices">("flash");
  const unseen = cards.filter((card) => !seen.has(card.key));
  const unread = (notices.data ?? []).filter((notice) => !notice.read_at).length;
  const urgent = unseen.some((card) => card.type === "news" && card.item.kind === "perturbation");
  const count = unseen.length + unread;
  // Ni module Flash info, ni compte : rien à afficher.
  if (disabled && !user) return null;

  const select = (selection: Selection) => {
    setOpen(false);
    // Sur la carte : la page ouvre directement la fiche ; ailleurs, on rejoint la carte sur l'élément.
    if (window.location.pathname === "/")
      window.dispatchEvent(new CustomEvent(FLASH_SELECT_EVENT, { detail: selection }));
    else router.history.push(`/?select=${selection.type}&id=${encodeURIComponent(selection.id)}`);
  };
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // À la fermeture, les infos affichées deviennent « vues » (le point disparaît au prochain passage).
    if (!next && tab === "flash") markFlashSeen(cards.map((card) => card.key));
  };

  const body: ReactNode = (
    <div className="bw-inbox">
      {user ? (
        <div className="bw-inbox-tabs" role="tablist" aria-label="Flash info ou notifications">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "flash"}
            onClick={() => setTab("flash")}
          >
            <Zap size={14} aria-hidden /> Flash info
            {unseen.length ? <span className="bw-flash-count">{unseen.length}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "notices"}
            onClick={() => {
              setTab("notices");
              markFlashSeen(cards.map((card) => card.key));
            }}
          >
            <Bell size={14} aria-hidden /> Mes notifications
            {unread ? <span className="bw-flash-count">{unread}</span> : null}
          </button>
        </div>
      ) : null}
      <div className="bw-inbox-body">
        {tab === "flash" || !user ? (
          <FlashFeed
            hideTitle
            limit={30}
            seen={seen}
            onSelect={select}
            emptyText="Aucune perturbation ni information en cours sur les traversées Europe ↔ Algérie."
          />
        ) : notices.isPending ? (
          <div className="h-24 animate-pulse rounded-xl bg-secondary" />
        ) : notices.isError ? (
          <p className="bw-flash-empty">Les notifications sont momentanément indisponibles.</p>
        ) : (
          <NoticeList userId={user.id} notices={notices.data ?? []} />
        )}
      </div>
      {user && tab === "notices" ? (
        <Link to="/compte" className="bw-inbox-more" onClick={() => setOpen(false)}>
          Mes voyages suivis et préférences
        </Link>
      ) : null}
    </div>
  );

  const trigger = (
    <button
      type="button"
      className="bw-icon-button bw-flash-bell"
      aria-label={`Flash info et notifications${count ? ` : ${count} nouvelle${count > 1 ? "s" : ""}` : ""}`}
      onClick={isMobile ? () => setOpen(true) : undefined}
    >
      <Bell size={20} aria-hidden />
      {count ? (
        <span className="bw-flash-count" data-urgent={urgent}>
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </button>
  );

  if (isMobile)
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="right" className="bw-flash-sheet w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Bell size={18} aria-hidden /> Infos et notifications
              </SheetTitle>
              <SheetDescription>
                Perturbations et actualités Europe ↔ Algérie, et ce que signalent les voyageurs.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">{body}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="bw-inbox-popover">
        <p className="bw-inbox-heading">
          <Bell size={16} aria-hidden /> Infos et notifications
        </p>
        {body}
      </PopoverContent>
    </Popover>
  );
}
