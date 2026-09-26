create table if not exists private.staff_attendance_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  action text not null check (action in ('check_in')),
  requested_at timestamptz not null default now(),
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_attendance_requests_pending_idx
  on private.staff_attendance_requests(brand_id,status,requested_at desc);
create index if not exists staff_attendance_requests_employee_idx
  on private.staff_attendance_requests(employee_id,requested_at desc);

revoke all on private.staff_attendance_requests from public,anon,authenticated;

create or replace function private.staff_session_employee(
  p_token text,
  p_module text default null
)
returns public.employees
language plpgsql
security definer
set search_path='pg_catalog, extensions'
as $$
declare
  v_emp public.employees%rowtype;
begin
  if nullif(btrim(coalesce(p_token,'')),'') is null then
    raise exception 'Sesi staff tidak valid';
  end if;

  select e.* into v_emp
  from private.staff_sessions s
  join private.staff_access sa on sa.employee_id=s.employee_id
  join public.employees e on e.id=s.employee_id
  where s.token_hash=extensions.digest(p_token,'sha256')
    and s.revoked_at is null
    and s.expires_at>now()
    and sa.active
    and e.status='active'
    and (p_module is null or p_module=any(s.modules))
  limit 1;

  if not found then
    raise exception 'Sesi staff tidak valid atau akses modul belum diberikan';
  end if;

  update private.staff_sessions s
  set last_seen_at=now()
  where s.token_hash=extensions.digest(p_token,'sha256')
    and s.revoked_at is null;

  return v_emp;
end;
$$;
revoke execute on function private.staff_session_employee(text,text) from public,anon,authenticated;

create or replace function private.staff_attendance_state(p_token text)
returns table(
  employee_id uuid,
  full_name text,
  attendance_date date,
  roster_id uuid,
  shift_name text,
  shift_start time,
  shift_end time,
  has_roster boolean,
  check_in_at timestamptz,
  check_out_at timestamptz,
  attendance_status text,
  pending_request_id uuid,
  pending_action text,
  pending_requested_at timestamptz
)
language plpgsql
security definer
set search_path='pg_catalog, extensions'
as $$
declare
  v_emp public.employees%rowtype;
  v_date date:=timezone('Asia/Jakarta',now())::date;
begin
  v_emp:=private.staff_session_employee(p_token,'absensi');

  return query
  select
    v_emp.id,
    v_emp.full_name,
    v_date,
    sr.id,
    st.name,
    st.start_time,
    st.end_time,
    (sr.id is not null),
    a.check_in_at,
    a.check_out_at,
    a.status,
    req.id,
    req.action,
    req.requested_at
  from (select 1) seed
  left join lateral (
    select r.*
    from public.shift_roster r
    where r.employee_id=v_emp.id
      and r.shift_date=v_date
      and r.status='scheduled'
    order by r.created_at
    limit 1
  ) sr on true
  left join public.shift_templates st on st.id=sr.shift_template_id
  left join public.attendance a
    on a.employee_id=v_emp.id and a.attendance_date=v_date
  left join lateral (
    select x.*
    from private.staff_attendance_requests x
    where x.employee_id=v_emp.id
      and x.status='pending'
      and timezone('Asia/Jakarta',x.requested_at)::date=v_date
    order by x.requested_at desc
    limit 1
  ) req on true;
end;
$$;

create or replace function public.staff_attendance_state(p_token text)
returns table(
  employee_id uuid,
  full_name text,
  attendance_date date,
  roster_id uuid,
  shift_name text,
  shift_start time,
  shift_end time,
  has_roster boolean,
  check_in_at timestamptz,
  check_out_at timestamptz,
  attendance_status text,
  pending_request_id uuid,
  pending_action text,
  pending_requested_at timestamptz
)
language sql
set search_path=''
as $$ select * from private.staff_attendance_state(p_token); $$;

revoke execute on function public.staff_attendance_state(text) from public;
grant execute on function public.staff_attendance_state(text) to anon,authenticated;
revoke execute on function private.staff_attendance_state(text) from public;
grant execute on function private.staff_attendance_state(text) to anon,authenticated;

create or replace function private.staff_attendance_check_in(
  p_token text,
  p_notes text default null
)
returns table(
  action_status text,
  message text,
  attendance_id uuid,
  check_in_at timestamptz,
  attendance_status text,
  request_id uuid
)
language plpgsql
security definer
set search_path='pg_catalog, extensions'
as $$
declare
  v_emp public.employees%rowtype;
  v_roster public.shift_roster%rowtype;
  v_template public.shift_templates%rowtype;
  v_row public.attendance%rowtype;
  v_req private.staff_attendance_requests%rowtype;
  v_date date:=timezone('Asia/Jakarta',now())::date;
  v_local_now timestamp:=timezone('Asia/Jakarta',now());
  v_scheduled timestamp;
  v_status text:='present';
  v_grace integer:=10;
  v_outlet uuid;
begin
  v_emp:=private.staff_session_employee(p_token,'absensi');

  select * into v_row
  from public.attendance a
  where a.employee_id=v_emp.id and a.attendance_date=v_date;

  if found and v_row.check_in_at is not null then
    return query select 'already_checked_in'::text,'Kamu sudah check-in hari ini.'::text,v_row.id,v_row.check_in_at,v_row.status,null::uuid;
    return;
  end if;

  select * into v_roster
  from public.shift_roster r
  where r.employee_id=v_emp.id
    and r.shift_date=v_date
    and r.status='scheduled'
  order by r.created_at
  limit 1;

  if not found then
    select coalesce(v_emp.outlet_id,(
      select o.id from public.outlets o
      where o.brand_id=v_emp.brand_id and o.active
      order by case when lower(btrim(o.code))='main' then 0 else 1 end,o.created_at
      limit 1
    )) into v_outlet;

    if v_outlet is null then raise exception 'Outlet aktif belum tersedia'; end if;

    select * into v_req
    from private.staff_attendance_requests x
    where x.employee_id=v_emp.id
      and x.action='check_in'
      and x.status='pending'
      and timezone('Asia/Jakarta',x.requested_at)::date=v_date
    order by x.requested_at desc
    limit 1;

    if not found then
      insert into private.staff_attendance_requests(
        employee_id,brand_id,outlet_id,action,notes
      ) values(
        v_emp.id,v_emp.brand_id,v_outlet,'check_in',nullif(btrim(coalesce(p_notes,'')),'')
      ) returning * into v_req;
    end if;

    return query select 'pending_approval'::text,'Belum ada jadwal shift hari ini. Permintaan check-in dikirim ke Owner untuk approval.'::text,null::uuid,null::timestamptz,null::text,v_req.id;
    return;
  end if;

  if v_roster.shift_template_id is not null then
    select * into v_template from public.shift_templates st where st.id=v_roster.shift_template_id;
  end if;

  select coalesce((
    select (bs.setting_value #>> '{}')::integer
    from public.business_settings bs
    where bs.brand_id=v_emp.brand_id
      and lower(btrim(bs.setting_key))='attendance_grace_minutes'
    limit 1
  ),10) into v_grace;

  if v_template.id is not null then
    v_scheduled:=v_date::timestamp+v_template.start_time;
    if v_local_now>v_scheduled+make_interval(mins=>v_grace) then v_status:='late'; end if;
  end if;

  insert into public.attendance(
    brand_id,outlet_id,employee_id,roster_id,attendance_date,
    check_in_at,status,source,notes,created_by
  ) values(
    v_emp.brand_id,v_roster.outlet_id,v_emp.id,v_roster.id,v_date,
    now(),v_status,'self',nullif(btrim(coalesce(p_notes,'')),''),null
  )
  on conflict (employee_id,attendance_date) do update
  set check_in_at=coalesce(public.attendance.check_in_at,excluded.check_in_at),
      roster_id=coalesce(public.attendance.roster_id,excluded.roster_id),
      status=case when public.attendance.check_in_at is null then excluded.status else public.attendance.status end,
      notes=coalesce(excluded.notes,public.attendance.notes),
      updated_at=now()
  returning * into v_row;

  return query select 'checked_in'::text,'Check-in berhasil.'::text,v_row.id,v_row.check_in_at,v_row.status,null::uuid;
end;
$$;

create or replace function public.staff_attendance_check_in(
  p_token text,
  p_notes text default null
)
returns table(
  action_status text,
  message text,
  attendance_id uuid,
  check_in_at timestamptz,
  attendance_status text,
  request_id uuid
)
language sql
set search_path=''
as $$ select * from private.staff_attendance_check_in(p_token,p_notes); $$;

revoke execute on function public.staff_attendance_check_in(text,text) from public;
grant execute on function public.staff_attendance_check_in(text,text) to anon,authenticated;
revoke execute on function private.staff_attendance_check_in(text,text) from public;
grant execute on function private.staff_attendance_check_in(text,text) to anon,authenticated;

create or replace function private.staff_attendance_check_out(
  p_token text,
  p_notes text default null
)
returns table(
  action_status text,
  message text,
  attendance_id uuid,
  check_out_at timestamptz,
  attendance_status text
)
language plpgsql
security definer
set search_path='pg_catalog, extensions'
as $$
declare
  v_emp public.employees%rowtype;
  v_row public.attendance%rowtype;
  v_date date:=timezone('Asia/Jakarta',now())::date;
begin
  v_emp:=private.staff_session_employee(p_token,'absensi');

  select * into v_row
  from public.attendance a
  where a.employee_id=v_emp.id and a.attendance_date=v_date
  for update;

  if not found or v_row.check_in_at is null then
    if exists(
      select 1 from private.staff_attendance_requests x
      where x.employee_id=v_emp.id and x.status='pending'
        and timezone('Asia/Jakarta',x.requested_at)::date=v_date
    ) then
      raise exception 'Check-in masih menunggu approval Owner';
    end if;
    raise exception 'Belum ada check-in hari ini';
  end if;

  if v_row.check_out_at is not null then
    return query select 'already_checked_out'::text,'Kamu sudah check-out hari ini.'::text,v_row.id,v_row.check_out_at,v_row.status;
    return;
  end if;

  update public.attendance a
  set check_out_at=now(),
      notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),a.notes),
      updated_at=now()
  where a.id=v_row.id
  returning * into v_row;

  return query select 'checked_out'::text,'Check-out berhasil.'::text,v_row.id,v_row.check_out_at,v_row.status;
end;
$$;

create or replace function public.staff_attendance_check_out(
  p_token text,
  p_notes text default null
)
returns table(
  action_status text,
  message text,
  attendance_id uuid,
  check_out_at timestamptz,
  attendance_status text
)
language sql
set search_path=''
as $$ select * from private.staff_attendance_check_out(p_token,p_notes); $$;

revoke execute on function public.staff_attendance_check_out(text,text) from public;
grant execute on function public.staff_attendance_check_out(text,text) to anon,authenticated;
revoke execute on function private.staff_attendance_check_out(text,text) from public;
grant execute on function private.staff_attendance_check_out(text,text) to anon,authenticated;

create or replace function private.staff_owner_approval_list()
returns table(
  request_kind text,
  request_id uuid,
  entity_type text,
  title text,
  requester_name text,
  amount numeric,
  requested_at timestamptz,
  notes text,
  details jsonb
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_brand uuid;
begin
  v_brand:=private.staff_owner_brand();

  return query
  select * from (
    select
      'attendance'::text as request_kind,
      r.id as request_id,
      'attendance_check_in'::text as entity_type,
      'Check-in tanpa jadwal'::text as title,
      e.full_name::text as requester_name,
      null::numeric as amount,
      r.requested_at,
      r.notes,
      jsonb_build_object(
        'employee_id',r.employee_id,
        'action',r.action,
        'outlet_id',r.outlet_id,
        'attendance_date',timezone('Asia/Jakarta',r.requested_at)::date
      ) as details
    from private.staff_attendance_requests r
    join public.employees e on e.id=r.employee_id
    where r.brand_id=v_brand and r.status='pending'

    union all

    select
      'workflow'::text,
      ar.id,
      ar.entity_type,
      case ar.entity_type
        when 'purchase_request' then 'Persetujuan pembelian'
        when 'leave_request' then 'Persetujuan izin / cuti'
        else 'Persetujuan '||replace(ar.entity_type,'_',' ')
      end,
      coalesce(up.full_name,up.display_name,up.email,'User')::text,
      ar.amount,
      ar.requested_at,
      nullif(ar.decision_reason,'')::text,
      jsonb_build_object(
        'approver_role',ar.approver_role,
        'outlet_id',ar.outlet_id,
        'entity_id',ar.entity_id,
        'currency',ar.currency,
        'metadata',ar.metadata
      )
    from public.approval_requests ar
    left join public.user_profiles up on up.id=ar.requested_by
    where ar.brand_id=v_brand
      and ar.status='pending'
      and ar.requested_by<>auth.uid()
  ) q
  order by q.requested_at desc;
end;
$$;

create or replace function public.staff_owner_approval_list()
returns table(
  request_kind text,
  request_id uuid,
  entity_type text,
  title text,
  requester_name text,
  amount numeric,
  requested_at timestamptz,
  notes text,
  details jsonb
)
language sql
stable
set search_path=''
as $$ select * from private.staff_owner_approval_list(); $$;

revoke execute on function public.staff_owner_approval_list() from public,anon;
grant execute on function public.staff_owner_approval_list() to authenticated;
revoke execute on function private.staff_owner_approval_list() from public,anon;
grant execute on function private.staff_owner_approval_list() to authenticated;

create or replace function private.staff_owner_approval_decide(
  p_request_kind text,
  p_request_id uuid,
  p_action text,
  p_reason text default null
)
returns table(
  request_kind text,
  request_id uuid,
  new_status text,
  message text
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid;
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_att private.staff_attendance_requests%rowtype;
  v_work public.approval_requests%rowtype;
  v_date date;
begin
  v_brand:=private.staff_owner_brand();
  if v_action not in ('approved','rejected') then raise exception 'Aksi approval tidak valid'; end if;
  if v_action='rejected' and nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Alasan penolakan wajib diisi';
  end if;

  if lower(btrim(coalesce(p_request_kind,'')))='workflow' then
    select * into v_work
    from public.approval_requests ar
    where ar.id=p_request_id and ar.brand_id=v_brand;
    if not found then raise exception 'Permintaan approval tidak ditemukan'; end if;
    v_work:=private.decide_approval_request(p_request_id,v_action,p_reason);
    return query select 'workflow'::text,v_work.id,v_work.status,
      case when v_work.status='approved' then 'Permintaan berhasil disetujui.' else 'Permintaan berhasil ditolak.' end;
    return;
  end if;

  if lower(btrim(coalesce(p_request_kind,'')))<>'attendance' then
    raise exception 'Jenis approval tidak valid';
  end if;

  select * into v_att
  from private.staff_attendance_requests r
  where r.id=p_request_id and r.brand_id=v_brand
  for update;

  if not found then raise exception 'Permintaan absensi tidak ditemukan'; end if;
  if v_att.status<>'pending' then raise exception 'Permintaan absensi sudah diproses'; end if;

  if v_action='approved' then
    v_date:=timezone('Asia/Jakarta',v_att.requested_at)::date;
    insert into public.attendance(
      brand_id,outlet_id,employee_id,roster_id,attendance_date,
      check_in_at,status,source,notes,created_by
    ) values(
      v_att.brand_id,v_att.outlet_id,v_att.employee_id,null,v_date,
      v_att.requested_at,'present','manager',v_att.notes,auth.uid()
    )
    on conflict (employee_id,attendance_date) do update
    set check_in_at=coalesce(public.attendance.check_in_at,excluded.check_in_at),
        source=case when public.attendance.check_in_at is null then 'manager' else public.attendance.source end,
        notes=coalesce(excluded.notes,public.attendance.notes),
        updated_at=now();
  end if;

  update private.staff_attendance_requests r
  set status=v_action,
      resolved_by=auth.uid(),
      resolved_at=now(),
      decision_reason=nullif(btrim(coalesce(p_reason,'')),''),
      updated_at=now()
  where r.id=v_att.id
  returning * into v_att;

  return query select 'attendance'::text,v_att.id,v_att.status,
    case when v_att.status='approved' then 'Check-in staff berhasil disetujui.' else 'Permintaan check-in berhasil ditolak.' end;
end;
$$;

create or replace function public.staff_owner_approval_decide(
  p_request_kind text,
  p_request_id uuid,
  p_action text,
  p_reason text default null
)
returns table(
  request_kind text,
  request_id uuid,
  new_status text,
  message text
)
language sql
set search_path=''
as $$ select * from private.staff_owner_approval_decide(p_request_kind,p_request_id,p_action,p_reason); $$;

revoke execute on function public.staff_owner_approval_decide(text,uuid,text,text) from public,anon;
grant execute on function public.staff_owner_approval_decide(text,uuid,text,text) to authenticated;
revoke execute on function private.staff_owner_approval_decide(text,uuid,text,text) from public,anon;
grant execute on function private.staff_owner_approval_decide(text,uuid,text,text) to authenticated;
