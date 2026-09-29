create or replace function private.account_activation_finalize_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_reg public.account_access_registry%rowtype;
  v_role text;
  v_super boolean;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select lower(u.email) into v_email from auth.users u where u.id=v_uid;
  if v_email is null then raise exception 'Auth email not found'; end if;

  select r.* into v_reg
  from public.account_access_registry r
  where lower(r.email)=v_email
  order by r.created_at asc
  limit 1;

  if v_reg.id is null then raise exception 'Akun belum terdaftar oleh Super Admin'; end if;
  if v_reg.status='disabled' then raise exception 'Akun dinonaktifkan'; end if;

  v_super := v_reg.access_role='super_admin' and v_email='harisnu@gmail.com';
  v_role := case when v_reg.access_role in ('owner','super_admin') then 'owner' else 'pending' end;

  insert into public.user_profiles(id,email,full_name,display_name,role,status,brand_id,is_super_admin)
  values(v_uid,v_email,v_reg.full_name,
         case when v_role='owner' then 'owner::'||v_reg.full_name else v_reg.full_name end,
         v_role,'active',v_reg.brand_id,v_super)
  on conflict(id) do update set
    email=excluded.email,
    full_name=excluded.full_name,
    display_name=excluded.display_name,
    role=excluded.role,
    status=excluded.status,
    brand_id=excluded.brand_id,
    is_super_admin=excluded.is_super_admin,
    updated_at=now();

  update public.account_access_registry
  set auth_user_id=v_uid,status='active',updated_at=now()
  where id=v_reg.id;

  return jsonb_build_object('email',v_email,'access_role',v_reg.access_role,'profile_role',v_role,'status','active');
end;
$$;
revoke all on function private.account_activation_finalize_v1() from public, anon;
grant execute on function private.account_activation_finalize_v1() to authenticated;

create or replace function public.account_activation_finalize_v1()
returns jsonb
language sql
security invoker
set search_path=''
as $$ select private.account_activation_finalize_v1(); $$;
revoke all on function public.account_activation_finalize_v1() from public, anon;
grant execute on function public.account_activation_finalize_v1() to authenticated;
