import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Award } from "lucide-react";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { currentLocale, tr } from "@/lib/i18n";
import { VIGIE_LEVELS } from "../../../supabase/functions/_shared/reportTemplate";

// Fonction du script « signalements_retour_recompenses » (27/11/2026), absente des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export const VIGIE_CODES: readonly string[] = VIGIE_LEVELS.map((level) => level.code);

/** Nom du palier Vigie dans la langue affichée (« Vigie confirmée », « حارس متمرّس »…). */
export function vigieName(code: string) {
  const level = VIGIE_LEVELS.find((item) => item.code === code);
  if (!level) return null;
  const locale = currentLocale();
  return locale === "ar" || locale === "en" ? level.label[locale] : level.label.fr;
}

/** « 3 fiches corrigées », au singulier ou au pluriel. */
export function fixesText(fixes: number) {
  return tr(fixes > 1 ? "ui.profileHost.fichesCorrigees" : "ui.profileHost.ficheCorrigee", {
    n: fixes,
  });
}

type Reward = { fixes: number; level: { code: string } | null };

/**
 * Compte → Contributions : le badge Vigie du voyageur, ses fiches corrigées et le palier suivant.
 * Chaque signalement que l'équipe marque « Traité » compte (paliers à 1, 5, 15 et 50).
 */
export function VigieProgress({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["my", "report-reward", userId],
    queryFn: async (): Promise<Reward | null> => {
      const { data, error } = await supabase.rpc("bw_my_report_reward");
      if (error) return null;
      return data as Reward | null;
    },
  });
  if (!data) return null;
  const fixes = data.fixes ?? 0;
  const next = VIGIE_LEVELS.find((level) => level.at > fixes) ?? null;
  const name = data.level ? vigieName(data.level.code) : null;
  return (
    <div className="bw-vigie" data-level={data.level?.code ?? "none"}>
      <span className="bw-vigie__icon" aria-hidden>
        <Award className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {name ?? tr("ui.pageCompte.vigieTitre")}
          {fixes ? <span className="bw-vigie__count">{fixes}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {fixes
            ? tr(fixes > 1 ? "ui.pageCompte.vigiePlusieurs" : "ui.pageCompte.vigieUne", {
                n: fixes,
              })
            : tr("ui.pageCompte.vigieAucun")}
          {fixes
            ? ` · ${
                next
                  ? tr("ui.pageCompte.vigieSuivant", {
                      n: next.at - fixes,
                      badge: vigieName(next.code) ?? next.code,
                    })
                  : tr("ui.pageCompte.vigieMax")
              }`
            : ""}
        </p>
      </div>
    </div>
  );
}
