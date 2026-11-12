import { ENABLED_LOCALES, type Locale } from "./config";
import { useLocale, useT } from "./I18nProvider";

/** Choix de la langue. Invisible tant qu'une seule langue est ouverte. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  if (ENABLED_LOCALES.length < 2) return null;
  return (
    <label className={`bw-lang-switch inline-flex items-center gap-2 ${className}`}>
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="rounded-md border bg-background px-2 py-1 text-sm"
      >
        {ENABLED_LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {t(`language.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
