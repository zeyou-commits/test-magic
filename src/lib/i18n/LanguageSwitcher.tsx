import { Globe } from "lucide-react";
import { ENABLED_LOCALES, LOCALES, type Locale } from "./config";
import { useLocale, useT } from "./I18nProvider";

/** Nom court de la langue proposée, dans cette langue : « عربي » sur le site en français, « FR » en arabe. */
const SHORT: Record<Locale, string> = { fr: "FR", ar: "عربي", en: "EN" };

/**
 * Bouton de la barre du haut : un seul toucher pour passer à l'autre langue ouverte. Le choix est
 * enregistré et passe avant la langue du téléphone.
 */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const target = ENABLED_LOCALES.find((code) => code !== locale);
  if (!target || ENABLED_LOCALES.length < 2) return null;
  const label = t("language.switchTo", { lang: t(`language.${target}`) });
  return (
    <button
      type="button"
      onClick={() => setLocale(target)}
      className={`bw-lang-toggle ${className}`}
      lang={target}
      aria-label={label}
      title={label}
    >
      <Globe size={16} aria-hidden="true" />
      <span>{SHORT[target]}</span>
    </button>
  );
}

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
