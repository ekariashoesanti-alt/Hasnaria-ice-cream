-- HSN-614 Staff mobile PIN portal.
-- Owner provisions staff accounts and assignments; staff then signs in by name + 6-digit PIN.
-- PIN hashes and staff sessions live in the non-exposed private schema.

begin;

insert into public.employees(
  brand_id,outlet_id,employee_no,full_name,job_title,employment_type,status,notes
)
select b.id,o.id,x.employee_no,x.full_name,'Crew','employee','active','Seed mobile employee access 2026-09-26'
from public.brands b
join public.outlets o on o.brand_id=b.id and o.active
cross join (values
  ('EMP-DANIA','Dania'),('EMP-ULYA','Ulya'),('EMP-KARIN','Karin'),('EMP-ARUM','Arum')
) as x(employee_no,full_name)
where lower(btrim(b.name))='hasnaria'
  and lower(btrim(o.code))='main'
  and not exists (
    select 1 from public.employees e
    where e.brand_id=b.id and lower(btrim(e.employee_no))=lower(btrim(x.employee_no))
  );

create table if not exists private.staff_access (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  pin_hash text,
  modules text[] not null default array['absensi']::text[],
  active boolean not null default false,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  pin_updated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_access_modules_check check (modules <@ array['absensi','kasir','gudang']::text[]),
  constraint staff_access_failed_attempts_check check (failed_attempts between 0 and 5)
);
create index if not exists staff_access_brand_active_idx on private.staff_access(brand_id,active);

create table if not exists private.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  token_hash bytea not null unique,
  modules text[] not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now()
);
create index if not exists staff_sessions_employee_idx on private.staff_sessions(employee_id,expires_at desc);
create index if not exists staff_sessions_expiry_idx on private.staff_sessions(expires_at) where revoked_at is null;

revoke all on private.staff_access from public,anon,authenticated;
revoke all on private.staff_sessions from public,anon,authenticated;
grant usage on schema private to anon,authenticated;

create or replace function private.staff_owner_brand()
returns uuid language plpgsql stable security definer set search_path=''
as $$
declare v_brand uuid;
begin
  if auth.uid() is null then raise exception 'Owner login required'; end if;
  select p.brand_id into v_brand from public.user_profiles p
  where p.id=auth.uid() and p.role='owner' and p.status='active' limit 1;
  if v_brand is null then raise exception 'Owner access required'; end if;
  return v_brand;
end;
$$;
revoke execute on function private.staff_owner_brand() from public,anon;
grant execute on function private.staff_owner_brand() to authenticated;

create or replace function private.staff_owner_list()
returns table(employee_id uuid,employee_no text,full_name text,staff_active boolean,pin_set boolean,modules text[],locked_until timestamptz,updated_at timestamptz)
language sql stable security definer set search_path=''
as $$
  with ctx as (select private.staff_owner_brand() as brand_id)
  select e.id,e.employee_no,e.full_name,coalesce(sa.active,false),(sa.pin_hash is not null),
         coalesce(sa.modules,array[]::text[]),sa.locked_until,coalesce(sa.updated_at,e.updated_at)
  from public.employees e join ctx on ctx.brand_id=e.brand_id
  left join private.staff_access sa on sa.employee_id=e.id
  where e.status='active'
  order by lower(e.full_name),e.employee_no;
$$;
revoke execute on function private.staff_owner_list() from public,anon;
grant execute on function private.staff_owner_list() to authenticated;

create or replace function public.staff_owner_list()
returns table(employee_id uuid,employee_no text,full_name text,staff_active boolean,pin_set boolean,modules text[],locked_until timestamptz,updated_at timestamptz)
language sql stable security invoker set search_path=''
as $$ select * from private.staff_owner_list(); $$;
revoke execute on function public.staff_owner_list() from public,anon;
grant execute on function public.staff_owner_list() to authenticated;

create or replace function private.staff_owner_save(p_employee_id uuid,p_full_name text,p_pin text,p_modules text[],p_active boolean)
returns table(employee_id uuid,full_name text,staff_active boolean,pin_set boolean,modules text[])
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid; v_outlet uuid; v_employee public.employees%rowtype; v_modules text[]; v_pin_hash text;
begin
  v_brand:=private.staff_owner_brand();
  v_modules:=coalesce(p_modules,array[]::text[]);
  if nullif(btrim(coalesce(p_full_name,'')),'') is null then raise exception 'Nama pegawai wajib diisi'; end if;
  if exists(select 1 from unnest(v_modules) m where m not in ('absensi','kasir','gudang')) then raise exception 'Penugasan tidak valid'; end if;
  if coalesce(p_active,false) and cardinality(v_modules)=0 then raise exception 'Pilih minimal satu penugasan'; end if;
  if nullif(btrim(coalesce(p_pin,'')),'') is not null then
    if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN harus 6 digit angka'; end if;
    v_pin_hash:=crypt(p_pin,gen_salt('bf',8));
  end if;
  select o.id into v_outlet from public.outlets o
  where o.brand_id=v_brand and o.active
  order by case when lower(btrim(o.code))='main' then 0 else 1 end,o.created_at limit 1;
  if v_outlet is null then raise exception 'Outlet aktif belum tersedia'; end if;

  if p_employee_id is null then
    insert into public.employees(brand_id,outlet_id,employee_no,full_name,job_title,employment_type,status,created_by)
    values(v_brand,v_outlet,'EMP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),btrim(p_full_name),'Crew','employee','active',auth.uid())
    returning * into v_employee;
  else
    select * into v_employee from public.employees e
    where e.id=p_employee_id and e.brand_id=v_brand and e.status='active';
    if not found then raise exception 'Pegawai tidak ditemukan'; end if;
    update public.employees set full_name=btrim(p_full_name),updated_at=now()
    where id=v_employee.id returning * into v_employee;
  end if;

  insert into private.staff_access(employee_id,brand_id,pin_hash,modules,active,failed_attempts,locked_until,pin_updated_at,created_by,updated_by,updated_at)
  values(v_employee.id,v_brand,v_pin_hash,v_modules,coalesce(p_active,false),0,null,case when v_pin_hash is not null then now() else null end,auth.uid(),auth.uid(),now())
  on conflict(employee_id) do update
  set pin_hash=coalesce(excluded.pin_hash,private.staff_access.pin_hash),modules=excluded.modules,active=excluded.active,
      failed_attempts=case when excluded.pin_hash is not null then 0 else private.staff_access.failed_attempts end,
      locked_until=case when excluded.pin_hash is not null then null else private.staff_access.locked_until end,
      pin_updated_at=case when excluded.pin_hash is not null then now() else private.staff_access.pin_updated_at end,
      updated_by=auth.uid(),updated_at=now();

  if coalesce(p_active,false) and not exists(select 1 from private.staff_access sa where sa.employee_id=v_employee.id and sa.pin_hash is not null)
  then raise exception 'Set PIN sebelum mengaktifkan akun staff'; end if;

  return query select e.id,e.full_name,sa.active,(sa.pin_hash is not null),sa.modules
  from public.employees e join private.staff_access sa on sa.employee_id=e.id where e.id=v_employee.id;
end;
$$;
revoke execute on function private.staff_owner_save(uuid,text,text,text[],boolean) from public,anon;
grant execute on function private.staff_owner_save(uuid,text,text,text[],boolean) to authenticated;

create or replace function public.staff_owner_save(p_employee_id uuid default null,p_full_name text default null,p_pin text default null,p_modules text[] default array[]::text[],p_active boolean default false)
returns table(employee_id uuid,full_name text,staff_active boolean,pin_set boolean,modules text[])
language sql security invoker set search_path=''
as $$ select * from private.staff_owner_save(p_employee_id,p_full_name,p_pin,p_modules,p_active); $$;
revoke execute on function public.staff_owner_save(uuid,text,text,text[],boolean) from public,anon;
grant execute on function public.staff_owner_save(uuid,text,text,text[],boolean) to authenticated;

create or replace function private.staff_login_directory()
returns table(employee_id uuid,full_name text)
language sql stable security definer set search_path=''
as $$
  select e.id,e.full_name from private.staff_access sa
  join public.employees e on e.id=sa.employee_id join public.brands b on b.id=sa.brand_id
  where lower(btrim(b.name))='hasnaria' and sa.active and sa.pin_hash is not null and e.status='active'
  order by lower(e.full_name),e.employee_no;
$$;
revoke execute on function private.staff_login_directory() from public;
grant execute on function private.staff_login_directory() to anon,authenticated;

create or replace function public.staff_login_directory()
returns table(employee_id uuid,full_name text)
language sql stable security invoker set search_path=''
as $$ select * from private.staff_login_directory(); $$;
revoke execute on function public.staff_login_directory() from public;
grant execute on function public.staff_login_directory() to anon,authenticated;

create or replace function private.staff_pin_login(p_employee_id uuid,p_pin text)
returns table(session_token text,employee_id uuid,full_name text,modules text[],expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare
  v_access private.staff_access%rowtype; v_employee public.employees%rowtype; v_token text; v_expires timestamptz; v_failed integer;
begin
  if p_employee_id is null or p_pin !~ '^[0-9]{6}$' then raise exception 'Nama atau PIN salah'; end if;
  select * into v_access from private.staff_access sa where sa.employee_id=p_employee_id and sa.active for update;
  if not found or v_access.pin_hash is null then raise exception 'Nama atau PIN salah'; end if;
  if v_access.locked_until is not null and v_access.locked_until>now() then raise exception 'Terlalu banyak percobaan. Coba lagi setelah beberapa menit.'; end if;
  select * into v_employee from public.employees e where e.id=p_employee_id and e.status='active';
  if not found then raise exception 'Nama atau PIN salah'; end if;

  if crypt(p_pin,v_access.pin_hash)<>v_access.pin_hash then
    v_failed:=least(5,coalesce(v_access.failed_attempts,0)+1);
    update private.staff_access set failed_attempts=v_failed,locked_until=case when v_failed>=5 then now()+interval '15 minutes' else null end,updated_at=now()
    where employee_id=p_employee_id;
    if v_failed>=5 then raise exception 'Terlalu banyak percobaan. Akun dikunci 15 menit.'; end if;
    raise exception 'Nama atau PIN salah';
  end if;

  update private.staff_access set failed_attempts=0,locked_until=null,updated_at=now() where employee_id=p_employee_id;
  update private.staff_sessions set revoked_at=now() where employee_id=p_employee_id and revoked_at is null and expires_at<=now();
  v_token:=encode(gen_random_bytes(32),'hex'); v_expires:=now()+interval '12 hours';
  insert into private.staff_sessions(employee_id,token_hash,modules,expires_at)
  values(p_employee_id,digest(v_token,'sha256'),v_access.modules,v_expires);
  return query select v_token,v_employee.id,v_employee.full_name,v_access.modules,v_expires;
end;
$$;
revoke execute on function private.staff_pin_login(uuid,text) from public;
grant execute on function private.staff_pin_login(uuid,text) to anon,authenticated;

create or replace function public.staff_pin_login(p_employee_id uuid,p_pin text)
returns table(session_token text,employee_id uuid,full_name text,modules text[],expires_at timestamptz)
language sql security invoker set search_path=''
as $$ select * from private.staff_pin_login(p_employee_id,p_pin); $$;
revoke execute on function public.staff_pin_login(uuid,text) from public;
grant execute on function public.staff_pin_login(uuid,text) to anon,authenticated;

create or replace function private.staff_session_info(p_token text)
returns table(employee_id uuid,full_name text,modules text[],expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_hash bytea;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then return; end if;
  v_hash:=digest(p_token,'sha256');
  update private.staff_sessions s set last_seen_at=now()
  where s.token_hash=v_hash and s.revoked_at is null and s.expires_at>now();
  return query select e.id,e.full_name,s.modules,s.expires_at
  from private.staff_sessions s join public.employees e on e.id=s.employee_id join private.staff_access sa on sa.employee_id=e.id
  where s.token_hash=v_hash and s.revoked_at is null and s.expires_at>now() and sa.active and e.status='active' limit 1;
end;
$$;
revoke execute on function private.staff_session_info(text) from public;
grant execute on function private.staff_session_info(text) to anon,authenticated;

create or replace function public.staff_session_info(p_token text)
returns table(employee_id uuid,full_name text,modules text[],expires_at timestamptz)
language sql security invoker set search_path=''
as $$ select * from private.staff_session_info(p_token); $$;
revoke execute on function public.staff_session_info(text) from public;
grant execute on function public.staff_session_info(text) to anon,authenticated;

create or replace function private.staff_logout(p_token text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then return false; end if;
  update private.staff_sessions set revoked_at=now()
  where token_hash=digest(p_token,'sha256') and revoked_at is null;
  get diagnostics v_count=row_count;
  return v_count>0;
end;
$$;
revoke execute on function private.staff_logout(text) from public;
grant execute on function private.staff_logout(text) to anon,authenticated;

create or replace function public.staff_logout(p_token text)
returns boolean language sql security invoker set search_path=''
as $$ select private.staff_logout(p_token); $$;
revoke execute on function public.staff_logout(text) from public;
grant execute on function public.staff_logout(text) to anon,authenticated;

create or replace function private.mobile_employee_directory()
returns table(employee_id uuid,employee_no text,full_name text)
language sql stable security definer set search_path=''
as $$
  select e.id,e.employee_no,e.full_name from public.employees e join public.brands b on b.id=e.brand_id
  where lower(btrim(b.name))='hasnaria' and e.status='active'
  order by lower(e.full_name),e.employee_no;
$$;
revoke execute on function private.mobile_employee_directory() from public;
grant execute on function private.mobile_employee_directory() to anon,authenticated;

create or replace function public.mobile_employee_directory()
returns table(employee_id uuid,employee_no text,full_name text)
language sql stable security invoker set search_path=''
as $$ select * from private.mobile_employee_directory(); $$;
revoke execute on function public.mobile_employee_directory() from public;
grant execute on function public.mobile_employee_directory() to anon,authenticated;

commit;
