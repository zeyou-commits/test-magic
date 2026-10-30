-- Carte d'identité des navires : nouveaux champs, chiffres recoupés et source de chaque fiche.
ALTER TABLE public.vessels
  ADD COLUMN IF NOT EXISTS builder text,
  ADD COLUMN IF NOT EXISTS gross_tonnage integer,
  ADD COLUMN IF NOT EXISTS beam_meters double precision,
  ADD COLUMN IF NOT EXISTS deck_count integer,
  ADD COLUMN IF NOT EXISTS cabin_capacity integer,
  ADD COLUMN IF NOT EXISTS seat_capacity integer,
  ADD COLUMN IF NOT EXISTS specs_source_name text,
  ADD COLUMN IF NOT EXISTS specs_source_url text,
  ADD COLUMN IF NOT EXISTS specs_checked_at date;

CREATE TABLE IF NOT EXISTS public.bw_backup_navires_20261116 AS
  SELECT id, to_jsonb(v.*) AS data, now() AS saved_at FROM public.vessels v;
ALTER TABLE public.bw_backup_navires_20261116 ENABLE ROW LEVEL SECURITY;

UPDATE public.vessels v SET
  builder = x.builder,
  build_year = x.build_year,
  gross_tonnage = x.gross_tonnage,
  length_meters = x.length_meters,
  beam_meters = x.beam_meters,
  deck_count = x.deck_count,
  passenger_capacity = x.passengers,
  cabin_capacity = x.cabins,
  car_capacity = x.cars,
  freight_lane_meters = x.lane_meters,
  speed_knots = x.knots,
  specs_source_name = x.source_name,
  specs_source_url = x.source_url,
  specs_checked_at = DATE '2026-10-31'
FROM (VALUES
  ('le-cracovia', 'Navantia Puerto Real, Espagne', 2002, 25028, 181.0, 24.0, 10, 650, 123, 188, 2196.0, 16.7, 'Équipe BledWay', NULL),
  ('tariq-ibn-ziyad', 'Unión Naval de Levante, Espagne', 1995, 21659, 153.3, 25.2, NULL, 1312, NULL, 500, 780.0, 21.1, 'Deltamarin, aFerry', 'https://deltamarin.com/references/ropax_ferry/tariq-ibn-ziyad/'),
  ('tassili-ii', 'IZAR, Espagne', 2004, 20024, 146.6, 24.0, NULL, 1320, NULL, 300, 1200.0, 23.5, 'Deltamarin, aFerry', 'https://deltamarin.com/references/ropax_ferry/tassili-ii/'),
  ('el-djazair-ii', 'IZAR, Espagne', 2005, 20024, 146.6, 24.0, 9, 1440, 209, 300, 1200.0, 23.5, 'Deltamarin, aFerry', 'https://deltamarin.com/references/ropax_ferry/el-djazair-ii/'),
  ('badji-mokhtar-iii', 'Guangzhou Shipyard International, Chine', 2021, 49939, 200.0, 30.0, 12, 1800, 469, 600, 3000.0, 23.8, 'Baird Maritime, aFerry', 'https://www.bairdmaritime.com/work-boat-world/passenger-vessel-world/ro-pax/vessel-review-badji-mokhtar-iii-algerie-ferries-new-luxury-ro-pax-for-mediterranean-sailings/'),
  ('danielle-casanova', 'Fincantieri, Ancône, Italie', 2002, 41447, 176.0, 30.4, 13, 2400, 470, 700, 1000.0, 24.0, 'Fincantieri, aFerry', 'https://www.fincantieri.com/en/products-and-services/ferry/danielle-casanova/'),
  ('jean-nicoli', 'Fosen Mek Verksteder, Norvège', 1998, 30010, 200.65, 25.8, 9, 1510, 198, 600, 2200.0, 25.0, 'Wikipédia, aFerry', 'https://en.wikipedia.org/wiki/MS_Jean_Nicoli_(1997)'),
  ('mediterranee', 'Chantiers de l''Atlantique, France', 1989, 30985, 165.0, 27.0, 13, 2772, 496, 690, 1000.0, 24.0, 'aFerry', 'https://www.aferry.com/ships/f02jti/mediterranee/'),
  ('gnv-auriga', 'Fincantieri, Castellammare di Stabia, Italie', 2005, 39798, 214.0, 26.4, 10, 2908, 319, 1100, 1900.0, 28.0, 'Wikipédia, aFerry', 'https://en.wikipedia.org/wiki/MS_Sharden'),
  ('fantastic', 'Nuovi Cantieri Apuania, Italie', 1996, 35222, 188.0, 28.0, 10, 2033, 373, 760, 1700.0, 23.2, 'CruiseMapper, aFerry', 'https://www.cruisemapper.com/ships/GNV-Fantastic-ferry-2032'),
  ('gnv-cristal', 'Schichau Seebeckwerft, Bremerhaven, Allemagne', 1989, 33336, 161.25, 29.0, 12, 2000, 357, 575, 1600.0, 21.1, 'Wikipédia, aFerry', 'https://www.aferry.com/ships/krqp0q/gnv-cristal/'),
  ('rosalind-franklin', 'Chantiers de l''Atlantique, Saint-Nazaire, France', 1989, 24534, 151.2, 26.0, 10, 2056, 376, 580, NULL, 20.5, 'Wikipédia, aFerry', 'https://en.wikipedia.org/wiki/MV_Rosalind_Franklin'),
  ('hypatia-de-alejandria', 'Cantiere Navale Visentini, Porto Viro, Italie', 2019, 26500, 186.0, 25.0, NULL, 880, 121, 608, 2194.0, 23.8, 'aFerry', 'https://www.aferry.com/ships/jsiujt/hypatia-de-alejandria/'),
  ('regina-baltica', 'Wärtsilä, Turku, Finlande', 1980, 18345, 145.0, 25.0, 12, 1675, 505, 350, 850.0, 18.9, 'Wikipédia, aFerry', 'https://en.wikipedia.org/wiki/MS_Regina_Baltica'),
  ('almariya', 'AG Weser Seebeckwerft, Bremerhaven, Allemagne', 1981, 21473, 153.4, 24.2, 10, 2048, 344, 530, 1500.0, 20.0, 'Wikipédia, aFerry', 'https://en.wikipedia.org/wiki/MS_Almariya')
) AS x(slug, builder, build_year, gross_tonnage, length_meters, beam_meters, deck_count, passengers, cabins, cars, lane_meters, knots, source_name, source_url)
WHERE v.slug = x.slug;
