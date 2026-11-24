import { Globe } from "lucide-react";
import { ENABLED_LOCALES, LOCALES, type Locale } from "./config";
import { useLocale, useT } from "./I18nProvider";

/**
 * Choix de la langue, toujours visible (menu ☰ et pied de page). Les langues dont la traduction
 * n'est pas encore prête apparaissent grisées « bientôt » : on ne bascule jamais vers une langue
 * qui afficherait du français mal orienté.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <label className={`bw-lang-switch inline-flex items-center gap-2 text-sm ${className}`}>
      <Globe size={16} aria-hidden="true" />
      <span>{t("language.label")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t("language.label")}
        className="rounded-md border bg-background px-2 py-1 text-sm text-foreground"
      >
        {LOCALES.map((code) => {
          const open = ENABLED_LOCALES.includes(code);
          return (
            <option key={code} value={code} lang={code} disabled={!open}>
              {open ? t(`language.${code}`) : `${t(`language.${code}`)} · ${t("language.soon")}`}
            </option>
          );
        })}
      </select>
    </label>
  );
}
