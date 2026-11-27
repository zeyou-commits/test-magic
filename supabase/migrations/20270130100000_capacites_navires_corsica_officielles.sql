-- Capacités des navires CORSICA linea alignées sur les fiches officielles de l'armateur
-- (corsicalinea.com/a-bord/nos-ferries/…, consultées le 27/11/2026).
-- La base affichait d'autres chiffres que les dossiers du site (src/content/vessels.ts) :
--   Danielle Casanova : 700 voitures en base, 650 publiées (« 650 voitures & 1 800 ml »)
--   Jean Nicoli       : 1 510 passagers en base, 1 600 publiés
--   Méditerranée      : 2 772 passagers en base, 2 800 publiés
-- Les autres valeurs de ces trois navires (année, garage du Nicoli et du Méditerranée) concordent déjà.

update public.vessels set car_capacity = 650
  where slug = 'danielle-casanova' and car_capacity is distinct from 650;

update public.vessels set passenger_capacity = 1600
  where slug = 'jean-nicoli' and passenger_capacity is distinct from 1600;

update public.vessels set passenger_capacity = 2800
  where slug = 'mediterranee' and passenger_capacity is distinct from 2800;
