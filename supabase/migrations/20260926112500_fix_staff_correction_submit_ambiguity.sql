create or replace function private.staff_attendance_correction_submit(
  p_token text,
  p_correction_type text,
  p_attendance_date date,
  p_requested_time time,
  p_reason text,
  p_photo_url text default null
)
returns table(correction_id uuid,status text,requested_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_ctx record;
  v_tz text;
  v_today date;
  v_attendance uuid;
  v_id uuid;
  v_requested timestamptz;
begin
  select * into v_ctx from private.staff_attendance_session(p_token);
  if p_correction_type not in ('check_in','check_out') then raise exception 'Tipe koreksi tidak valid'; end if;
  if p_attendance_date is null or p_requested_time is null then raise exception 'Tanggal dan waktu wajib diisi'; end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Alasan koreksi wajib diisi'; end if;
  select coalesce(o.timezone,'Asia/Jakarta') into v_tz from public.outlets o where o.id=v_ctx.outlet_id;
  v_today:=(now() at time zone coalesce(v_tz,'Asia/Jakarta'))::date;
  if p_attendance_date>v_today then raise exception 'Tanggal koreksi tidak boleh di masa depan'; end if;
  if p_attendance_date<(v_today-60) then raise exception 'Koreksi maksimal 60 hari ke belakang'; end if;
  select a.id into v_attendance from public.attendance a where a.employee_id=v_ctx.employee_id and a.attendance_date=p_attendance_date;
  insert into public.attendance_corrections as c(brand_id,outlet_id,employee_id,attendance_id,attendance_date,correction_type,requested_time,reason,photo_url,status,source)
  values(v_ctx.brand_id,v_ctx.outlet_id,v_ctx.employee_id,v_attendance,p_attendance_date,p_correction_type,p_requested_time,btrim(p_reason),nullif(btrim(coalesce(p_photo_url,'')),''),'pending','staff_pin')
  returning c.id,c.requested_at into v_id,v_requested;
  return query select v_id,'pending'::text,v_requested;
exception when unique_violation then
  raise exception 'Masih ada koreksi pending untuk tanggal dan tipe yang sama';
end;
$$;
