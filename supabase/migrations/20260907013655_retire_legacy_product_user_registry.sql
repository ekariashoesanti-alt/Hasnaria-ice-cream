drop trigger if exists trg_sync_legacy_roster_to_profile on public.products;

delete from public.products
where name like 'HASNARIA_USER|%';

drop function if exists private.sync_legacy_roster_to_profile();

drop policy if exists products_insert_authorized on public.products;
create policy products_insert_authorized
on public.products
for insert
to authenticated
with check (
  (select private.same_brand(brand_id))
  and (select private.has_role(array['owner','head_store','pic']::text[]))
);

alter table public.products
  drop constraint if exists products_no_legacy_user_registry_check;
alter table public.products
  add constraint products_no_legacy_user_registry_check
  check (coalesce(name, '') not like 'HASNARIA_USER|%');
