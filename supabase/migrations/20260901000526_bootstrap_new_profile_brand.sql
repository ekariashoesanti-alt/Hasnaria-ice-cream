create or replace function public.bootstrap_user_profile()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.id = auth.uid() then
    new.brand_id := 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid;
    new.role := 'pending';
    new.status := 'active';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bootstrap_user_profile on public.user_profiles;
create trigger trg_bootstrap_user_profile before insert on public.user_profiles for each row execute function public.bootstrap_user_profile();
drop policy if exists users_insert_own_profile on public.user_profiles;
create policy users_insert_own_profile on public.user_profiles for insert to authenticated with check (id = auth.uid() and role = 'pending' and status = 'active' and brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid);