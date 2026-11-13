import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, House, Ship } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { goHome, openVoyage, useVoyageTrip } from "@/lib/ferry/voyageTrip";
import { LanguageSwitcher, useT } from "@/lib/i18n";
import { familyItems, menuFamilies, MenuItemLink, openSearchFromHeader } from "./menu";

/**
 * Le menu complet (volet du bas) : sur tablette par le ☰ de l'en-tête, sur téléphone par le
 * dernier onglet de la barre du bas.
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
  const { trip } = useVoyageTrip();
  return (
    <Sheet>
      <SheetTrigger className={triggerClassName} aria-label={label}>
        {children}
      </SheetTrigger>
      <SheetContent side="bottom" className="bw-menu-sheet">
        <SheetTitle className="bw-menu-sheet__title">{t("menu.sheetTitle")}</SheetTitle>
        <SheetDescription className="sr-only">{t("menu.sheetDescription")}</SheetDescription>
        {/* Tablette : pas de barre du bas, « Réserver » et la carte restent ici. */}
        <div className="bw-menu-sheet__main">
          <SheetClose asChild>
            <Link
              to="/"
              onClick={openSearchFromHeader}
              activeProps={{ className: "" }}
              className="bw-menu-link"
            >
              <CalendarCheck size={16} aria-hidden /> {t("menu.book")}
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link to="/" activeOptions={{ exact: true }} onClick={goHome} className="bw-menu-link">
              <House size={16} aria-hidden /> {t("menu.liveMap")}
            </Link>
          </SheetClose>
          {trip ? (
            <SheetClose asChild>
              <Link
                to="/"
                search={{ voyage: 1 } as never}
                onClick={openVoyage}
                className="bw-menu-link"
              >
                <Ship size={16} aria-hidden /> {t("nav.myTrip")}
              </Link>
            </SheetClose>
          ) : null}
        </div>
        <div className="bw-menu-sheet__groups">
          {menuFamilies.map((family) => (
            <section key={family.id} aria-label={t(family.titleKey)}>
              <p className="bw-menu-group-title">{t(family.titleKey)}</p>
              {familyItems(family).map((item) => (
                <SheetClose asChild key={`${item.to}-${item.labelKey}`}>
                  <MenuItemLink item={item} iconSize={17} />
                </SheetClose>
              ))}
            </section>
          ))}
        </div>
        <LanguageSwitcher className="mt-4" />
      </SheetContent>
    </Sheet>
  );
}
