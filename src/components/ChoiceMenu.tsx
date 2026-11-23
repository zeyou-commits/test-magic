import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ChoiceOption = { value: string; label: string; leading?: ReactNode };

/**
 * Le menu de choix, partout pareil (Réserver, Préparer) : un déclencheur, puis une liste avec une
 * coche devant le choix en cours. `chip` : la pastille de la barre de Réserver ; `field` : un champ
 * de formulaire pleine largeur, comme les champs de saisie de Préparer.
 * `all` ajoute en tête un choix « tous / je ne sais pas » qui vaut `null`.
 */
export function ChoiceMenu({
  label,
  icon,
  value,
  options,
  onChange,
  all,
  variant = "chip",
  className = "",
}: {
  label: string;
  icon: ReactNode;
  value: string | null;
  options: ChoiceOption[];
  onChange: (value: string | null) => void;
  all?: string | undefined;
  variant?: "chip" | "field";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  const shown = current ? current.label : value === null && all && variant === "field" ? all : label;
  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };
  const item = (key: string, on: boolean, lead: ReactNode, text: string, pick: () => void) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={on}
      className="bw-wide-menu__item"
      data-on={on || undefined}
      onClick={pick}
    >
      {lead ? <span className="bw-wide-menu__lead">{lead}</span> : null}
      <span className="truncate">{text}</span>
      {on ? <Check className="ml-auto size-4" aria-hidden /> : null}
    </button>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${variant === "chip" ? "bw-wide-chip" : "bw-choice-field"} ${className}`}
          data-on={Boolean(current) || undefined}
          aria-label={current ? `${label} : ${current.label}` : label}
        >
          <span className="bw-wide-chip__lead">{current?.leading ?? icon}</span>
          <span className="min-w-0 flex-1 truncate text-left">{shown}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className={`bw-wide-menu p-1.5 ${variant === "field" ? "w-[var(--radix-popover-trigger-width)] min-w-[260px]" : "w-[340px]"}`}
      >
        <p className="bw-wide-menu__title">{label}</p>
        <div className="bw-wide-menu__list" role="listbox" aria-label={label}>
          {all
            ? item("__all", !value, variant === "chip" ? icon : null, all, () => choose(null))
            : null}
          {options.map((option) =>
            item(
              option.value,
              option.value === value,
              // En champ, pas d'icône répétée devant chaque choix sans logo propre.
              option.leading ?? (variant === "chip" ? icon : null),
              option.label,
              () => choose(option.value),
            ),
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
