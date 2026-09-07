create or replace function private.ignore_retired_legacy_user_registry_write()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
begin
  if coalesce(new.name,'') like 'HASNARIA_USER|%' then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function private.ignore_retired_legacy_user_registry_write() from public, anon, authenticated;

drop trigger if exists trg_ignore_retired_legacy_user_registry_write on public.products;
create trigger trg_ignore_retired_legacy_user_registry_write
before insert on public.products
for each row
execute function private.ignore_retired_legacy_user_registry_write();
