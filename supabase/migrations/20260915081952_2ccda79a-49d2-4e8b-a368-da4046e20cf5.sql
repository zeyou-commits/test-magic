drop policy if exists profiles_public_read on public.profiles;

create policy profiles_authenticated_read
on public.profiles
for select
to authenticated
using (true);

revoke select on public.profiles from anon;