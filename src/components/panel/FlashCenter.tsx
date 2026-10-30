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
import { noticeHref, noticeKind, noticeRank } from "@/lib/notifications/noticeStyle";
import { isDesktopBrowser, isInstalledApp, PhoneInstallCard } from "@/components/layout/PhoneInstallCard";
import { FlashFeed, isCriticalCard, useFlashCards } from "./FlashFeed";
import { noticeLook } from "./NoticeFocus";

// Notifications personnelles (table bw_notifications), absentes des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

/** Demande d'ouverture d'une fiche sur la page carte depuis le fil de l'en-tête. */
export const FLASH_SELECT_EVENT = "bledway:flash-select";
/** Ouvre le fil depuis le bandeau, pour une info qui n'a pas de fiche à elle. */
export const OPEN_INBOX_EVENT = "bledway:open-inbox";

type Notice = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  url: string;
  event_key: string;
};

function useNotices(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-notifications", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Notice[]> => {
      const { data, error } = await supabase
        .from("bw_notifications")
        .select("id,title,body,created_at,read_at,url,event_key")
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
  // Une alerte non lue passe devant le reste ; sinon, du plus récent au plus ancien.
  const rank = (notice: Notice) =>
    notice.read_at ? 0 : noticeRank(noticeKind(notice.event_key, notice.title));
  const ordered = [...notices].sort(
    (a, b) => rank(b) - rank(a) || b.created_at.localeCompare(a.created_at),
  );
  return (
    <ul className="bw-flash-list">
      {ordered.slice(0, 15).map((notice) => {
        const look = noticeLook[noticeKind(notice.event_key, notice.title)];
        const Icon = look.icon;
        return (
          <li key={notice.id} className="bw-flash-row" data-tone={look.tone} data-open="true">
            <a
              className="bw-flash-row__head"
              href={noticeHref(notice.url, notice.id)}
              onClick={() => void markRead(notice.id)}
            >
              <span className="bw-flash-row__icon" aria-hidden>
                <Icon size={15} />
              </span>
              <span className="bw-flash-row__text">
                <strong>{notice.title}</strong>
                <small>
                  <span className="bw-flash-row__kind">{look.label}</span> ·{" "}
                  {relativeAge(notice.created_at)}
                </small>
              </span>
              {!notice.read_at ? <span className="bw-flash-new" aria-label="Non lue" /> : null}
            </a>
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
                  <a href={noticeHref(notice.url, notice.id)}>Voir le détail</a>
                </span>
              </div>
            </div>
          </li>
        );
      })}
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
  const unreadNotices = (notices.data ?? []).filter((notice) => !notice.read_at);
  const unread = unreadNotices.length;
  const isAlertNotice = (notice: Notice) => noticeKind(notice.event_key, notice.title) === "alert";
  const alertNotices = unreadNotices.filter(isAlertNotice).length;
  const alertCards = cards.filter(isCriticalCard);
  // Une alerte grave ne se noie pas dans le compteur : elle a son « ! » tant qu'elle est en cours.
  const hasAlert = alertCards.length + alertNotices > 0;
  const freshAlert = alertNotices > 0 || alertCards.some((card) => !seen.has(card.key));
  const urgent = unseen.some((card) => card.type === "news" && card.item.kind === "perturbation");
  const count =
    unseen.filter((card) => !isCriticalCard(card)).length + unread - alertNotices;
  useEffect(() => {
    const show = () => {
      setTab("flash");
      setOpen(true);
    };
    window.addEventListener(OPEN_INBOX_EVENT, show);
    return () => window.removeEventListener(OPEN_INBOX_EVENT, show);
  }, []);
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
    // Une alerte personnelle non lue, sans alerte générale : on arrive directement dessus.
    if (next) setTab(!alertCards.length && alertNotices > 0 ? "notices" : "flash");
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
            focusAlerts
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
      {open && isDesktopBrowser() && !isInstalledApp() ? (
        <details className="bw-inbox-phone">
          <summary>Recevoir ces alertes sur mon téléphone</summary>
          <PhoneInstallCard text="Scannez avec l’appareil photo pour installer BledWay." />
        </details>
      ) : null}
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
      data-alert={hasAlert || undefined}
      aria-label={`Flash info et notifications${hasAlert ? " : alerte grave en cours" : ""}${count ? ` : ${count} nouvelle${count > 1 ? "s" : ""}` : ""}`}
      onClick={isMobile ? () => onOpenChange(true) : undefined}
    >
      <Bell size={20} aria-hidden />
      {hasAlert ? (
        <span className="bw-flash-alert-badge" data-fresh={freshAlert || undefined} aria-hidden>
          !
        </span>
      ) : null}
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
