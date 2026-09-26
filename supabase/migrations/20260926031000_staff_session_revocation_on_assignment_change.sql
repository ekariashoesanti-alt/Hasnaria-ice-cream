-- HSN-614: apply owner-side staff access changes immediately.
-- Any PIN, module, active-state, or staff profile save revokes existing staff sessions.

begin;

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
set search_path=''
as $$
declare
  v_brand uuid;
  v_outlet uuid;
  v_employee public.employees%rowtype;
  v_modules text[];
  v_pin_hash text;
begin
  v_brand:=private.staff_owner_brand();
  v_modules:=coalesce(p_modules,array[]::text[]);

  if nullif(btrim(coalesce(p_full_name,'')),'') is null then
    raise exception 'Nama pegawai wajib diisi';
  end if;
  if exists(select 1 from unnest(v_modules) m where m not in ('absensi','kasir','gudang')) then
    raise exception 'Penugasan tidak valid';
  end if;
  if coalesce(p_active,false) and cardinality(v_modules)=0 then
    raise exception 'Pilih minimal satu penugasan';
  end if;
  if nullif(btrim(coalesce(p_pin,'')),'') is not null then
    if p_pin !~ '^[0-9]{6}$' then
      raise exception 'PIN harus 6 digit angka';
    end if;
    v_pin_hash:=crypt(p_pin,gen_salt('bf',8));
  end if;

  select o.id into v_outlet
  from public.outlets o
  where o.brand_id=v_brand and o.active
  order by case when lower(btrim(o.code))='main' then 0 else 1 end,o.created_at
  limit 1;
  if v_outlet is null then raise exception 'Outlet aktif belum tersedia'; end if;

  if p_employee_id is null then
    insert into public.employees(
      brand_id,outlet_id,employee_no,full_name,job_title,employment_type,status,created_by
    ) values(
      v_brand,v_outlet,
      'EMP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
      btrim(p_full_name),'Crew','employee','active',auth.uid()
    ) returning * into v_employee;
  else
    select * into v_employee
    from public.employees e
    where e.id=p_employee_id and e.brand_id=v_brand and e.status='active';
    if not found then raise exception 'Pegawai tidak ditemukan'; end if;
    update public.employees
    set full_name=btrim(p_full_name),updated_at=now()
    where id=v_employee.id
    returning * into v_employee;
  end if;

  insert into private.staff_access(
    employee_id,brand_id,pin_hash,modules,active,failed_attempts,locked_until,
    pin_updated_at,created_by,updated_by,updated_at
  ) values(
    v_employee.id,v_brand,v_pin_hash,v_modules,coalesce(p_active,false),0,null,
    case when v_pin_hash is not null then now() else null end,
    auth.uid(),auth.uid(),now()
  )
  on conflict(employee_id) do update
  set pin_hash=coalesce(excluded.pin_hash,private.staff_access.pin_hash),
      modules=excluded.modules,
      active=excluded.active,
      failed_attempts=case when excluded.pin_hash is not null then 0 else private.staff_access.failed_attempts end,
      locked_until=case when excluded.pin_hash is not null then null else private.staff_access.locked_until end,
      pin_updated_at=case when excluded.pin_hash is not null then now() else private.staff_access.pin_updated_at end,
      updated_by=auth.uid(),
      updated_at=now();

  if coalesce(p_active,false) and not exists(
    select 1 from private.staff_access sa where sa.employee_id=v_employee.id and sa.pin_hash is not null
  ) then
    raise exception 'Set PIN sebelum mengaktifkan akun staff';
  end if;

  update private.staff_sessions
  set revoked_at=now()
  where employee_id=v_employee.id and revoked_at is null;

  return query
  select e.id,e.full_name,sa.active,(sa.pin_hash is not null),sa.modules
  from public.employees e
  join private.staff_access sa on sa.employee_id=e.id
  where e.id=v_employee.id;
end;
$$;

revoke execute on function private.staff_owner_save(uuid,text,text,text[],boolean) from public,anon;
grant execute on function private.staff_owner_save(uuid,text,text,text[],boolean) to authenticated;

commit;
