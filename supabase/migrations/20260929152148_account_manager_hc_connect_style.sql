create table if not exists public.account_access_registry (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  email text not null,
  full_name text not null,
  access_role text not null default 'user' check (access_role in ('super_admin','owner','user')),
  status text not null default 'pending_activation' check (status in ('active','pending_activation','disabled')),
  auth_user_id uuid null references auth.users(id) on delete set null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_access_registry_brand_email_uq
  on public.account_access_registry (brand_id, lower(email));
create index if not exists account_access_registry_auth_user_idx
  on public.account_access_registry (auth_user_id)
  where auth_user_id is not null;

alter table public.account_access_registry enable row level security;
revoke all on table public.account_access_registry from public, anon, authenticated;

insert into public.account_access_registry (
  brand_id,email,full_name,access_role,status,auth_user_id,created_by
)
select p.brand_id, lower(coalesce(u.email,p.email)), coalesce(nullif(p.full_name,''),'Harisnu Kurniawan'),
       'super_admin','active',p.id,p.id
from public.user_profiles p
join auth.users u on u.id=p.id
where p.is_super_admin is true
  and lower(coalesce(u.email,p.email,''))='harisnu@gmail.com'
  and p.brand_id is not null
on conflict (brand_id, lower(email)) do update
set full_name=excluded.full_name,
    access_role='super_admin',
    status='active',
    auth_user_id=excluded.auth_user_id,
    updated_at=now();

insert into public.account_access_registry (
  brand_id,email,full_name,access_role,status,auth_user_id,created_by
)
select p.brand_id,
       'ekariashoesanti@yahoo.com',
       'Ekaria Shoesanti',
       'owner',
       case when u.id is null then 'pending_activation' else 'active' end,
       u.id,
       p.id
from public.user_profiles p
left join auth.users u on lower(u.email)='ekariashoesanti@yahoo.com'
where p.is_super_admin is true
  and lower(coalesce(p.email,''))='harisnu@gmail.com'
  and p.brand_id is not null
limit 1
on conflict (brand_id, lower(email)) do update
set full_name='Ekaria Shoesanti',
    access_role='owner',
    status=case when excluded.auth_user_id is null then 'pending_activation' else 'active' end,
    auth_user_id=excluded.auth_user_id,
    updated_at=now();

create or replace function private.account_manager_list_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid;
  v_role text;
  v_is_super boolean;
  v_accounts jsonb;
begin
  select p.brand_id,p.role,p.is_super_admin
    into v_brand,v_role,v_is_super
  from public.user_profiles p
  where p.id=auth.uid() and p.status='active';

  if v_brand is null or not (coalesce(v_is_super,false) or v_role='owner') then
    raise exception 'Owner access required';
  end if;

  with registry_rows as (
    select
      r.email,
      r.full_name,
      r.access_role,
      case
        when r.auth_user_id is null then 'pending_activation'
        when p.status='disabled' or r.status='disabled' then 'disabled'
        else 'active'
      end as status,
      r.auth_user_id,
      au.last_sign_in_at,
      coalesce(p.is_super_admin,false) as is_super_admin,
      coalesce(p.role,case when r.access_role in ('owner','super_admin') then 'owner' else 'pending' end) as profile_role,
      r.created_at
    from public.account_access_registry r
    left join auth.users au on au.id=r.auth_user_id
    left join public.user_profiles p on p.id=r.auth_user_id
    where r.brand_id=v_brand
  ), profile_only as (
    select
      lower(coalesce(au.email,p.email,'')) as email,
      coalesce(nullif(p.full_name,''),nullif(p.display_name,''),split_part(coalesce(au.email,p.email,''),'@',1)) as full_name,
      case when p.is_super_admin then 'super_admin' when p.role='owner' then 'owner' else 'user' end as access_role,
      p.status,
      p.id as auth_user_id,
      au.last_sign_in_at,
      p.is_super_admin,
      p.role as profile_role,
      p.created_at
    from public.user_profiles p
    left join auth.users au on au.id=p.id
    where p.brand_id=v_brand
      and not exists (
        select 1 from public.account_access_registry r
        where r.brand_id=v_brand and r.auth_user_id=p.id
      )
  ), all_rows as (
    select * from registry_rows
    union all
    select * from profile_only
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'email',email,
      'full_name',full_name,
      'access_role',access_role,
      'access_label',case access_role when 'super_admin' then 'SUPER ADMIN' when 'owner' then 'OWNER' else 'USER' end,
      'status',status,
      'auth_user_id',auth_user_id,
      'last_sign_in_at',last_sign_in_at,
      'is_super_admin',is_super_admin,
      'profile_role',profile_role,
      'locked',lower(email)='harisnu@gmail.com'
    ) order by case access_role when 'super_admin' then 0 when 'owner' then 1 else 2 end, full_name),'[]'::jsonb)
    into v_accounts
  from all_rows;

  return jsonb_build_object(
    'can_manage',coalesce(v_is_super,false),
    'self_access',case when coalesce(v_is_super,false) then 'SUPER ADMIN' when v_role='owner' then 'OWNER' else upper(coalesce(v_role,'USER')) end,
    'accounts',v_accounts
  );
end;
$$;

revoke all on function private.account_manager_list_v1() from public, anon;
grant execute on function private.account_manager_list_v1() to authenticated;

create or replace function public.account_manager_list_v1()
returns jsonb
language sql
security invoker
set search_path=''
as $$ select private.account_manager_list_v1(); $$;
revoke all on function public.account_manager_list_v1() from public, anon;
grant execute on function public.account_manager_list_v1() to authenticated;

create or replace function private.account_manager_upsert_v1(
  p_email text,
  p_full_name text,
  p_access_role text,
  p_status text default 'pending_activation'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid;
  v_actor uuid:=auth.uid();
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_name text:=btrim(coalesce(p_full_name,''));
  v_access text:=lower(btrim(coalesce(p_access_role,'')));
  v_status text:=lower(btrim(coalesce(p_status,'pending_activation')));
  v_target uuid;
  v_profile_role text;
  v_before jsonb;
  v_after jsonb;
begin
  select p.brand_id into v_brand
  from public.user_profiles p
  where p.id=v_actor and p.status='active' and p.is_super_admin is true;
  if v_brand is null then raise exception 'Super Admin access required'; end if;

  if v_email='' or position('@' in v_email)<2 then raise exception 'Email akun tidak valid'; end if;
  if v_name='' then raise exception 'Nama akun wajib diisi'; end if;
  if v_access not in ('owner','user') then raise exception 'Akses hanya OWNER atau USER'; end if;
  if v_status not in ('active','pending_activation','disabled') then raise exception 'Status akun tidak valid'; end if;

  if v_email='harisnu@gmail.com' then
    v_access:='super_admin';
    v_status:='active';
    v_name:='Harisnu Kurniawan';
  end if;

  select to_jsonb(r) into v_before
  from public.account_access_registry r
  where r.brand_id=v_brand and lower(r.email)=v_email;

  select u.id into v_target from auth.users u where lower(u.email)=v_email limit 1;
  if v_target is null and v_status='active' then v_status:='pending_activation'; end if;

  insert into public.account_access_registry(
    brand_id,email,full_name,access_role,status,auth_user_id,created_by
  ) values (
    v_brand,v_email,v_name,v_access,v_status,v_target,v_actor
  )
  on conflict (brand_id,lower(email)) do update
  set full_name=excluded.full_name,
      access_role=excluded.access_role,
      status=excluded.status,
      auth_user_id=coalesce(excluded.auth_user_id,public.account_access_registry.auth_user_id),
      updated_at=now();

  if v_target is not null then
    v_profile_role:=case when v_access in ('owner','super_admin') then 'owner' else 'pending' end;
    insert into public.user_profiles(id,email,full_name,display_name,role,status,brand_id,is_super_admin)
    values(
      v_target,v_email,v_name,
      case when v_profile_role='owner' then 'owner::'||v_name else v_name end,
      v_profile_role,
      case when v_status='disabled' then 'disabled' else 'active' end,
      v_brand,
      v_access='super_admin' and v_email='harisnu@gmail.com'
    )
    on conflict (id) do update
    set email=excluded.email,
        full_name=excluded.full_name,
        display_name=excluded.display_name,
        role=excluded.role,
        status=excluded.status,
        brand_id=excluded.brand_id,
        is_super_admin=excluded.is_super_admin,
        updated_at=now();
  end if;

  select to_jsonb(r) into v_after
  from public.account_access_registry r
  where r.brand_id=v_brand and lower(r.email)=v_email;

  perform private.write_audit_log(
    v_brand,null,'account_access_registry',null,'UPSERT',v_actor,
    v_before,v_after,'Pengaturan Akun',jsonb_build_object('source','account_manager_hc_connect_style')
  );

  return private.account_manager_list_v1();
end;
$$;

revoke all on function private.account_manager_upsert_v1(text,text,text,text) from public, anon;
grant execute on function private.account_manager_upsert_v1(text,text,text,text) to authenticated;

create or replace function public.account_manager_upsert_v1(
  p_email text,
  p_full_name text,
  p_access_role text,
  p_status text default 'pending_activation'
)
returns jsonb
language sql
security invoker
set search_path=''
as $$ select private.account_manager_upsert_v1(p_email,p_full_name,p_access_role,p_status); $$;
revoke all on function public.account_manager_upsert_v1(text,text,text,text) from public, anon;
grant execute on function public.account_manager_upsert_v1(text,text,text,text) to authenticated;

create or replace function public.bootstrap_user_profile()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_auth_email text;
  v_default_brand uuid;
  v_registry public.account_access_registry%rowtype;
begin
  if new.id=auth.uid() then
    select lower(u.email) into v_auth_email from auth.users u where u.id=new.id;
    select p.brand_id into v_default_brand
    from public.user_profiles p
    where p.is_super_admin is true and p.status='active' and p.brand_id is not null
    order by p.created_at asc limit 1;

    select r.* into v_registry
    from public.account_access_registry r
    where lower(r.email)=v_auth_email
      and r.brand_id=coalesce(new.brand_id,v_default_brand,r.brand_id)
    order by r.created_at asc limit 1;

    new.email:=v_auth_email;
    new.brand_id:=coalesce(v_registry.brand_id,new.brand_id,v_default_brand);
    new.status:=case when v_registry.id is not null and v_registry.status='disabled' then 'disabled' else 'active' end;
    new.role:=case when v_registry.id is not null and v_registry.access_role in ('owner','super_admin') then 'owner' else 'pending' end;
    new.is_super_admin:=coalesce(v_registry.access_role='super_admin' and v_auth_email='harisnu@gmail.com',false);
    if v_registry.id is not null then
      new.full_name:=coalesce(nullif(new.full_name,''),v_registry.full_name);
      update public.account_access_registry
      set auth_user_id=new.id,
          status=case when status='disabled' then 'disabled' else 'active' end,
          updated_at=now()
      where id=v_registry.id;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.bootstrap_user_profile() from public, anon, authenticated;
