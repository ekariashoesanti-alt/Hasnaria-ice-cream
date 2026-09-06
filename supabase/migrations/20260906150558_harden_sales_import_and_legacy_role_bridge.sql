-- Hasnaria P0 hardening: normalized sales can preserve raw Majoo items,
-- legacy roster writes synchronize into user_profiles, and trigger helpers are not public RPCs.

alter table public.products
  add column if not exists sku text;

create unique index if not exists products_brand_sku_uidx
  on public.products (brand_id, lower(btrim(sku)))
  where nullif(btrim(sku), '') is not null;

alter table public.sale_items
  alter column product_id drop not null;

alter table public.sale_items
  add column if not exists item_name text,
  add column if not exists external_sku text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sale_items_product_or_name_check'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_product_or_name_check
      check (product_id is not null or nullif(btrim(item_name), '') is not null);
  end if;
end $$;

create index if not exists idx_sale_items_external_sku
  on public.sale_items (external_sku)
  where nullif(btrim(external_sku), '') is not null;

create index if not exists inventory_purchase_log_inventory_item_idx
  on public.inventory_purchase_log (inventory_item_id);

create index if not exists sales_import_batches_created_by_idx
  on public.sales_import_batches (created_by);

drop index if exists public.inventory_items_brand_period_name_idx;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.sync_legacy_roster_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parts text[];
  legacy_uid uuid;
  legacy_role text;
  legacy_email text;
  legacy_name text;
  caller_uid uuid := auth.uid();
  caller_is_owner boolean := coalesce(public.is_owner(), false);
begin
  if new.name not like 'HASNARIA_USER|%' then
    if tg_op = 'UPDATE' and old.name like 'HASNARIA_USER|%' then
      raise exception 'Legacy roster rows cannot be repurposed; change authority through user_profiles';
    end if;
    return new;
  end if;

  parts := string_to_array(new.name, '|');
  if coalesce(array_length(parts, 1), 0) < 5 then
    raise exception 'Malformed legacy roster record';
  end if;

  begin
    legacy_uid := parts[2]::uuid;
  exception when others then
    raise exception 'Malformed legacy roster user id';
  end;

  legacy_role := parts[3];
  legacy_email := nullif(parts[4], '');
  legacy_name := nullif(array_to_string(parts[5:array_length(parts, 1)], '|'), '');

  if legacy_role not in ('pending','owner','head_store','marketing','pic','pelaksana') then
    raise exception 'Invalid Hasnaria role';
  end if;

  if new.brand_id is distinct from 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid then
    raise exception 'Legacy roster must stay on the Hasnaria brand';
  end if;

  if caller_is_owner then
    insert into public.user_profiles
      (id, brand_id, role, status, email, full_name, display_name, updated_at)
    values
      (legacy_uid, new.brand_id, legacy_role, 'active', legacy_email, legacy_name,
       legacy_role || '::' || coalesce(legacy_name, legacy_email, legacy_uid::text), now())
    on conflict (id) do update set
      brand_id = excluded.brand_id,
      role = excluded.role,
      status = excluded.status,
      email = coalesce(excluded.email, public.user_profiles.email),
      full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
      display_name = excluded.display_name,
      updated_at = now();
  else
    if caller_uid is null or legacy_uid is distinct from caller_uid or legacy_role <> 'pending' then
      raise exception 'Only Owner may change roster authority';
    end if;

    insert into public.user_profiles
      (id, brand_id, role, status, email, full_name, display_name, updated_at)
    values
      (legacy_uid, new.brand_id, 'pending', 'active', legacy_email, legacy_name,
       'pending::' || coalesce(legacy_name, legacy_email, legacy_uid::text), now())
    on conflict (id) do update set
      email = coalesce(excluded.email, public.user_profiles.email),
      full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
      display_name = excluded.display_name,
      updated_at = now();
  end if;

  return new;
end;
$$;

revoke execute on function private.sync_legacy_roster_to_profile() from public, anon, authenticated;

drop trigger if exists trg_sync_legacy_roster_to_profile on public.products;
create trigger trg_sync_legacy_roster_to_profile
before insert or update of name, brand_id on public.products
for each row
execute function private.sync_legacy_roster_to_profile();

revoke execute on function public.bootstrap_user_profile() from public, anon, authenticated;
revoke execute on function public.protect_user_profile_authority() from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

drop policy if exists users_read_own_profile on public.user_profiles;
create policy users_read_own_profile
  on public.user_profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists users_update_own_profile on public.user_profiles;
create policy users_update_own_profile
  on public.user_profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists users_insert_own_profile on public.user_profiles;
create policy users_insert_own_profile
  on public.user_profiles for insert to authenticated
  with check (
    (select auth.uid()) = id
    and role = 'pending'
    and status = 'active'
    and brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  );

drop policy if exists products_pending_self_insert on public.products;
create policy products_pending_self_insert
  on public.products for insert to authenticated
  with check (
    brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
    and split_part(name, '|', 1) = 'HASNARIA_USER'
    and split_part(name, '|', 2) = (select auth.uid())::text
    and split_part(name, '|', 3) = 'pending'
  );
