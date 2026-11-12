import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  ENABLED_LOCALES,
  STORAGE_KEY,
  dirOf,
  pickLocale,
  type Locale,
} from "./config";
import { translate, type TranslateVars } from "./translate";
import type { MessageKey } from "./messages/fr";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

// Sans fournisseur (tests, composant isolé), tout s'affiche en français.
const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, setLocale: () => {} });

function readSaved(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Le serveur rend toujours la page en français ; la langue du téléphone n'est appliquée qu'une
 * fois la page affichée, pour ne jamais casser l'hydratation. Avec le seul français ouvert, rien ne change.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    if (ENABLED_LOCALES.length < 2) return;
    const next = pickLocale(navigator.languages, readSaved());
    if (next !== DEFAULT_LOCALE) setLocaleState(next);
  }, []);

  useEffect(() => {
    if (locale === DEFAULT_LOCALE && document.documentElement.lang === DEFAULT_LOCALE) return;
    const root = document.documentElement;
    root.lang = locale;
    if (dirOf(locale) === "rtl") root.dir = "rtl";
    else root.removeAttribute("dir");
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!ENABLED_LOCALES.includes(next)) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Navigation privée : le choix vaut pour cette visite seulement.
    }
    setLocaleState(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale() {
  return useContext(I18nContext);
}

/** t("nav.map") → « Carte » (ou sa traduction dans la langue du visiteur). */
export function useT() {
  const { locale } = useContext(I18nContext);
  return useCallback(
    (key: MessageKey, vars?: TranslateVars) => translate(locale, key, vars),
    [locale],
  );
}
