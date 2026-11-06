-- Photos de salon : seules les photos contrôlées par le serveur sont publiées.
--
-- Depuis cette version, le téléphone dépose la photo de salon dans « bledway-photos-attente » ;
-- le serveur la vérifie (contenu explicite) puis la copie dans « bledway-photos/salons/… » avec
-- la clé de service, qui ne passe pas par ces règles.
--
-- Ces politiques sont RESTRICTIVES : elles s'ajoutent aux règles existantes sans les remplacer.
-- Plus personne ne peut écrire directement dans « salons/ » depuis l'application, ni remplacer
-- une photo déjà publiée. Le reste (photos validées par l'équipe dans « valides/ », suppression
-- de ses propres photos) ne change pas.
--
-- À exécuter APRÈS le déploiement du code qui passe par le serveur : sinon l'envoi de photos
-- dans les salons échoue jusqu'au déploiement.

drop policy if exists "bw_salons_photos_serveur_insert" on storage.objects;
create policy "bw_salons_photos_serveur_insert"
  on storage.objects
  as restrictive
  for insert
  to anon, authenticated
  with check (not (bucket_id = 'bledway-photos' and name like 'salons/%'));

drop policy if exists "bw_salons_photos_serveur_update" on storage.objects;
create policy "bw_salons_photos_serveur_update"
  on storage.objects
  as restrictive
  for update
  to anon, authenticated
  using (not (bucket_id = 'bledway-photos' and name like 'salons/%'))
  with check (not (bucket_id = 'bledway-photos' and name like 'salons/%'));
