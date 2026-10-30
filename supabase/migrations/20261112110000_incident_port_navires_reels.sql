-- BledWay · Port où un navire est immobilisé, et navires réels qui portaient encore l'étiquette de démonstration.
ALTER TABLE public.bw_vessel_incidents
  ADD COLUMN IF NOT EXISTS location_port_id uuid REFERENCES public.ports(id) ON DELETE SET NULL;
UPDATE public.vessels SET is_demo = false
WHERE is_demo AND name IN ('Tariq Ibn Ziyad','Danielle Casanova','El Djazaïr II','Badji Mokhtar III','Hypatia de Alejandría');
NOTIFY pgrst, 'reload schema';
