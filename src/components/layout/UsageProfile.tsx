import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/lib/i18n";
import { useVoyageTrip } from "@/lib/ferry/voyageTrip";
import { describeVisit, displayMode, track } from "@/lib/usage";

const DAY = 86_400_000;

/** Ancienneté du compte en tranches : utile pour comparer nouveaux et fidèles, sans désigner personne. */
function accountAge(createdAt: string | undefined): string | null {
  const created = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(created)) return null;
  const days = (Date.now() - created) / DAY;
  if (days < 1) return "moins d'un jour";
  if (days < 7) return "moins d'une semaine";
  if (days < 30) return "moins d'un mois";
  return "plus d'un mois";
}

/**
 * Décrit la visite à Umami (inscrit ou visiteur, appli ou navigateur, langue, traversée suivie)
 * et note chaque connexion réussie. Rien n'est affiché.
 */
export function UsageProfile() {
  const { session, loading } = useAuth();
  const { locale } = useLocale();
  const { trip, ready } = useVoyageTrip();
  const user = session?.user;
  const previousUser = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (loading || !ready) return;
    describeVisit({
      compte: user ? "inscrit" : "visiteur",
      anciennete: user ? accountAge(user.created_at) : null,
      appli: displayMode(),
      langue: locale,
      voyage: trip ? "suivi" : "aucun",
    });
  }, [loading, ready, user, locale, trip]);

  // Une connexion pendant la visite (pas la session retrouvée à l'ouverture).
  useEffect(() => {
    if (loading) return;
    const id = user?.id ?? null;
    if (previousUser.current === null && id) {
      const provider = String(user?.app_metadata?.["provider"] ?? "email");
      track("connexion-reussie", provider, {
        nouveau_compte: accountAge(user?.created_at) === "moins d'un jour",
      });
    }
    previousUser.current = id;
  }, [loading, user]);

  return null;
}
