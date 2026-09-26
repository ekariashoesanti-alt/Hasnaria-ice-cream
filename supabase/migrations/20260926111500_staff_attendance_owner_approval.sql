-- Mobile staff attendance + owner approval for PIN staff portal.
-- Additive migration. Staff PIN sessions are validated server-side; no anon table access.

alter table public.outlets
  add column if not exists attendance_lat double precision,
  add column if not exists attendance_lng double precision,
  add column if not exists attendance_radius_meters integer not null default 150;

alter table public.outlets
  drop constraint if exists outlets_attendance_lat_check,
  add constraint outlets_attendance_lat_check check (attendance_lat is null or attendance_lat between -90 and 90),
  drop constraint if exists outlets_attendance_lng_check,
  add constraint outlets_attendance_lng_check check (attendance_lng is null or attendance_lng between -180 and 180),
  drop constraint if exists outlets_attendance_radius_check,
  add constraint outlets_attendance_radius_check check (attendance_radius_meters between 25 and 5000);

alter table public.attendance
  add column if not exists check_in_lat double precision,
  add column if not exists check_in_lng double precision,
  add column if not exists check_in_accuracy_m double precision,
  add column if not exists check_out_lat double precision,
  add column if not exists check_out_lng double precision,
  add column if not exists check_out_accuracy_m double precision;

alter table public.attendance
  drop constraint if exists attendance_source_check,
  add constraint attendance_source_check check (source = any (array['self'::text,'manager'::text,'import'::text,'system'::text,'staff_pin'::text,'owner_correction'::text]));

create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_id uuid references public.attendance(id) on delete set null,
  attendance_date date not null,
  correction_type text not null check (correction_type in ('check_in','check_out')),
  requested_time time without time zone not null,
  reason text not null,
  photo_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  decision_reason text,
  applied_at timestamptz,
  source text not null default 'staff_pin' check (source in ('staff_pin','owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_corrections_reason_check check (char_length(btrim(reason)) between 3 and 1000)
);

create index if not exists attendance_corrections_employee_date_idx
  on public.attendance_corrections(employee_id,attendance_date desc);
create index if not exists attendance_corrections_brand_status_idx
  on public.attendance_corrections(brand_id,status,requested_at desc);
create unique index if not exists attendance_corrections_pending_uidx
  on public.attendance_corrections(employee_id,attendance_date,correction_type)
  where status='pending';

alter table public.attendance_corrections enable row level security;
revoke all on table public.attendance_corrections from public,anon,authenticated;

create or replace function private.staff_attendance_session(p_token text)
returns table(employee_id uuid,brand_id uuid,outlet_id uuid,full_name text,modules text[])
language plpgsql security definer set search_path to 'pg_catalog','extensions'
as $$
declare v_hash bytea;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then raise exception 'Sesi staff tidak valid'; end if;
  v_hash:=extensions.digest(p_token,'sha256');
  update private.staff_sessions s set last_seen_at=now()
   where s.token_hash=v_hash and s.revoked_at is null and s.expires_at>now();
  return query
  select e.id,e.brand_id,e.outlet_id,e.full_name,sa.modules
    from private.staff_sessions s
    join private.staff_access sa on sa.employee_id=s.employee_id
    join public.employees e on e.id=s.employee_id
   where s.token_hash=v_hash and s.revoked_at is null and s.expires_at>now()
     and sa.active and 'absensi'=any(sa.modules) and e.status='active' limit 1;
  if not found then raise exception 'Sesi staff tidak valid atau akses Absensi belum diberikan'; end if;
end;
$$;
revoke all on function private.staff_attendance_session(text) from public,anon,authenticated;

create or replace function private.staff_attendance_distance_m(p_lat1 double precision,p_lng1 double precision,p_lat2 double precision,p_lng2 double precision)
returns double precision language sql immutable set search_path to 'pg_catalog'
as $$
  select case when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else 6371000.0*2.0*asin(least(1.0,sqrt(power(sin(radians(p_lat2-p_lat1)/2.0),2)+cos(radians(p_lat1))*cos(radians(p_lat2))*power(sin(radians(p_lng2-p_lng1)/2.0),2)))) end;
$$;
revoke all on function private.staff_attendance_distance_m(double precision,double precision,double precision,double precision) from public,anon,authenticated;

create or replace function private.staff_attendance_today(p_token text)
returns table(employee_id uuid,full_name text,attendance_date date,attendance_id uuid,check_in_at timestamptz,check_out_at timestamptz,attendance_status text,roster_id uuid,shift_start time,shift_end time,outlet_id uuid,outlet_name text,outlet_timezone text,office_lat double precision,office_lng double precision,radius_meters integer,location_configured boolean)
language plpgsql security definer set search_path to 'pg_catalog'
as $$
declare v_ctx record;v_tz text;v_date date;
begin
  select * into v_ctx from private.staff_attendance_session(p_token);
  select coalesce(o.timezone,'Asia/Jakarta') into v_tz from public.outlets o where o.id=v_ctx.outlet_id;
  v_tz:=coalesce(v_tz,'Asia/Jakarta');v_date:=(now() at time zone v_tz)::date;
  return query
  select v_ctx.employee_id,v_ctx.full_name,v_date,a.id,a.check_in_at,a.check_out_at,a.status,sr.id,st.start_time,st.end_time,o.id,o.name,coalesce(o.timezone,'Asia/Jakarta'),o.attendance_lat,o.attendance_lng,o.attendance_radius_meters,(o.attendance_lat is not null and o.attendance_lng is not null)
    from public.outlets o
    left join public.shift_roster sr on sr.employee_id=v_ctx.employee_id and sr.shift_date=v_date and sr.status='scheduled'
    left join public.shift_templates st on st.id=sr.shift_template_id
    left join public.attendance a on a.employee_id=v_ctx.employee_id and a.attendance_date=v_date
   where o.id=coalesce(sr.outlet_id,v_ctx.outlet_id)
   order by sr.created_at desc nulls last limit 1;
end;
$$;

create or replace function private.staff_attendance_check_in(p_token text,p_lat double precision default null,p_lng double precision default null,p_accuracy_m double precision default null,p_notes text default null)
returns table(attendance_id uuid,attendance_date date,check_in_at timestamptz,attendance_status text,distance_m double precision,location_configured boolean)
language plpgsql security definer set search_path to 'pg_catalog'
as $$
declare v_ctx record;v_roster public.shift_roster%rowtype;v_shift public.shift_templates%rowtype;v_outlet public.outlets%rowtype;v_existing public.attendance%rowtype;v_date date;v_local_time time;v_grace integer:=10;v_status text:='present';v_distance double precision;v_row public.attendance%rowtype;
begin
  select * into v_ctx from private.staff_attendance_session(p_token);
  select * into v_outlet from public.outlets o where o.id=v_ctx.outlet_id and o.active;if not found then raise exception 'Outlet staff tidak aktif';end if;
  v_date:=(now() at time zone coalesce(v_outlet.timezone,'Asia/Jakarta'))::date;v_local_time:=(now() at time zone coalesce(v_outlet.timezone,'Asia/Jakarta'))::time;
  select * into v_roster from public.shift_roster sr where sr.employee_id=v_ctx.employee_id and sr.shift_date=v_date and sr.status='scheduled' order by sr.created_at desc limit 1;
  if found then select * into v_outlet from public.outlets o where o.id=v_roster.outlet_id and o.active;if v_roster.shift_template_id is not null then select * into v_shift from public.shift_templates st where st.id=v_roster.shift_template_id and st.active;end if;end if;
  if v_outlet.attendance_lat is not null and v_outlet.attendance_lng is not null then if p_lat is null or p_lng is null then raise exception 'Lokasi perangkat wajib diaktifkan untuk absensi';end if;v_distance:=private.staff_attendance_distance_m(p_lat,p_lng,v_outlet.attendance_lat,v_outlet.attendance_lng);if v_distance>v_outlet.attendance_radius_meters then raise exception 'Anda berada di luar radius absensi (% m)',round(v_distance)::integer;end if;end if;
  if v_shift.id is not null then select coalesce((bs.setting_value #>> '{}')::integer,10) into v_grace from public.business_settings bs where bs.brand_id=v_ctx.brand_id and bs.setting_key='attendance_grace_minutes' limit 1;v_grace:=coalesce(v_grace,10);if v_local_time>(v_shift.start_time+make_interval(mins=>v_grace))::time then v_status:='late';end if;end if;
  select * into v_existing from public.attendance a where a.employee_id=v_ctx.employee_id and a.attendance_date=v_date for update;if found and v_existing.check_in_at is not null then raise exception 'Clock In hari ini sudah tercatat';end if;
  insert into public.attendance(brand_id,outlet_id,employee_id,roster_id,attendance_date,check_in_at,status,source,notes,created_by,check_in_lat,check_in_lng,check_in_accuracy_m,updated_at)
  values(v_ctx.brand_id,v_outlet.id,v_ctx.employee_id,v_roster.id,v_date,now(),v_status,'staff_pin',nullif(btrim(coalesce(p_notes,'')),''),null,p_lat,p_lng,p_accuracy_m,now())
  on conflict(employee_id,attendance_date) do update set outlet_id=excluded.outlet_id,roster_id=coalesce(excluded.roster_id,public.attendance.roster_id),check_in_at=excluded.check_in_at,status=excluded.status,source='staff_pin',notes=coalesce(excluded.notes,public.attendance.notes),check_in_lat=excluded.check_in_lat,check_in_lng=excluded.check_in_lng,check_in_accuracy_m=excluded.check_in_accuracy_m,updated_at=now() returning * into v_row;
  return query select v_row.id,v_row.attendance_date,v_row.check_in_at,v_row.status,v_distance,(v_outlet.attendance_lat is not null and v_outlet.attendance_lng is not null);
end;
$$;

create or replace function private.staff_attendance_check_out(p_token text,p_lat double precision default null,p_lng double precision default null,p_accuracy_m double precision default null,p_notes text default null)
returns table(attendance_id uuid,attendance_date date,check_out_at timestamptz,attendance_status text,distance_m double precision,location_configured boolean)
language plpgsql security definer set search_path to 'pg_catalog'
as $$
declare v_ctx record;v_outlet public.outlets%rowtype;v_date date;v_distance double precision;v_row public.attendance%rowtype;
begin
 select * into v_ctx from private.staff_attendance_session(p_token);select * into v_outlet from public.outlets o where o.id=v_ctx.outlet_id and o.active;if not found then raise exception 'Outlet staff tidak aktif';end if;v_date:=(now() at time zone coalesce(v_outlet.timezone,'Asia/Jakarta'))::date;
 select o.* into v_outlet from public.attendance a join public.outlets o on o.id=a.outlet_id where a.employee_id=v_ctx.employee_id and a.attendance_date=v_date limit 1;if v_outlet.id is null then raise exception 'Clock In belum tercatat hari ini';end if;
 if v_outlet.attendance_lat is not null and v_outlet.attendance_lng is not null then if p_lat is null or p_lng is null then raise exception 'Lokasi perangkat wajib diaktifkan untuk absensi';end if;v_distance:=private.staff_attendance_distance_m(p_lat,p_lng,v_outlet.attendance_lat,v_outlet.attendance_lng);if v_distance>v_outlet.attendance_radius_meters then raise exception 'Anda berada di luar radius absensi (% m)',round(v_distance)::integer;end if;end if;
 update public.attendance a set check_out_at=now(),source='staff_pin',notes=case when nullif(btrim(coalesce(p_notes,'')),'') is null then a.notes when a.notes is null then btrim(p_notes) else a.notes||E'\n'||btrim(p_notes) end,check_out_lat=p_lat,check_out_lng=p_lng,check_out_accuracy_m=p_accuracy_m,updated_at=now() where a.employee_id=v_ctx.employee_id and a.attendance_date=v_date and a.check_in_at is not null and a.check_out_at is null returning * into v_row;
 if not found then if exists(select 1 from public.attendance a where a.employee_id=v_ctx.employee_id and a.attendance_date=v_date and a.check_out_at is not null) then raise exception 'Clock Out hari ini sudah tercatat';end if;raise exception 'Clock In belum tercatat hari ini';end if;
 return query select v_row.id,v_row.attendance_date,v_row.check_out_at,v_row.status,v_distance,(v_outlet.attendance_lat is not null and v_outlet.attendance_lng is not null);
end;
$$;

create or replace function private.staff_attendance_history(p_token text,p_from date,p_to date)
returns table(attendance_date date,attendance_id uuid,check_in_at timestamptz,check_out_at timestamptz,attendance_status text,roster_id uuid,shift_start time,shift_end time,outlet_name text)
language plpgsql security definer set search_path to 'pg_catalog'
as $$
declare v_ctx record;begin select * into v_ctx from private.staff_attendance_session(p_token);if p_from is null or p_to is null or p_to<p_from then raise exception 'Rentang tanggal tidak valid';end if;if p_to-p_from>93 then raise exception 'Rentang riwayat maksimal 94 hari';end if;return query with dates as(select gs::date as d from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') gs) select d.d,a.id,a.check_in_at,a.check_out_at,coalesce(a.status,case when sr.status='leave' then 'leave' else null end),sr.id,st.start_time,st.end_time,o.name from dates d left join public.attendance a on a.employee_id=v_ctx.employee_id and a.attendance_date=d.d left join public.shift_roster sr on sr.employee_id=v_ctx.employee_id and sr.shift_date=d.d left join public.shift_templates st on st.id=sr.shift_template_id left join public.outlets o on o.id=coalesce(a.outlet_id,sr.outlet_id,v_ctx.outlet_id) order by d.d;end;
$$;

create or replace function private.staff_attendance_corrections(p_token text)
returns table(correction_id uuid,attendance_date date,correction_type text,requested_time time,reason text,status text,requested_at timestamptz,resolved_at timestamptz,decision_reason text)
language plpgsql security definer set search_path to 'pg_catalog'
as $$ declare v_ctx record;begin select * into v_ctx from private.staff_attendance_session(p_token);return query select c.id,c.attendance_date,c.correction_type,c.requested_time,c.reason,c.status,c.requested_at,c.resolved_at,c.decision_reason from public.attendance_corrections c where c.employee_id=v_ctx.employee_id order by c.requested_at desc limit 100;end; $$;

create or replace function private.staff_attendance_correction_submit(p_token text,p_correction_type text,p_attendance_date date,p_requested_time time,p_reason text,p_photo_url text default null)
returns table(correction_id uuid,status text,requested_at timestamptz)
language plpgsql security definer set search_path to 'pg_catalog'
as $$
declare v_ctx record;v_tz text;v_today date;v_attendance uuid;v_id uuid;v_requested timestamptz;
begin select * into v_ctx from private.staff_attendance_session(p_token);if p_correction_type not in('check_in','check_out') then raise exception 'Tipe koreksi tidak valid';end if;if p_attendance_date is null or p_requested_time is null then raise exception 'Tanggal dan waktu wajib diisi';end if;if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Alasan koreksi wajib diisi';end if;select coalesce(o.timezone,'Asia/Jakarta') into v_tz from public.outlets o where o.id=v_ctx.outlet_id;v_today:=(now() at time zone coalesce(v_tz,'Asia/Jakarta'))::date;if p_attendance_date>v_today then raise exception 'Tanggal koreksi tidak boleh di masa depan';end if;if p_attendance_date<v_today-interval '60 days' then raise exception 'Koreksi maksimal 60 hari ke belakang';end if;select a.id into v_attendance from public.attendance a where a.employee_id=v_ctx.employee_id and a.attendance_date=p_attendance_date;insert into public.attendance_corrections(brand_id,outlet_id,employee_id,attendance_id,attendance_date,correction_type,requested_time,reason,photo_url,status,source) values(v_ctx.brand_id,v_ctx.outlet_id,v_ctx.employee_id,v_attendance,p_attendance_date,p_correction_type,p_requested_time,btrim(p_reason),nullif(btrim(coalesce(p_photo_url,'')),''),'pending','staff_pin') returning id,requested_at into v_id,v_requested;return query select v_id,'pending'::text,v_requested;exception when unique_violation then raise exception 'Masih ada koreksi pending untuk tanggal dan tipe yang sama';end;
$$;

create or replace function private.staff_owner_attendance_approvals()
returns table(correction_id uuid,employee_id uuid,employee_name text,employee_no text,attendance_date date,correction_type text,requested_time time,reason text,photo_url text,requested_at timestamptz,current_check_in timestamptz,current_check_out timestamptz,current_status text,outlet_name text)
language sql stable security definer set search_path to ''
as $$ with ctx as(select private.staff_owner_brand() as brand_id) select c.id,e.id,e.full_name,e.employee_no,c.attendance_date,c.correction_type,c.requested_time,c.reason,c.photo_url,c.requested_at,a.check_in_at,a.check_out_at,a.status,o.name from public.attendance_corrections c join ctx on ctx.brand_id=c.brand_id join public.employees e on e.id=c.employee_id join public.outlets o on o.id=c.outlet_id left join public.attendance a on a.employee_id=c.employee_id and a.attendance_date=c.attendance_date where c.status='pending' order by c.requested_at asc; $$;

create or replace function private.staff_owner_attendance_decide(p_correction_id uuid,p_action text,p_reason text default null)
returns table(correction_id uuid,status text,resolved_at timestamptz)
language plpgsql security definer set search_path to 'pg_catalog'
as $$
declare v_brand uuid;v_req public.attendance_corrections%rowtype;v_emp public.employees%rowtype;v_outlet public.outlets%rowtype;v_att public.attendance%rowtype;v_roster public.shift_roster%rowtype;v_shift public.shift_templates%rowtype;v_grace integer:=10;v_requested_ts timestamptz;v_status text:='present';v_resolved timestamptz:=now();
begin
 v_brand:=private.staff_owner_brand();if p_action not in('approve','reject') then raise exception 'Aksi approval tidak valid';end if;if p_action='reject' and char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Alasan penolakan wajib diisi';end if;
 select * into v_req from public.attendance_corrections c where c.id=p_correction_id and c.brand_id=v_brand for update;if not found then raise exception 'Permintaan koreksi tidak ditemukan';end if;if v_req.status<>'pending' then raise exception 'Permintaan koreksi sudah diproses';end if;
 if p_action='reject' then update public.attendance_corrections c set status='rejected',resolved_by=auth.uid(),resolved_at=v_resolved,decision_reason=btrim(p_reason),updated_at=now() where c.id=v_req.id;return query select v_req.id,'rejected'::text,v_resolved;return;end if;
 select * into v_emp from public.employees e where e.id=v_req.employee_id and e.brand_id=v_brand and e.status='active';if not found then raise exception 'Pegawai tidak aktif';end if;select * into v_outlet from public.outlets o where o.id=v_req.outlet_id and o.brand_id=v_brand;if not found then raise exception 'Outlet tidak ditemukan';end if;v_requested_ts:=(v_req.attendance_date+v_req.requested_time) at time zone coalesce(v_outlet.timezone,'Asia/Jakarta');
 select * into v_roster from public.shift_roster sr where sr.employee_id=v_emp.id and sr.shift_date=v_req.attendance_date and sr.status='scheduled' order by sr.created_at desc limit 1;if found and v_roster.shift_template_id is not null then select * into v_shift from public.shift_templates st where st.id=v_roster.shift_template_id;end if;
 if v_req.correction_type='check_in' and v_shift.id is not null then select coalesce((bs.setting_value #>> '{}')::integer,10) into v_grace from public.business_settings bs where bs.brand_id=v_brand and bs.setting_key='attendance_grace_minutes' limit 1;v_grace:=coalesce(v_grace,10);if v_req.requested_time>(v_shift.start_time+make_interval(mins=>v_grace))::time then v_status:='late';end if;end if;
 select * into v_att from public.attendance a where a.employee_id=v_emp.id and a.attendance_date=v_req.attendance_date for update;
 if v_req.correction_type='check_in' then if v_att.id is not null and v_att.check_out_at is not null and v_requested_ts>v_att.check_out_at then raise exception 'Waktu Clock In tidak boleh setelah Clock Out';end if;insert into public.attendance(brand_id,outlet_id,employee_id,roster_id,attendance_date,check_in_at,check_out_at,status,source,notes,created_by,updated_at) values(v_brand,v_outlet.id,v_emp.id,v_roster.id,v_req.attendance_date,v_requested_ts,null,v_status,'owner_correction','[Koreksi Owner] '||v_req.reason,auth.uid(),now()) on conflict(employee_id,attendance_date) do update set check_in_at=excluded.check_in_at,roster_id=coalesce(excluded.roster_id,public.attendance.roster_id),status=excluded.status,source='owner_correction',notes=case when public.attendance.notes is null then excluded.notes else public.attendance.notes||E'\n'||excluded.notes end,updated_at=now();
 else if v_att.id is not null and v_att.check_in_at is not null and v_requested_ts<v_att.check_in_at then raise exception 'Waktu Clock Out tidak boleh sebelum Clock In';end if;insert into public.attendance(brand_id,outlet_id,employee_id,roster_id,attendance_date,check_out_at,status,source,notes,created_by,updated_at) values(v_brand,v_outlet.id,v_emp.id,v_roster.id,v_req.attendance_date,v_requested_ts,coalesce(v_att.status,'present'),'owner_correction','[Koreksi Owner] '||v_req.reason,auth.uid(),now()) on conflict(employee_id,attendance_date) do update set check_out_at=excluded.check_out_at,roster_id=coalesce(excluded.roster_id,public.attendance.roster_id),source='owner_correction',notes=case when public.attendance.notes is null then excluded.notes else public.attendance.notes||E'\n'||excluded.notes end,updated_at=now();end if;
 update public.attendance_corrections c set status='approved',resolved_by=auth.uid(),resolved_at=v_resolved,decision_reason=nullif(btrim(coalesce(p_reason,'')),''),applied_at=now(),updated_at=now(),attendance_id=(select a.id from public.attendance a where a.employee_id=v_emp.id and a.attendance_date=v_req.attendance_date) where c.id=v_req.id;return query select v_req.id,'approved'::text,v_resolved;
end;
$$;

create or replace function public.staff_attendance_today(p_token text)
returns table(employee_id uuid,full_name text,attendance_date date,attendance_id uuid,check_in_at timestamptz,check_out_at timestamptz,attendance_status text,roster_id uuid,shift_start time,shift_end time,outlet_id uuid,outlet_name text,outlet_timezone text,office_lat double precision,office_lng double precision,radius_meters integer,location_configured boolean)
language sql set search_path to '' as $$ select * from private.staff_attendance_today(p_token); $$;
create or replace function public.staff_attendance_check_in(p_token text,p_lat double precision default null,p_lng double precision default null,p_accuracy_m double precision default null,p_notes text default null)
returns table(attendance_id uuid,attendance_date date,check_in_at timestamptz,attendance_status text,distance_m double precision,location_configured boolean)
language sql set search_path to '' as $$ select * from private.staff_attendance_check_in(p_token,p_lat,p_lng,p_accuracy_m,p_notes); $$;
create or replace function public.staff_attendance_check_out(p_token text,p_lat double precision default null,p_lng double precision default null,p_accuracy_m double precision default null,p_notes text default null)
returns table(attendance_id uuid,attendance_date date,check_out_at timestamptz,attendance_status text,distance_m double precision,location_configured boolean)
language sql set search_path to '' as $$ select * from private.staff_attendance_check_out(p_token,p_lat,p_lng,p_accuracy_m,p_notes); $$;
create or replace function public.staff_attendance_history(p_token text,p_from date,p_to date)
returns table(attendance_date date,attendance_id uuid,check_in_at timestamptz,check_out_at timestamptz,attendance_status text,roster_id uuid,shift_start time,shift_end time,outlet_name text)
language sql set search_path to '' as $$ select * from private.staff_attendance_history(p_token,p_from,p_to); $$;
create or replace function public.staff_attendance_corrections(p_token text)
returns table(correction_id uuid,attendance_date date,correction_type text,requested_time time,reason text,status text,requested_at timestamptz,resolved_at timestamptz,decision_reason text)
language sql set search_path to '' as $$ select * from private.staff_attendance_corrections(p_token); $$;
create or replace function public.staff_attendance_correction_submit(p_token text,p_correction_type text,p_attendance_date date,p_requested_time time,p_reason text,p_photo_url text default null)
returns table(correction_id uuid,status text,requested_at timestamptz)
language sql set search_path to '' as $$ select * from private.staff_attendance_correction_submit(p_token,p_correction_type,p_attendance_date,p_requested_time,p_reason,p_photo_url); $$;
create or replace function public.staff_owner_attendance_approvals()
returns table(correction_id uuid,employee_id uuid,employee_name text,employee_no text,attendance_date date,correction_type text,requested_time time,reason text,photo_url text,requested_at timestamptz,current_check_in timestamptz,current_check_out timestamptz,current_status text,outlet_name text)
language sql stable set search_path to '' as $$ select * from private.staff_owner_attendance_approvals(); $$;
create or replace function public.staff_owner_attendance_decide(p_correction_id uuid,p_action text,p_reason text default null)
returns table(correction_id uuid,status text,resolved_at timestamptz)
language sql set search_path to '' as $$ select * from private.staff_owner_attendance_decide(p_correction_id,p_action,p_reason); $$;

revoke all on function private.staff_attendance_today(text) from public;
revoke all on function private.staff_attendance_check_in(text,double precision,double precision,double precision,text) from public;
revoke all on function private.staff_attendance_check_out(text,double precision,double precision,double precision,text) from public;
revoke all on function private.staff_attendance_history(text,date,date) from public;
revoke all on function private.staff_attendance_corrections(text) from public;
revoke all on function private.staff_attendance_correction_submit(text,text,date,time,text,text) from public;
revoke all on function private.staff_owner_attendance_approvals() from public;
revoke all on function private.staff_owner_attendance_decide(uuid,text,text) from public;
grant execute on function private.staff_attendance_today(text) to anon,authenticated;
grant execute on function private.staff_attendance_check_in(text,double precision,double precision,double precision,text) to anon,authenticated;
grant execute on function private.staff_attendance_check_out(text,double precision,double precision,double precision,text) to anon,authenticated;
grant execute on function private.staff_attendance_history(text,date,date) to anon,authenticated;
grant execute on function private.staff_attendance_corrections(text) to anon,authenticated;
grant execute on function private.staff_attendance_correction_submit(text,text,date,time,text,text) to anon,authenticated;
grant execute on function private.staff_owner_attendance_approvals() to authenticated;
grant execute on function private.staff_owner_attendance_decide(uuid,text,text) to authenticated;
revoke all on function public.staff_attendance_today(text) from public,anon,authenticated;
revoke all on function public.staff_attendance_check_in(text,double precision,double precision,double precision,text) from public,anon,authenticated;
revoke all on function public.staff_attendance_check_out(text,double precision,double precision,double precision,text) from public,anon,authenticated;
revoke all on function public.staff_attendance_history(text,date,date) from public,anon,authenticated;
revoke all on function public.staff_attendance_corrections(text) from public,anon,authenticated;
revoke all on function public.staff_attendance_correction_submit(text,text,date,time,text,text) from public,anon,authenticated;
revoke all on function public.staff_owner_attendance_approvals() from public,anon,authenticated;
revoke all on function public.staff_owner_attendance_decide(uuid,text,text) from public,anon,authenticated;
grant execute on function public.staff_attendance_today(text) to anon,authenticated;
grant execute on function public.staff_attendance_check_in(text,double precision,double precision,double precision,text) to anon,authenticated;
grant execute on function public.staff_attendance_check_out(text,double precision,double precision,double precision,text) to anon,authenticated;
grant execute on function public.staff_attendance_history(text,date,date) to anon,authenticated;
grant execute on function public.staff_attendance_corrections(text) to anon,authenticated;
grant execute on function public.staff_attendance_correction_submit(text,text,date,time,text,text) to anon,authenticated;
grant execute on function public.staff_owner_attendance_approvals() to authenticated;
grant execute on function public.staff_owner_attendance_decide(uuid,text,text) to authenticated;
