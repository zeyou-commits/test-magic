import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  House,
  Info,
  LogIn,
  Map as MapIcon,
  MessagesSquare,
  Ship,
  UserRound,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthNext } from "@/lib/authReturn";
import { useUnreadNoticeCount } from "@/components/panel/FlashCenter";
import { OPEN_ROOM_PICKER_EVENT } from "@/lib/ferry/chatDemo";
import { goHome, openVoyage, useVoyageTrip } from "@/lib/ferry/voyageTrip";
import { LanguageSwitcher, tr, useT } from "@/lib/i18n";
import {
  familyById,
  familyIsActive,
  menuFamilies,
  MenuItemLink,
  openSearchFromHeader,
  type MenuFamily,
} from "./menu";

type Level = MenuFamily["id"] | "account";

/** Distance du geste vers la droite (px) au-delà de laquelle le volet se ferme. */
const SWIPE_CLOSE = 80;

const familyIcons: Record<MenuFamily["id"], LucideIcon> = {
  prepare: ClipboardList,
  live: MapIcon,
  lines: Waypoints,
  bledway: Info,
};

/**
 * Le menu complet (volet latéral, depuis la droite) : sur tablette par le ☰ de l'en-tête, sur
 * téléphone par le dernier onglet de la barre du bas. Un premier niveau court (une ligne par
 * famille), puis chaque famille dans son sous-niveau, avec un bouton retour.
 * Fermeture : la croix, Échap, le fond assombri ou un glissé vers la droite ; le focus reste dans
 * le volet tant qu'il est ouvert (Radix Dialog).
 */
export function MainMenuSheet({
  triggerClassName,
  label,
  children,
}: {
  triggerClassName: string;
  label: string;
  children: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<Level | null>(null);
  const [drag, setDrag] = useState(0);
  const touch = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef(new Map<Level, HTMLButtonElement>());
  const lastLevel = useRef<Level | null>(null);

  // Chaque ouverture repart du premier niveau.
  useEffect(() => {
    if (!open) {
      setLevel(null);
      setDrag(0);
    }
  }, [open]);

  // Le focus suit le niveau : le bouton retour en entrant, la ligne de la famille en revenant.
  useEffect(() => {
    if (!open) return;
    if (level) backRef.current?.focus({ preventScroll: true });
    else if (lastLevel.current)
      rowRefs.current.get(lastLevel.current)?.focus({ preventScroll: true });
    if (level) lastLevel.current = level;
  }, [level, open]);

  const close = () => setOpen(false);

  const onTouchStart = (event: TouchEvent) => {
    const point = event.touches[0];
    if (!point) return;
    touch.current = { x: point.clientX, y: point.clientY, horizontal: null };
  };
  const onTouchMove = (event: TouchEvent) => {
    const start = touch.current;
    const point = event.touches[0];
    if (!start || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (start.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8)
      start.horizontal = Math.abs(dx) > Math.abs(dy);
    if (start.horizontal) setDrag(Math.max(0, dx));
  };
  const onTouchEnd = () => {
    if (drag > SWIPE_CLOSE) close();
    else setDrag(0);
    touch.current = null;
  };

  const titleKey = level === "account" ? null : level ? familyById(level).titleKey : null;
  const title =
    level === "account"
      ? tr("ui.userMenu.monCompte")
      : titleKey
        ? t(titleKey)
        : t("menu.sheetTitle");

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={triggerClassName} aria-label={label}>
        {children}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="bw-drawer-overlay" />
        <Dialog.Content
          className="bw-menu-sheet bw-drawer"
          data-dragging={drag > 0 || undefined}
          style={drag ? { transform: `translateX(${drag}px)` } : undefined}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="bw-drawer__head">
            {level ? (
              <button
                ref={backRef}
                type="button"
                className="bw-drawer__back"
                aria-label={t("menu.back")}
                onClick={() => setLevel(null)}
              >
                <ChevronLeft size={24} aria-hidden />
              </button>
            ) : null}
            <Dialog.Title className="bw-menu-sheet__title">{title}</Dialog.Title>
            <Dialog.Close className="bw-drawer__close" aria-label={t("menu.close")}>
              <X size={22} aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t("menu.sheetDescription")}</Dialog.Description>

          <div className="bw-drawer__track" data-level={level ? "sub" : "root"}>
            <div className="bw-drawer__panel" inert={level ? true : undefined}>
              <RootLevel
                onOpen={setLevel}
                onNavigate={close}
                rowRef={(id, node) => {
                  if (node) rowRefs.current.set(id, node);
                  else rowRefs.current.delete(id);
                }}
              />
              <LanguageSwitcher className="mt-4" />
            </div>
            <div className="bw-drawer__panel" inert={level ? undefined : true}>
              {level === "account" ? (
                <AccountLevel onNavigate={close} />
              ) : level ? (
                <FamilyLevel family={familyById(level)} onNavigate={close} />
              ) : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Premier niveau : dans l'ordre du voyage, une ligne par famille, le reste en un toucher. */
function RootLevel({
  onOpen,
  onNavigate,
  rowRef,
}: {
  onOpen: (level: Level) => void;
  onNavigate: () => void;
  rowRef: (id: Level, node: HTMLButtonElement | null) => void;
}) {
  const t = useT();
  const { user } = useAuth();
  const authNext = useAuthNext();
  const { trip } = useVoyageTrip();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const prepare = familyById("prepare");

  const openSalons = () => {
    onNavigate();
    if (pathname === "/") window.dispatchEvent(new Event(OPEN_ROOM_PICKER_EVENT));
    else {
      window.sessionStorage.setItem("bledway:open-home-action", "salons");
      void navigate({ to: "/" });
    }
  };

  const familyRow = (family: MenuFamily) => {
    const Icon = familyIcons[family.id];
    return (
      <FamilyRow
        key={family.id}
        icon={<Icon size={18} aria-hidden />}
        ref={(node) => rowRef(family.id, node)}
        label={t(family.titleKey)}
        count={countItems(family)}
        active={familyIsActive(family, pathname)}
        onClick={() => onOpen(family.id)}
      />
    );
  };

  return (
    <div className="bw-drawer__list">
      {prepare.lead ? (
        <MenuItemLink
          item={prepare.lead}
          iconSize={20}
          hint={t(prepare.lead.hintKey)}
          className="bw-menu-link--lead"
          onClick={onNavigate}
        />
      ) : null}

      {familyRow(prepare)}

      <Link
        to="/"
        onClick={() => {
          openSearchFromHeader();
          onNavigate();
        }}
        activeProps={{ className: "" }}
        className="bw-menu-link"
      >
        <CalendarCheck size={18} aria-hidden /> {t("menu.book")}
      </Link>
      {trip ? (
        <Link
          to="/"
          search={{ voyage: 1 } as never}
          onClick={() => {
            openVoyage();
            onNavigate();
          }}
          activeProps={{ className: "" }}
          className="bw-menu-link"
        >
          <Ship size={18} aria-hidden /> {t("nav.myTrip")}
        </Link>
      ) : null}
      <Link
        to="/"
        activeOptions={{ exact: true }}
        onClick={() => {
          goHome();
          onNavigate();
        }}
        className="bw-menu-link"
      >
        <House size={18} aria-hidden /> {t("menu.liveMap")}
      </Link>

      {familyRow(familyById("live"))}

      <button type="button" className="bw-menu-link" onClick={openSalons}>
        <MessagesSquare size={18} aria-hidden /> {t("menu.salons")}
      </button>

      {familyRow(familyById("lines"))}

      {user ? (
        <FamilyRow
          ref={(node) => rowRef("account", node)}
          label={tr("ui.userMenu.monCompte")}
          icon={<UserRound size={18} aria-hidden />}
          active={pathname.startsWith("/compte")}
          onClick={() => onOpen("account")}
        />
      ) : (
        <Link
          to="/auth"
          search={{ next: authNext } as never}
          onClick={onNavigate}
          className="bw-menu-link"
        >
          <LogIn size={18} aria-hidden /> {tr("ui.userMenu.seConnecter")}
        </Link>
      )}

      {menuFamilies
        .filter((family) => !["prepare", "live", "lines"].includes(family.id))
        .map(familyRow)}
    </div>
  );
}

const countItems = (family: MenuFamily) =>
  family.columns.reduce((sum, column) => sum + column.items.length, 0) +
  (family.footer?.length ?? 0);

/** Une famille au premier niveau : un bouton qui ouvre son sous-niveau. */
function FamilyRow({
  ref,
  label,
  count,
  icon,
  active,
  onClick,
}: {
  ref: (node: HTMLButtonElement | null) => void;
  label: string;
  count?: number;
  icon?: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className="bw-menu-link bw-drawer__row"
      data-active={active || undefined}
      aria-haspopup="true"
      onClick={onClick}
    >
      {icon}
      <span className="bw-drawer__row-label">{label}</span>
      {count ? <span className="bw-drawer__count">{count}</span> : null}
      <ChevronRight size={18} aria-hidden className="bw-drawer__chevron" />
    </button>
  );
}

/** Sous-niveau d'une famille : ses colonnes, chacune sous son intitulé, puis ses liens transversaux. */
function FamilyLevel({ family, onNavigate }: { family: MenuFamily; onNavigate: () => void }) {
  const t = useT();
  return (
    <div className="bw-drawer__list">
      {family.lead ? (
        <MenuItemLink
          item={family.lead}
          iconSize={20}
          hint={t(family.lead.hintKey)}
          className="bw-menu-link--lead"
          onClick={onNavigate}
        />
      ) : null}
      {family.columns.map((column, index) => (
        <section
          key={column.titleKey ?? index}
          className="bw-drawer__section"
          aria-label={column.titleKey ? t(column.titleKey) : undefined}
        >
          {column.titleKey ? <p className="bw-menu-group-title">{t(column.titleKey)}</p> : null}
          {column.items.map((item) => (
            <MenuItemLink
              key={`${item.to}-${item.labelKey}`}
              item={item}
              iconSize={18}
              onClick={onNavigate}
            />
          ))}
        </section>
      ))}
      {family.footer?.length ? (
        <section className="bw-drawer__section">
          {family.footer.map((item) => (
            <MenuItemLink
              key={`${item.to}-${item.labelKey}`}
              item={item}
              iconSize={18}
              onClick={onNavigate}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

/** Sous-niveau « Mon compte » : les mêmes entrées que le menu du compte de l'en-tête. */
function AccountLevel({ onNavigate }: { onNavigate: () => void }) {
  const { user, roles, signOut } = useAuth();
  const unread = useUnreadNoticeCount(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const links: { hash?: string; label: string; count?: number | undefined }[] = [
    { label: tr("ui.userMenu.monEspaceVoyageur") },
    { hash: "voyages", label: tr("ui.userMenu.mesNaviresEtTraverseesSuivis") },
    {
      hash: "notifications",
      label: tr("ui.userMenu.mesNotifications"),
      count: unread || undefined,
    },
    { hash: "profil", label: tr("ui.userMenu.monProfil") },
    { hash: "contributions", label: tr("ui.userMenu.mesContributions") },
  ];
  return (
    <div className="bw-drawer__list">
      {links.map((link) => (
        <Link
          key={link.hash ?? "home"}
          to="/compte"
          {...(link.hash ? { hash: link.hash } : {})}
          activeProps={{ className: "" }}
          onClick={onNavigate}
          className="bw-menu-link"
        >
          <span className="bw-drawer__row-label">{link.label}</span>
          {link.count ? <span className="bw-drawer__count">{link.count}</span> : null}
        </Link>
      ))}
      {roles.length ? (
        <Link to="/admin" onClick={onNavigate} className="bw-menu-link">
          {tr("ui.userMenu.backOffice")}
        </Link>
      ) : null}
      <button
        type="button"
        className="bw-menu-link bw-drawer__signout"
        onClick={async () => {
          onNavigate();
          await queryClient.cancelQueries();
          queryClient.clear();
          await signOut();
          void navigate({ to: "/auth", replace: true });
        }}
      >
        {tr("ui.userMenu.seDeconnecter")}
      </button>
    </div>
  );
}
