import { Globe } from "lucide-react";
import { ENABLED_LOCALES, LOCALES, type Locale } from "./config";
import { useLocale, useT } from "./I18nProvider";

/** Nom court de la langue proposée, dans cette langue : « عربي » sur le site en français, « FR » en arabe. */
const SHORT: Record<Locale, string> = { fr: "FR", ar: "عربي", en: "EN" };

/** Drapeaux ronds dessinés (les drapeaux emoji ne s'affichent pas sous Windows). Arabe : Algérie. */
function Flag({ locale }: { locale: Locale }) {
  if (locale === "ar")
    return (
      <svg viewBox="0 0 20 20" className="bw-lang-flag" aria-hidden="true">
        <defs>
          <mask id="bw-flag-dz-crescent">
            <rect width="20" height="20" fill="#fff" />
            <circle cx="11.3" cy="10" r="4.1" fill="#000" />
          </mask>
        </defs>
        <rect width="10" height="20" fill="#006233" />
        <rect x="10" width="10" height="20" fill="#fff" />
        <circle cx="10" cy="10" r="5" fill="#d21034" mask="url(#bw-flag-dz-crescent)" />
        <polygon
          fill="#d21034"
          points="10.6,10 12.06,10.47 12.07,12.0 12.97,10.77 14.42,11.24 13.52,10 14.42,8.76 12.97,9.23 12.07,8.0 12.06,9.53"
        />
      </svg>
    );
  if (locale === "en")
    return (
      <svg viewBox="0 0 20 20" className="bw-lang-flag" aria-hidden="true">
        <rect width="20" height="20" fill="#012169" />
        <path d="M0 0 20 20M20 0 0 20" stroke="#fff" strokeWidth="4" />
        <path d="M10 0v20M0 10h20" stroke="#fff" strokeWidth="6" />
        <path d="M10 0v20M0 10h20" stroke="#c8102e" strokeWidth="3" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" className="bw-lang-flag" aria-hidden="true">
      <rect width="7" height="20" fill="#002395" />
      <rect x="7" width="6" height="20" fill="#fff" />
      <rect x="13" width="7" height="20" fill="#ed2939" />
    </svg>
  );
}

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
      <Flag locale={target} />
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
