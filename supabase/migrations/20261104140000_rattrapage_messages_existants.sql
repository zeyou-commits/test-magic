-- BledWay · Rattrapage aussi pour les messages de l'équipe créés avant la mise à jour du 27/10/2026.
-- Ils n'avaient pas de date de validité : les nouveaux abonnés ne les recevaient donc jamais.
-- On leur donne la même durée que les nouveaux messages (traversée : 2 h après le départ ;
-- port un jour : fin du jour ; bateau, ligne, port : 48 h ; port fermé : 7 jours ; tout le monde : jamais).
-- Ne touche que les messages créés avant le dépôt du 27/10/2026 à 14 h 14 (heure de Paris), pour
-- respecter ceux où l'admin a ensuite décoché « Envoyer aussi à ceux qui suivront ».
-- Prérequis : script 20261104130000_rattrapage_notifications.sql. Peut être relancé.
BEGIN;

UPDATE public.bw_admin_messages m
SET valid_until = CASE
    WHEN m.audience->>'kind' = 'departure' THEN (
      SELECT d.departure_at + interval '2 hours' FROM public.departures d
      WHERE d.id = (m.audience->>'departureId')::uuid)
    WHEN m.audience->>'kind' = 'port_day' THEN ((m.audience->>'date')::date + 1)::timestamp AT TIME ZONE 'Europe/Paris'
    WHEN m.template = 'port_closed' THEN coalesce(m.sent_at, m.scheduled_at) + interval '7 days'
    ELSE coalesce(m.sent_at, m.scheduled_at) + interval '48 hours'
  END,
  updated_at = now()
WHERE m.valid_until IS NULL
  AND m.status IN ('scheduled', 'sending', 'sent')
  AND m.audience->>'kind' <> 'all'
  AND m.created_at < timestamptz '2026-10-27 14:14:52+01';

NOTIFY pgrst, 'reload schema';
COMMIT;
