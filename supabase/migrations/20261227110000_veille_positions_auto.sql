-- Veille « navires muets » : un départ, une arrivée ou une arrivée estimée trouvés sur une page de
-- suivi sont appliqués sans clic (07/11/2026, décision de l'utilisateur) quand :
--   - l'indice correspond au bon port de la traversée (confiance « medium », jamais « low ») ;
--   - la position citée par la source date de moins de 3 heures.
-- Rien d'autre n'est automatique : actualités, annulations et changements de navire restent à valider.
-- Seules les heures « constatées sur le web » changent, jamais l'horaire officiel ; « Annuler la
-- correction » reste disponible dans la Veille.

CREATE OR REPLACE FUNCTION private.bw_watch_crossing_auto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_age integer;
BEGIN
  IF NEW.kind <> 'crossing' OR NEW.status <> 'pending' OR NEW.confidence <> 'medium' THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bw_watch_items i JOIN public.bw_watch_sources s ON s.id = i.source_id
    WHERE i.id = NEW.item_id AND s.url = 'https://www.bledway.com/interne/navires-muets'
  ) THEN RETURN NULL; END IF;
  v_age := nullif(substring(NEW.summary FROM 'Position vue il y a ([0-9]+) min'), '')::integer;
  IF v_age IS NULL OR v_age > 180 THEN RETURN NULL; END IF;
  PERFORM private.bw_schedule_apply(NEW.id);
  UPDATE public.bw_watch_proposals
     SET status = 'approved', applied = true, decided_at = now(),
         decision_note = 'Appliquée automatiquement (position de moins de 3 h)'
   WHERE id = NEW.id;
  RETURN NULL;
EXCEPTION WHEN others THEN
  -- En cas de souci, la proposition reste simplement à valider à la main.
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS bw_watch_crossing_auto ON public.bw_watch_proposals;
CREATE TRIGGER bw_watch_crossing_auto
  AFTER INSERT ON public.bw_watch_proposals
  FOR EACH ROW EXECUTE FUNCTION private.bw_watch_crossing_auto();
