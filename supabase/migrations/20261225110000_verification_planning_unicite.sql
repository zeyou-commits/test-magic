-- Correctif du 06/11/2026 : l'unicité « une proposition par article, type, champ, traversée, navire »
-- bloquait le 2e retrait du jour (la proposition est détachée de la traversée avant sa suppression)
-- et limitait les ajouts à un seul par jour (aucune traversée rattachée avant validation).
-- Ajouts et retraits sont déjà dédoublonnés par bw_schedule_propose (liaison + date, ou traversée).
DROP INDEX IF EXISTS public.bw_watch_proposals_once;
CREATE UNIQUE INDEX bw_watch_proposals_once ON public.bw_watch_proposals
  USING btree (item_id, kind, COALESCE(field, ''::text),
               COALESCE(departure_id, '00000000-0000-0000-0000-000000000000'::uuid),
               COALESCE(vessel_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE kind NOT IN ('new_departure', 'remove_departure');
