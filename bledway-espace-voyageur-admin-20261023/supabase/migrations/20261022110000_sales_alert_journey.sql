-- Conserver le parcours associé à une demande d'alerte sur une liaison simulée.
ALTER TABLE public.sales_alerts
  ADD COLUMN IF NOT EXISTS journey_context jsonb;

ALTER TABLE public.sales_alerts
  ADD CONSTRAINT sales_alerts_journey_context_object
  CHECK (journey_context IS NULL OR jsonb_typeof(journey_context) = 'object');
