-- Lecture seule. À exécuter dans le SQL Editor du projet BledWay après les deux migrations.
SELECT
  to_regclass('public.bw_entity_reviews') IS NOT NULL AS table_avis_presente,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='bw_report_place_guard' AND NOT tgisinternal) AS protection_ports_active,
  to_regprocedure('public.bw_submit_entity_review(text,uuid,jsonb)') IS NOT NULL AS envoi_avis_present,
  to_regprocedure('public.bw_moderate_entity_review(uuid,text)') IS NOT NULL AS moderation_presente;

SELECT
  has_table_privilege('anon','public.bw_entity_reviews','SELECT') AS lecture_brute_anonyme,
  has_table_privilege('authenticated','public.bw_entity_reviews','INSERT') AS insertion_directe_connectee,
  has_table_privilege('authenticated','public.bw_entity_reviews','UPDATE') AS modification_directe_connectee,
  has_function_privilege('anon','public.bw_entity_review_feed(text,uuid)','EXECUTE') AS notes_publiques_lisibles,
  has_function_privilege('anon','public.bw_submit_entity_review(text,uuid,jsonb)','EXECUTE') AS depot_anonyme;
-- Résultat attendu : false, false, false, true, false.

SELECT relrowsecurity AS droits_par_ligne_actifs FROM pg_class WHERE oid='public.bw_entity_reviews'::regclass;
-- Résultat attendu : true.

SELECT status,count(*) FROM public.bw_entity_reviews GROUP BY status;
-- Une liste vide est normale avant le premier avis guidé.
