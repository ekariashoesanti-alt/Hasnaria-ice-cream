drop policy if exists account_access_registry_no_direct_access on public.account_access_registry;
create policy account_access_registry_no_direct_access
on public.account_access_registry
for all
to authenticated
using (false)
with check (false);
