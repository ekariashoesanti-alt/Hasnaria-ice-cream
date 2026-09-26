create or replace function private.staff_attendance_check_in(
  p_token text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m double precision default null,
  p_notes text default null
)
returns table(
  attendance_id uuid,
  attendance_date date,
  check_in_at timestamptz,
  attendance_status text,
  distance_m double precision,
  location_configured boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
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
  select * into v_roster from public.shift_roster sr where sr.employee_id=v_ctx.employee_id and sr.shift_date=v_date and sr.status='scheduled' order by sr.created_at desc limit 1;
  if found then
    select * into v_outlet from public.outlets o where o.id=v_roster.outlet_id and o.active;
    if v_roster.shift_template_id is not null then select * into v_shift from public.shift_templates st where st.id=v_roster.shift_template_id and st.active; end if;
  end if;
  if v_outlet.attendance_lat is not null and v_outlet.attendance_lng is not null then
    if p_lat is null or p_lng is null then raise exception 'Lokasi perangkat wajib diaktifkan untuk absensi'; end if;
    v_distance:=private.staff_attendance_distance_m(p_lat,p_lng,v_outlet.attendance_lat,v_outlet.attendance_lng);
    if v_distance>v_outlet.attendance_radius_meters then raise exception 'Anda berada di luar radius absensi (% m)',round(v_distance)::integer; end if;
  end if;
  if v_shift.id is not null then
    select coalesce((bs.setting_value #>> '{}')::integer,10) into v_grace from public.business_settings bs where bs.brand_id=v_ctx.brand_id and bs.setting_key='attendance_grace_minutes' limit 1;
    v_grace:=coalesce(v_grace,10);
    if v_local_time > (v_shift.start_time + make_interval(mins=>v_grace))::time then v_status:='late'; end if;
  end if;
  select * into v_existing from public.attendance a where a.employee_id=v_ctx.employee_id and a.attendance_date=v_date for update;
  v_has_existing:=found;
  if v_has_existing and v_existing.check_in_at is not null then raise exception 'Clock In hari ini sudah tercatat'; end if;
  if v_has_existing then
    update public.attendance a
       set outlet_id=v_outlet.id,roster_id=coalesce(v_roster.id,a.roster_id),check_in_at=now(),status=v_status,source='staff_pin',
           notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),a.notes),check_in_lat=p_lat,check_in_lng=p_lng,check_in_accuracy_m=p_accuracy_m,updated_at=now()
     where a.id=v_existing.id returning * into v_row;
  else
    insert into public.attendance(brand_id,outlet_id,employee_id,roster_id,attendance_date,check_in_at,status,source,notes,created_by,check_in_lat,check_in_lng,check_in_accuracy_m,updated_at)
    values(v_ctx.brand_id,v_outlet.id,v_ctx.employee_id,v_roster.id,v_date,now(),v_status,'staff_pin',nullif(btrim(coalesce(p_notes,'')),''),null,p_lat,p_lng,p_accuracy_m,now()) returning * into v_row;
  end if;
  return query select v_row.id,v_row.attendance_date,v_row.check_in_at,v_row.status,v_distance,(v_outlet.attendance_lat is not null and v_outlet.attendance_lng is not null);
end;
$$;
