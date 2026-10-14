-- Hasnaria staff attendance geofence: 200 m, with max GPS accuracy 50 m.
-- No attendance records or outlet center coordinates are modified.
-- RPC signatures/privileges are preserved; rollout database before frontend.
-- Rollback: revert this migration by restoring prior private RPC definitions and
-- setting attendance_radius_meters back to 50 on configured active outlets.
update public.outlets
   set attendance_radius_meters=200,
       updated_at=now()
 where active
   and attendance_lat is not null
   and attendance_lng is not null
   and attendance_radius_meters is distinct from 200;

CREATE OR REPLACE FUNCTION private.staff_attendance_check_in(p_token text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy_m double precision DEFAULT NULL::double precision, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(attendance_id uuid, attendance_date date, check_in_at timestamp with time zone, attendance_status text, distance_m double precision, location_configured boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ctx record;
  v_roster public.shift_roster%rowtype;
  v_shift public.shift_templates%rowtype;
  v_outlet public.outlets%rowtype;
  v_existing public.attendance%rowtype;
  v_has_existing boolean:=false;
  v_date date;
  v_local_time time;
  v_grace integer:=10;
  v_status text:='present';
  v_distance double precision;
  v_row public.attendance%rowtype;
begin
  select * into v_ctx from private.staff_attendance_session(p_token);
  select * into v_outlet from public.outlets o where o.id=v_ctx.outlet_id and o.active;
  if not found then raise exception 'Outlet staff tidak aktif'; end if;

  v_date:=(now() at time zone coalesce(v_outlet.timezone,'Asia/Jakarta'))::date;
  v_local_time:=(now() at time zone coalesce(v_outlet.timezone,'Asia/Jakarta'))::time;

  select * into v_roster
    from public.shift_roster sr
   where sr.employee_id=v_ctx.employee_id
     and sr.shift_date=v_date
     and sr.status='scheduled'
   order by sr.created_at desc
   limit 1;

  if found then
    select * into v_outlet from public.outlets o where o.id=v_roster.outlet_id and o.active;
    if v_roster.shift_template_id is not null then
      select * into v_shift from public.shift_templates st where st.id=v_roster.shift_template_id and st.active;
    end if;
  end if;

  if v_outlet.attendance_lat is null or v_outlet.attendance_lng is null then
    raise exception 'Titik lokasi Warung Hasnaria belum dikonfigurasi Owner';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Lokasi perangkat wajib diaktifkan untuk absensi';
  end if;

  if p_accuracy_m is null or not isfinite(p_accuracy_m) or p_accuracy_m<0 or p_accuracy_m>50 then
    raise exception 'Akurasi GPS belum memadai (maksimal 50 m). Aktifkan lokasi presisi lalu perbarui lokasi';
  end if;
  v_distance:=private.staff_attendance_distance_m(p_lat,p_lng,v_outlet.attendance_lat,v_outlet.attendance_lng);
  if v_distance>v_outlet.attendance_radius_meters then
    raise exception 'Anda berada di luar radius absensi % m (% m)',v_outlet.attendance_radius_meters,round(v_distance)::integer;
  end if;

  if v_shift.id is not null then
    select coalesce((bs.setting_value #>> '{}')::integer,10)
      into v_grace
      from public.business_settings bs
     where bs.brand_id=v_ctx.brand_id and bs.setting_key='attendance_grace_minutes'
     limit 1;
    v_grace:=coalesce(v_grace,10);
    if v_local_time > (v_shift.start_time + make_interval(mins=>v_grace))::time then
      v_status:='late';
    end if;
  end if;

  select * into v_existing
    from public.attendance a
   where a.employee_id=v_ctx.employee_id and a.attendance_date=v_date
   for update;
  v_has_existing:=found;
  if v_has_existing and v_existing.check_in_at is not null then
    raise exception 'Clock In hari ini sudah tercatat';
  end if;

  if v_has_existing then
    update public.attendance a
       set outlet_id=v_outlet.id,
           roster_id=coalesce(v_roster.id,a.roster_id),
           check_in_at=now(),
           status=v_status,
           source='staff_pin',
           notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),a.notes),
           check_in_lat=p_lat,
           check_in_lng=p_lng,
           check_in_accuracy_m=p_accuracy_m,
           updated_at=now()
     where a.id=v_existing.id
     returning * into v_row;
  else
    insert into public.attendance(
      brand_id,outlet_id,employee_id,roster_id,attendance_date,
      check_in_at,status,source,notes,created_by,
      check_in_lat,check_in_lng,check_in_accuracy_m,updated_at
    ) values(
      v_ctx.brand_id,v_outlet.id,v_ctx.employee_id,v_roster.id,v_date,
      now(),v_status,'staff_pin',nullif(btrim(coalesce(p_notes,'')),''),null,
      p_lat,p_lng,p_accuracy_m,now()
    ) returning * into v_row;
  end if;

  return query select v_row.id,v_row.attendance_date,v_row.check_in_at,v_row.status,v_distance,true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.staff_attendance_check_out(p_token text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy_m double precision DEFAULT NULL::double precision, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(attendance_id uuid, attendance_date date, check_out_at timestamp with time zone, attendance_status text, distance_m double precision, location_configured boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ctx record;
  v_outlet public.outlets%rowtype;
  v_date date;
  v_distance double precision;
  v_row public.attendance%rowtype;
begin
  select * into v_ctx from private.staff_attendance_session(p_token);
  select * into v_outlet from public.outlets o where o.id=v_ctx.outlet_id and o.active;
  if not found then raise exception 'Outlet staff tidak aktif'; end if;
  v_date:=(now() at time zone coalesce(v_outlet.timezone,'Asia/Jakarta'))::date;

  select o.* into v_outlet
    from public.attendance a
    join public.outlets o on o.id=a.outlet_id
   where a.employee_id=v_ctx.employee_id and a.attendance_date=v_date
   limit 1;

  if v_outlet.id is null then
    raise exception 'Clock In belum tercatat hari ini';
  end if;
  if v_outlet.attendance_lat is null or v_outlet.attendance_lng is null then
    raise exception 'Titik lokasi Warung Hasnaria belum dikonfigurasi Owner';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Lokasi perangkat wajib diaktifkan untuk absensi';
  end if;

  if p_accuracy_m is null or not isfinite(p_accuracy_m) or p_accuracy_m<0 or p_accuracy_m>50 then
    raise exception 'Akurasi GPS belum memadai (maksimal 50 m). Aktifkan lokasi presisi lalu perbarui lokasi';
  end if;
  v_distance:=private.staff_attendance_distance_m(p_lat,p_lng,v_outlet.attendance_lat,v_outlet.attendance_lng);
  if v_distance>v_outlet.attendance_radius_meters then
    raise exception 'Anda berada di luar radius absensi % m (% m)',v_outlet.attendance_radius_meters,round(v_distance)::integer;
  end if;

  update public.attendance a
     set check_out_at=now(),
         source='staff_pin',
         notes=case when nullif(btrim(coalesce(p_notes,'')),'') is null then a.notes
                    when a.notes is null then btrim(p_notes)
                    else a.notes||E'\n'||btrim(p_notes) end,
         check_out_lat=p_lat,
         check_out_lng=p_lng,
         check_out_accuracy_m=p_accuracy_m,
         updated_at=now()
   where a.employee_id=v_ctx.employee_id
     and a.attendance_date=v_date
     and a.check_in_at is not null
     and a.check_out_at is null
   returning * into v_row;

  if not found then
    if exists(select 1 from public.attendance a where a.employee_id=v_ctx.employee_id and a.attendance_date=v_date and a.check_out_at is not null) then
      raise exception 'Clock Out hari ini sudah tercatat';
    end if;
    raise exception 'Clock In belum tercatat hari ini';
  end if;

  return query select v_row.id,v_row.attendance_date,v_row.check_out_at,v_row.status,v_distance,true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.staff_owner_attendance_location()
 RETURNS TABLE(outlet_id uuid, outlet_name text, attendance_lat double precision, attendance_lng double precision, radius_meters integer, configured boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ctx as (select private.staff_owner_brand() as brand_id),
  chosen as (
    select o.*
      from public.outlets o
      join ctx on ctx.brand_id=o.brand_id
     where o.active
     order by case when lower(btrim(o.code))='main' then 0 else 1 end,o.created_at
     limit 1
  )
  select id,name,attendance_lat,attendance_lng,attendance_radius_meters,
         (attendance_lat is not null and attendance_lng is not null)
    from chosen;
$function$;

CREATE OR REPLACE FUNCTION private.staff_owner_set_attendance_location(p_lat double precision, p_lng double precision)
 RETURNS TABLE(outlet_id uuid, outlet_name text, attendance_lat double precision, attendance_lng double precision, radius_meters integer, configured boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_brand uuid;
  v_outlet public.outlets%rowtype;
begin
  v_brand:=private.staff_owner_brand();
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Koordinat lokasi tidak valid';
  end if;

  select * into v_outlet
    from public.outlets o
   where o.brand_id=v_brand and o.active
   order by case when lower(btrim(o.code))='main' then 0 else 1 end,o.created_at
   limit 1
   for update;
  if not found then raise exception 'Outlet aktif belum tersedia'; end if;

  update public.outlets o
     set attendance_lat=p_lat,
         attendance_lng=p_lng,
         attendance_radius_meters=200,
         updated_at=now()
   where o.id=v_outlet.id
   returning * into v_outlet;

  return query select v_outlet.id,v_outlet.name,v_outlet.attendance_lat,v_outlet.attendance_lng,v_outlet.attendance_radius_meters,true;
end;
$function$;
