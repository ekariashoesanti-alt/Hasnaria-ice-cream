-- Configure designated Owner bootstrap and preserve developer Super Admin authority.

create or replace function public.bootstrap_user_profile()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_auth_email text;
begin
  if new.id = auth.uid() then
    select lower(u.email)
      into v_auth_email
    from auth.users u
    where u.id = new.id;

    new.email := v_auth_email;
    new.brand_id := 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid;
    new.status := 'active';
    new.role := case
      when v_auth_email = 'ekariashoesanti@yahoo.com' then 'owner'
      else 'pending'
    end;
  end if;
  return new;
end;
$$;

drop policy if exists users_insert_own_profile on public.user_profiles;
create policy users_insert_own_profile
on public.user_profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and status = 'active'
  and brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  and role in ('pending','owner')
);

update public.user_profiles p
set role='owner',
    status='active',
    brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid,
    is_super_admin=true,
    updated_at=now()
from auth.users u
where p.id=u.id
  and lower(u.email)='harisnu@gmail.com';
