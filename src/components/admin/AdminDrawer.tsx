import type { ReactNode } from "react";
import { Plus, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Panneau latéral d'édition, le même dans toutes les rubriques de l'admin :
 * la liste reste visible à gauche, le formulaire s'ouvre à droite.
 */
export function AdminDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bw-admin-drawer flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className={description ? undefined : "sr-only"}>
            {description ?? title}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Barre au-dessus d'une liste : recherche, nombre d'éléments, bouton « Nouveau ». */
export function AdminListToolbar({
  search,
  onSearch,
  placeholder,
  count,
  total,
  onCreate,
  createLabel,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  count: number;
  total: number;
  onCreate?: () => void;
  createLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="bw-admin-toolbar">
      <label className="bw-admin-toolbar__search">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </label>
      {children}
      <span className="bw-admin-toolbar__count">
        {count === total ? `${total} élément${total > 1 ? "s" : ""}` : `${count} sur ${total}`}
      </span>
      {onCreate ? (
        <button type="button" className="bw-admin-toolbar__create" onClick={onCreate}>
          <Plus className="size-4" aria-hidden />
          {createLabel ?? "Nouveau"}
        </button>
      ) : null}
    </div>
  );
}

/** Recherche sans accents ni majuscules. */
export const matches = (search: string, ...values: (string | null | undefined)[]) => {
  const clean = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLocaleLowerCase("fr");
  const needle = clean(search.trim());
  return !needle || clean(values.filter(Boolean).join(" ")).includes(needle);
};
