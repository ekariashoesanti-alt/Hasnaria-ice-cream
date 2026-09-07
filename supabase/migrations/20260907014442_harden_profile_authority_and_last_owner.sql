create or replace function public.protect_profile_sensitive()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not public.is_owner() then
    new.role := old.role;
    new.status := old.status;
    new.brand_id := old.brand_id;
    new.is_super_admin := old.is_super_admin;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.protect_user_profile_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not public.is_owner() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.brand_id is distinct from old.brand_id
       or new.is_super_admin is distinct from old.is_super_admin then
      raise exception 'Only Owner may change role, status, brand, or super-admin authority';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_profile_sensitive() from public, anon, authenticated;
revoke execute on function public.protect_user_profile_authority() from public, anon, authenticated;

create or replace function private.guard_last_active_owner()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_removes_owner boolean := false;
begin
  if old.role <> 'owner' or old.status <> 'active' or old.brand_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    v_removes_owner := true;
  else
    v_removes_owner := new.role is distinct from 'owner'
      or new.status is distinct from 'active'
      or new.brand_id is distinct from old.brand_id;
  end if;

  if v_removes_owner and not exists (
    select 1
    from public.user_profiles p
    where p.id <> old.id
      and p.brand_id = old.brand_id
      and p.role = 'owner'
      and p.status = 'active'
  ) then
    raise exception 'Cannot remove or demote the last active Owner for this brand';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function private.guard_last_active_owner() from public, anon, authenticated;

drop trigger if exists trg_guard_last_active_owner on public.user_profiles;
create trigger trg_guard_last_active_owner
before update of role, status, brand_id or delete
on public.user_profiles
for each row
execute function private.guard_last_active_owner();
