-- HSN-614: fix PL/pgSQL output-column ambiguity in staff portal functions.
-- Qualify employee_id references and use the named PK constraint for upsert.

create or replace function private.staff_owner_save(
  p_employee_id uuid,
  p_full_name text,
  p_pin text,
  p_modules text[],
  p_active boolean
)
returns table(employee_id uuid, full_name text, staff_active boolean, pin_set boolean, modules text[])
language plpgsql
security definer
set search_path = 'pg_catalog, extensions'
as $function$
declare
  v_brand uuid;
  v_outlet uuid;
  v_employee public.employees%rowtype;
  v_modules text[];
  v_pin_hash text;
begin
  v_brand:=private.staff_owner_brand();
  v_modules:=coalesce(p_modules,array[]::text[]);

  if nullif(btrim(coalesce(p_full_name,'')),'') is null then raise exception 'Nama pegawai wajib diisi'; end if;
  if exists(select 1 from unnest(v_modules) m where m not in ('absensi','kasir','gudang')) then raise exception 'Penugasan tidak valid'; end if;
  if coalesce(p_active,false) and cardinality(v_modules)=0 then raise exception 'Pilih minimal satu penugasan'; end if;
  if nullif(btrim(coalesce(p_pin,'')),'') is not null then
    if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN harus 6 digit angka'; end if;
    v_pin_hash:=extensions.crypt(p_pin,extensions.gen_salt('bf',8));
  end if;

  select o.id into v_outlet
  from public.outlets o
  where o.brand_id=v_brand and o.active
  order by case when lower(btrim(o.code))='main' then 0 else 1 end,o.created_at
  limit 1;
  if v_outlet is null then raise exception 'Outlet aktif belum tersedia'; end if;

  if p_employee_id is null then
    insert into public.employees(brand_id,outlet_id,employee_no,full_name,job_title,employment_type,status,created_by)
    values(v_brand,v_outlet,'EMP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),btrim(p_full_name),'Crew','employee','active',auth.uid())
    returning * into v_employee;
  else
    select * into v_employee
    from public.employees e
    where e.id=p_employee_id and e.brand_id=v_brand and e.status='active';
    if not found then raise exception 'Pegawai tidak ditemukan'; end if;
    update public.employees e
    set full_name=btrim(p_full_name),updated_at=now()
    where e.id=v_employee.id
    returning * into v_employee;
  end if;

  insert into private.staff_access(employee_id,brand_id,pin_hash,modules,active,failed_attempts,locked_until,pin_updated_at,created_by,updated_by,updated_at)
  values(v_employee.id,v_brand,v_pin_hash,v_modules,coalesce(p_active,false),0,null,case when v_pin_hash is not null then now() else null end,auth.uid(),auth.uid(),now())
  on conflict on constraint staff_access_pkey do update
  set pin_hash=coalesce(excluded.pin_hash,private.staff_access.pin_hash),
      modules=excluded.modules,
      active=excluded.active,
      failed_attempts=case when excluded.pin_hash is not null then 0 else private.staff_access.failed_attempts end,
      locked_until=case when excluded.pin_hash is not null then null else private.staff_access.locked_until end,
      pin_updated_at=case when excluded.pin_hash is not null then now() else private.staff_access.pin_updated_at end,
      updated_by=auth.uid(),updated_at=now();

  if coalesce(p_active,false) and not exists(
    select 1 from private.staff_access sa where sa.employee_id=v_employee.id and sa.pin_hash is not null
  ) then raise exception 'Set PIN sebelum mengaktifkan akun staff'; end if;

  update private.staff_sessions ss
  set revoked_at=now()
  where ss.employee_id=v_employee.id and ss.revoked_at is null;

  return query
  select e.id,e.full_name,sa.active,(sa.pin_hash is not null),sa.modules
  from public.employees e
  join private.staff_access sa on sa.employee_id=e.id
  where e.id=v_employee.id;
end;
$function$;

create or replace function private.staff_pin_login(p_employee_id uuid,p_pin text)
returns table(session_token text,employee_id uuid,full_name text,modules text[],expires_at timestamptz)
language plpgsql
security definer
set search_path = 'pg_catalog, extensions'
as $function$
declare
  v_access private.staff_access%rowtype;
  v_employee public.employees%rowtype;
  v_token text;
  v_expires timestamptz;
  v_failed integer;
begin
  if p_employee_id is null or p_pin !~ '^[0-9]{6}$' then raise exception 'Nama atau PIN salah'; end if;

  select * into v_access
  from private.staff_access sa
  where sa.employee_id=p_employee_id and sa.active
  for update;
  if not found or v_access.pin_hash is null then raise exception 'Nama atau PIN salah'; end if;
  if v_access.locked_until is not null and v_access.locked_until>now() then raise exception 'Terlalu banyak percobaan. Coba lagi setelah beberapa menit.'; end if;

  select * into v_employee
  from public.employees e
  where e.id=p_employee_id and e.status='active';
  if not found then raise exception 'Nama atau PIN salah'; end if;

  if extensions.crypt(p_pin,v_access.pin_hash)<>v_access.pin_hash then
    v_failed:=least(5,coalesce(v_access.failed_attempts,0)+1);
    update private.staff_access sa
    set failed_attempts=v_failed,
        locked_until=case when v_failed>=5 then now()+interval '15 minutes' else null end,
        updated_at=now()
    where sa.employee_id=p_employee_id;
    if v_failed>=5 then raise exception 'Terlalu banyak percobaan. Akun dikunci 15 menit.'; end if;
    raise exception 'Nama atau PIN salah';
  end if;

  update private.staff_access sa
  set failed_attempts=0,locked_until=null,updated_at=now()
  where sa.employee_id=p_employee_id;

  update private.staff_sessions ss
  set revoked_at=now()
  where ss.employee_id=p_employee_id and ss.revoked_at is null and ss.expires_at<=now();

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_expires:=now()+interval '12 hours';
  insert into private.staff_sessions(employee_id,token_hash,modules,expires_at)
  values(p_employee_id,extensions.digest(v_token,'sha256'),v_access.modules,v_expires);

  return query select v_token,v_employee.id,v_employee.full_name,v_access.modules,v_expires;
end;
$function$;
