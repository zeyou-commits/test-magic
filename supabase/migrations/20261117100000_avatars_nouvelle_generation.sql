-- Trois nouveaux avatars à essayer. Les profils existants ne changent pas.
ALTER TABLE public.bw_traveller_profiles DROP CONSTRAINT bw_traveller_profiles_avatar_check;
ALTER TABLE public.bw_traveller_profiles ADD CONSTRAINT bw_traveller_profiles_avatar_check
  CHECK (avatar = ANY (ARRAY['jeddi','jedda','papa','maman','lina','ilyes','ammi','amastan','tata_houria','ammi_tayeb','maalem','lalla','jeune_degrade','fille_bled','voiture_504']));
