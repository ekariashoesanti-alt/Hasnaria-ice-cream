-- P0: Lock multi-brand authority boundaries (Hasnaria vs NGODENG).
-- Super Admin may operate across brands. Normal Owner is restricted to own brand.
-- Self-promotion to Super Admin, self role/status/brand changes, and removal of
-- the last active Super Admin are blocked at the database layer.

begin;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and status = 'active'
      and is_super_admin = true
  );
$$;

revoke execute on function private.is_super_admin() from public;
grant execute on function private.is_super_admin() to authenticated;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and status = 'active'
      and role = 'owner'
  );
$$;

create or replace function private.same_brand(p_brand uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin()
      or (
        exists (
          select 1
          from public.user_profiles
          where id = auth.uid()
            and status = 'active'
        )
        and private.my_brand_id() is not distinct from p_brand
      );
$$;

drop policy if exists brand_read_own_brand on public.brands;
create policy brand_read_own_brand
on public.brands
for select to authenticated
using (
  id = (select private.my_brand_id())
  or (select private.is_super_admin())
);

drop policy if exists owner_delete_brands on public.brands;
create policy owner_delete_brands
on public.brands
for delete to authenticated
using ((select private.is_super_admin()));

drop policy if exists owner_insert_brands on public.brands;
create policy owner_insert_brands
on public.brands
for insert to authenticated
with check ((select private.is_super_admin()));

drop policy if exists owner_update_brands on public.brands;
create policy owner_update_brands
on public.brands
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    id = (select private.my_brand_id())
    and (select private.is_owner())
  )
)
with check (
  (select private.is_super_admin())
  or (
    id = (select private.my_brand_id())
    and (select private.is_owner())
  )
);

drop policy if exists profiles_read_own_or_owner on public.user_profiles;
create policy profiles_read_own_or_owner
on public.user_profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select private.is_super_admin())
  or (
    brand_id = (select private.my_brand_id())
    and (select private.is_owner())
  )
);

drop policy if exists profiles_update_own_or_owner on public.user_profiles;
create policy profiles_update_own_or_owner
on public.user_profiles
for update to authenticated
using (
  id = (select auth.uid())
  or (select private.is_super_admin())
  or (
    brand_id = (select private.my_brand_id())
    and (select private.is_owner())
  )
)
with check (
  id = (select auth.uid())
  or (select private.is_super_admin())
  or (
    brand_id = (select private.my_brand_id())
    and (select private.is_owner())
  )
);

create or replace function private.guard_profile_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if auth.uid() <> old.id and not private.is_super_admin() then
    if new.is_super_admin is distinct from old.is_super_admin
       or new.brand_id is distinct from old.brand_id then
      raise exception 'Only an active Super Admin may change Super Admin status or brand assignment';
    end if;
  elsif auth.uid() = old.id and not private.is_super_admin() then
    if new.is_super_admin is distinct from old.is_super_admin
       or new.brand_id is distinct from old.brand_id
       or new.role is distinct from old.role
       or new.status is distinct from old.status then
      raise exception 'Users cannot change their own authority, role, status, or brand';
    end if;
  end if;

  if old.is_super_admin = true
     and old.status = 'active'
     and (
       new.is_super_admin is distinct from true
       or new.status is distinct from 'active'
     )
     and not exists (
       select 1
       from public.user_profiles p
       where p.id <> old.id
         and p.is_super_admin = true
         and p.status = 'active'
     ) then
    raise exception 'Cannot remove or deactivate the last active Super Admin';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_profile_authority() from public, anon, authenticated;

drop trigger if exists trg_guard_profile_authority on public.user_profiles;
create trigger trg_guard_profile_authority
before update on public.user_profiles
for each row
execute function private.guard_profile_authority();

commit;
