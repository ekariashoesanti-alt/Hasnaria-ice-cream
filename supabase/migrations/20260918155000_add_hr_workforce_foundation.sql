-- ERP HR & workforce foundation: employee master, roster, attendance, leave,
-- overtime, payroll inputs, training and workforce KPI views.

begin;

create or replace function private.has_capability(p_capability text)
returns boolean
language sql stable security definer set search_path=''
as $$
  select case lower(btrim(coalesce(p_capability,'')))
    when 'business.read' then private.has_role(array['owner','head_store','marketing','pic','pelaksana'])
    when 'sales.write' then private.has_role(array['owner','head_store','pic','pelaksana'])
    when 'ops.write' then private.has_role(array['owner','head_store','pic'])
    when 'stock.write' then private.has_role(array['owner','head_store','pic'])
    when 'social.write' then private.has_role(array['owner','head_store','marketing'])
    when 'purchase.request' then private.has_role(array['owner','head_store','pic','pelaksana'])
    when 'purchase.manage' then private.has_role(array['owner','head_store'])
    when 'purchase.receive' then private.has_role(array['owner','head_store','pic'])
    when 'purchase.approve.limited' then private.has_role(array['head_store'])
    when 'purchase.approve.full' then private.has_role(array['owner'])
    when 'finance.read' then private.has_role(array['owner','head_store'])
    when 'finance.ap.write' then private.has_role(array['owner','head_store'])
    when 'hr.manage' then private.has_role(array['owner','head_store'])
    when 'shift.manage' then private.has_role(array['owner','head_store','pic'])
    when 'marketing.manage' then private.has_role(array['owner','head_store','marketing'])
    when 'team.manage' then private.has_role(array['owner'])
    when 'settings.manage' then private.has_role(array['owner'])
    when 'audit.read' then private.has_role(array['owner'])
    else false
  end;
$$;

revoke execute on function private.has_capability(text) from public,anon;
grant execute on function private.has_capability(text) to authenticated;

insert into public.business_settings(brand_id,setting_key,setting_value,category,description)
select b.id,'attendance_grace_minutes','10'::jsonb,'hr','Minutes after scheduled start before attendance is late'
from public.brands b
where lower(btrim(b.name))='hasnaria'
  and not exists (
    select 1 from public.business_settings s
    where s.brand_id=b.id
      and lower(btrim(s.setting_key))='attendance_grace_minutes'
  );

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  employee_no text not null,
  full_name text not null,
  job_title text,
  employment_type text not null default 'employee',
  status text not null default 'active',
  hire_date date,
  end_date date,
  phone text,
  emergency_contact text,
  monthly_salary numeric,
  hourly_rate numeric,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_no_nonempty check (btrim(employee_no)<>''),
  constraint employees_name_nonempty check (btrim(full_name)<>''),
  constraint employees_type_check check (employment_type in ('employee','part_time','contract','intern')),
  constraint employees_status_check check (status in ('active','inactive','terminated')),
  constraint employees_dates_check check (end_date is null or hire_date is null or end_date>=hire_date),
  constraint employees_salary_nonnegative check (
    (monthly_salary is null or monthly_salary>=0)
    and (hourly_rate is null or hourly_rate>=0)
  )
);

create unique index if not exists employees_brand_no_uidx
  on public.employees(brand_id,lower(btrim(employee_no)));
create unique index if not exists employees_brand_user_uidx
  on public.employees(brand_id,user_id)
  where user_id is not null;
create index if not exists employees_outlet_idx on public.employees(outlet_id);
create index if not exists employees_created_by_idx on public.employees(created_by);

alter table public.employees enable row level security;

create policy employees_read_self_or_hr
on public.employees for select to authenticated
using (
  (select private.same_brand(employees.brand_id))
  and (
    employees.user_id=(select auth.uid())
    or (select private.has_capability('hr.manage'))
  )
);

create policy employees_hr_insert
on public.employees for insert to authenticated
with check (
  (select private.same_brand(employees.brand_id))
  and (select private.has_capability('hr.manage'))
  and (
    employees.outlet_id is null
    or exists (
      select 1 from public.outlets o
      where o.id=employees.outlet_id and o.brand_id=employees.brand_id
    )
  )
);

create policy employees_hr_update
on public.employees for update to authenticated
using (
  (select private.same_brand(employees.brand_id))
  and (select private.has_capability('hr.manage'))
)
with check (
  (select private.same_brand(employees.brand_id))
  and (select private.has_capability('hr.manage'))
  and (
    employees.outlet_id is null
    or exists (
      select 1 from public.outlets o
      where o.id=employees.outlet_id and o.brand_id=employees.brand_id
    )
  )
);

grant select,insert,update on public.employees to authenticated;

create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete cascade,
  code text not null,
  name text not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_templates_code_nonempty check (btrim(code)<>''),
  constraint shift_templates_name_nonempty check (btrim(name)<>''),
  constraint shift_templates_break_nonnegative check (break_minutes>=0)
);

create unique index if not exists shift_templates_brand_code_uidx
  on public.shift_templates(brand_id,lower(btrim(code)));
create index if not exists shift_templates_outlet_idx on public.shift_templates(outlet_id);
create index if not exists shift_templates_created_by_idx on public.shift_templates(created_by);

alter table public.shift_templates enable row level security;

create policy shift_templates_read_same_brand
on public.shift_templates for select to authenticated
using ((select private.same_brand(shift_templates.brand_id)));

create policy shift_templates_manage_insert
on public.shift_templates for insert to authenticated
with check (
  (select private.same_brand(shift_templates.brand_id))
  and (select private.has_capability('shift.manage'))
);

create policy shift_templates_manage_update
on public.shift_templates for update to authenticated
using (
  (select private.same_brand(shift_templates.brand_id))
  and (select private.has_capability('shift.manage'))
)
with check (
  (select private.same_brand(shift_templates.brand_id))
  and (select private.has_capability('shift.manage'))
);

grant select,insert,update on public.shift_templates to authenticated;

create table if not exists public.shift_roster (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  shift_date date not null,
  status text not null default 'scheduled',
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_roster_status_check check (status in ('scheduled','off','leave','cancelled'))
);

create unique index if not exists shift_roster_employee_date_uidx
  on public.shift_roster(employee_id,shift_date);
create index if not exists shift_roster_outlet_date_idx
  on public.shift_roster(outlet_id,shift_date);
create index if not exists shift_roster_template_idx on public.shift_roster(shift_template_id);
create index if not exists shift_roster_created_by_idx on public.shift_roster(created_by);

alter table public.shift_roster enable row level security;

create policy shift_roster_read_same_brand
on public.shift_roster for select to authenticated
using ((select private.same_brand(shift_roster.brand_id)));

create policy shift_roster_manage_insert
on public.shift_roster for insert to authenticated
with check (
  (select private.same_brand(shift_roster.brand_id))
  and (select private.has_capability('shift.manage'))
);

create policy shift_roster_manage_update
on public.shift_roster for update to authenticated
using (
  (select private.same_brand(shift_roster.brand_id))
  and (select private.has_capability('shift.manage'))
)
with check (
  (select private.same_brand(shift_roster.brand_id))
  and (select private.has_capability('shift.manage'))
);

grant select,insert,update on public.shift_roster to authenticated;

create or replace function private.guard_shift_roster()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_employee public.employees%rowtype;
  v_template public.shift_templates%rowtype;
begin
  select * into v_employee from public.employees where id=new.employee_id;
  if not found or v_employee.brand_id<>new.brand_id then
    raise exception 'Employee belongs to another brand';
  end if;
  if new.outlet_id is null or not exists (
    select 1 from public.outlets o
    where o.id=new.outlet_id and o.brand_id=new.brand_id and o.active
  ) then
    raise exception 'Roster outlet is invalid';
  end if;
  if new.shift_template_id is not null then
    select * into v_template from public.shift_templates where id=new.shift_template_id;
    if not found or v_template.brand_id<>new.brand_id then
      raise exception 'Shift template belongs to another brand';
    end if;
    if v_template.outlet_id is not null and v_template.outlet_id<>new.outlet_id then
      raise exception 'Shift template is assigned to another outlet';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

revoke execute on function private.guard_shift_roster()
  from public,anon,authenticated;

create trigger trg_guard_shift_roster
before insert or update on public.shift_roster
for each row execute function private.guard_shift_roster();

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  roster_id uuid references public.shift_roster(id) on delete set null,
  attendance_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text not null default 'present',
  source text not null default 'self',
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_status_check check (status in ('present','late','absent','leave')),
  constraint attendance_source_check check (source in ('self','manager','import','system')),
  constraint attendance_time_order check (
    check_out_at is null or check_in_at is null or check_out_at>=check_in_at
  )
);

create unique index if not exists attendance_employee_date_uidx
  on public.attendance(employee_id,attendance_date);
create index if not exists attendance_brand_date_idx
  on public.attendance(brand_id,attendance_date);
create index if not exists attendance_outlet_date_idx
  on public.attendance(outlet_id,attendance_date);
create index if not exists attendance_roster_idx on public.attendance(roster_id);
create index if not exists attendance_created_by_idx on public.attendance(created_by);

alter table public.attendance enable row level security;

create policy attendance_read_self_or_shift
on public.attendance for select to authenticated
using (
  (select private.same_brand(attendance.brand_id))
  and (
    exists (
      select 1 from public.employees e
      where e.id=attendance.employee_id and e.user_id=(select auth.uid())
    )
    or (select private.has_capability('shift.manage'))
    or (select private.has_capability('hr.manage'))
  )
);

grant select on public.attendance to authenticated;

create or replace function private.my_employee()
returns public.employees
language sql stable security definer set search_path=''
as $$
  select e
  from public.employees e
  join public.user_profiles p on p.id=auth.uid()
  where e.user_id=auth.uid()
    and e.brand_id=p.brand_id
    and e.status='active'
    and p.status='active'
  limit 1;
$$;

revoke execute on function private.my_employee()
  from public,anon,authenticated;

create or replace function private.attendance_check_in(p_notes text)
returns public.attendance
language plpgsql security definer set search_path=''
as $$
declare
  v_emp public.employees%rowtype;
  v_roster public.shift_roster%rowtype;
  v_template public.shift_templates%rowtype;
  v_row public.attendance%rowtype;
  v_grace integer:=10;
  v_local_now timestamp;
  v_scheduled timestamp;
  v_status text:='present';
begin
  v_emp:=private.my_employee();
  if v_emp.id is null then raise exception 'Active employee profile linked to this user is required'; end if;

  select * into v_roster
  from public.shift_roster
  where employee_id=v_emp.id
    and shift_date=current_date
    and status='scheduled'
  limit 1;

  if not found then raise exception 'No scheduled shift for today'; end if;

  select * into v_template from public.shift_templates
  where id=v_roster.shift_template_id;

  select coalesce((setting_value #>> '{}')::integer,10)
    into v_grace
  from public.business_settings
  where brand_id=v_emp.brand_id
    and lower(btrim(setting_key))='attendance_grace_minutes';

  v_local_now:=timezone('Asia/Jakarta',now());
  v_scheduled:=v_roster.shift_date::timestamp+v_template.start_time;

  if v_local_now>v_scheduled+make_interval(mins=>coalesce(v_grace,10)) then
    v_status:='late';
  end if;

  insert into public.attendance(
    brand_id,outlet_id,employee_id,roster_id,attendance_date,
    check_in_at,status,source,notes,created_by
  ) values(
    v_emp.brand_id,v_roster.outlet_id,v_emp.id,v_roster.id,current_date,
    now(),v_status,'self',p_notes,auth.uid()
  )
  on conflict (employee_id,attendance_date) do update
  set check_in_at=coalesce(public.attendance.check_in_at,excluded.check_in_at),
      status=case
        when public.attendance.check_in_at is null then excluded.status
        else public.attendance.status
      end,
      notes=coalesce(excluded.notes,public.attendance.notes),
      updated_at=now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function private.attendance_check_in(text) from public,anon;
grant execute on function private.attendance_check_in(text) to authenticated;

create or replace function public.attendance_check_in(p_notes text default null)
returns public.attendance
language sql security invoker set search_path=''
as $$ select private.attendance_check_in(p_notes); $$;

revoke execute on function public.attendance_check_in(text) from public,anon;
grant execute on function public.attendance_check_in(text) to authenticated;

create or replace function private.attendance_check_out(p_notes text)
returns public.attendance
language plpgsql security definer set search_path=''
as $$
declare
  v_emp public.employees%rowtype;
  v_row public.attendance%rowtype;
begin
  v_emp:=private.my_employee();
  if v_emp.id is null then raise exception 'Active employee profile linked to this user is required'; end if;

  update public.attendance
  set check_out_at=now(),
      notes=coalesce(p_notes,notes),
      updated_at=now()
  where employee_id=v_emp.id
    and attendance_date=current_date
    and check_in_at is not null
    and check_out_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Open attendance record for today not found';
  end if;

  return v_row;
end;
$$;

revoke execute on function private.attendance_check_out(text) from public,anon;
grant execute on function private.attendance_check_out(text) to authenticated;

create or replace function public.attendance_check_out(p_notes text default null)
returns public.attendance
language sql security invoker set search_path=''
as $$ select private.attendance_check_out(p_notes); $$;

revoke execute on function public.attendance_check_out(text) from public,anon;
grant execute on function public.attendance_check_out(text) to authenticated;

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type text not null,
  date_from date not null,
  date_to date not null,
  reason text not null,
  status text not null default 'draft',
  requested_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  submitted_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_type_nonempty check (btrim(leave_type)<>''),
  constraint leave_requests_reason_nonempty check (btrim(reason)<>''),
  constraint leave_requests_dates_check check (date_to>=date_from),
  constraint leave_requests_status_check check (
    status in ('draft','pending_approval','approved','rejected','cancelled')
  )
);

create index if not exists leave_requests_brand_status_idx
  on public.leave_requests(brand_id,status,date_from);
create index if not exists leave_requests_employee_idx
  on public.leave_requests(employee_id,date_from);
create index if not exists leave_requests_requested_by_idx on public.leave_requests(requested_by);
create index if not exists leave_requests_approved_by_idx on public.leave_requests(approved_by);

alter table public.leave_requests enable row level security;

create policy leave_requests_read_self_or_hr
on public.leave_requests for select to authenticated
using (
  (select private.same_brand(leave_requests.brand_id))
  and (
    leave_requests.requested_by=(select auth.uid())
    or (select private.has_capability('hr.manage'))
  )
);

create policy leave_requests_insert_self
on public.leave_requests for insert to authenticated
with check (
  (select private.same_brand(leave_requests.brand_id))
  and leave_requests.requested_by=(select auth.uid())
  and leave_requests.status='draft'
  and exists (
    select 1 from public.employees e
    where e.id=leave_requests.employee_id
      and e.user_id=(select auth.uid())
      and e.brand_id=leave_requests.brand_id
  )
);

create policy leave_requests_update_self_draft
on public.leave_requests for update to authenticated
using (
  leave_requests.requested_by=(select auth.uid())
  and leave_requests.status='draft'
)
with check (
  leave_requests.requested_by=(select auth.uid())
  and leave_requests.status='draft'
);

grant select,insert,update on public.leave_requests to authenticated;

-- Default leave approval: Head Store, with Owner override through approval engine.
insert into public.approval_rules(
  brand_id,transaction_type,category,requester_role,
  min_amount,max_amount,approver_role,priority,active
)
select b.id,'leave_request',null,null,0,null,'head_store',50,true
from public.brands b
where lower(btrim(b.name))='hasnaria'
  and not exists (
    select 1 from public.approval_rules r
    where r.brand_id=b.id
      and r.transaction_type='leave_request'
      and r.requester_role is null
  );

create or replace function private.submit_leave_request(p_leave_id uuid)
returns public.leave_requests
language plpgsql security definer set search_path=''
as $$
declare
  v_leave public.leave_requests%rowtype;
  v_approval public.approval_requests%rowtype;
begin
  select * into v_leave
  from public.leave_requests
  where id=p_leave_id for update;

  if not found then raise exception 'Leave request not found'; end if;
  if v_leave.requested_by<>auth.uid() then raise exception 'Only requester can submit leave'; end if;
  if v_leave.status<>'draft' then raise exception 'Only draft leave can be submitted'; end if;

  v_approval:=private.create_approval_request(
    v_leave.brand_id,null,'leave_request',v_leave.id,0,null,
    jsonb_build_object(
      'employee_id',v_leave.employee_id,
      'date_from',v_leave.date_from,
      'date_to',v_leave.date_to,
      'leave_type',v_leave.leave_type
    )
  );

  update public.leave_requests
  set status='pending_approval',submitted_at=now(),updated_at=now()
  where id=v_leave.id
  returning * into v_leave;

  return v_leave;
end;
$$;

revoke execute on function private.submit_leave_request(uuid) from public,anon;
grant execute on function private.submit_leave_request(uuid) to authenticated;

create or replace function public.submit_leave_request(p_leave_id uuid)
returns public.leave_requests
language sql security invoker set search_path=''
as $$ select private.submit_leave_request(p_leave_id); $$;

revoke execute on function public.submit_leave_request(uuid) from public,anon;
grant execute on function public.submit_leave_request(uuid) to authenticated;

-- Extend approval engine for leave decisions.
create or replace function private.decide_approval_request(
  p_request_id uuid,
  p_action text,
  p_reason text default null
)
returns public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_requests%rowtype;
  v_action text:=lower(btrim(coalesce(p_action,'')));
begin
  if v_action not in ('approved','rejected') then raise exception 'Unsupported approval action'; end if;
  if v_action='rejected' and nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Rejection reason is required';
  end if;
  if not exists(select 1 from public.user_profiles where id=auth.uid() and status='active') then
    raise exception 'Active profile required';
  end if;

  select * into v_request
  from public.approval_requests where id=p_request_id for update;

  if not found then raise exception 'Approval request not found'; end if;
  if not private.same_brand(v_request.brand_id) then raise exception 'Approval request is outside your brand'; end if;
  if v_request.status<>'pending' then raise exception 'Approval request is no longer pending'; end if;
  if v_request.requested_by=auth.uid() then raise exception 'Self-approval is not allowed'; end if;
  if not private.can_act_as_approver(v_request.brand_id,v_request.approver_role) then
    raise exception 'You are not an authorized approver for this request';
  end if;

  update public.approval_requests
  set status=v_action,resolved_by=auth.uid(),resolved_at=now(),
      decision_reason=nullif(btrim(coalesce(p_reason,'')),'')
  where id=v_request.id
  returning * into v_request;

  insert into public.approval_history(
    approval_request_id,action,actor_id,reason,metadata
  ) values(
    v_request.id,v_request.status,auth.uid(),v_request.decision_reason,
    jsonb_build_object('approver_role',v_request.approver_role)
  );

  if v_request.entity_type='purchase_request' then
    update public.purchase_requests
    set status=case when v_request.status='approved' then 'approved' else 'rejected' end,
        approved_at=case when v_request.status='approved' then now() else approved_at end,
        rejected_at=case when v_request.status='rejected' then now() else rejected_at end,
        updated_at=now()
    where id=v_request.entity_id;
  elsif v_request.entity_type='leave_request' then
    update public.leave_requests
    set status=case when v_request.status='approved' then 'approved' else 'rejected' end,
        approved_by=case when v_request.status='approved' then auth.uid() else approved_by end,
        approved_at=case when v_request.status='approved' then now() else approved_at end,
        rejected_at=case when v_request.status='rejected' then now() else rejected_at end,
        decision_reason=v_request.decision_reason,
        updated_at=now()
    where id=v_request.entity_id;
  end if;

  perform private.write_audit_log(
    v_request.brand_id,v_request.outlet_id,'approval_request',v_request.id,
    v_request.status,auth.uid(),
    jsonb_build_object('status','pending'),
    jsonb_build_object('status',v_request.status,'resolved_by',auth.uid(),'resolved_at',v_request.resolved_at),
    v_request.decision_reason,
    jsonb_build_object('entity_type',v_request.entity_type,'entity_id',v_request.entity_id,'approver_role',v_request.approver_role)
  );

  return v_request;
end;
$$;

revoke execute on function private.decide_approval_request(uuid,text,text)
  from public,anon;
grant execute on function private.decide_approval_request(uuid,text,text)
  to authenticated;

create table if not exists public.overtime_records (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  minutes integer not null,
  reason text not null,
  status text not null default 'recorded',
  approved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint overtime_minutes_positive check (minutes>0),
  constraint overtime_reason_nonempty check (btrim(reason)<>''),
  constraint overtime_status_check check (status in ('recorded','approved','rejected'))
);

create index if not exists overtime_employee_date_idx
  on public.overtime_records(employee_id,work_date);
create index if not exists overtime_approved_by_idx on public.overtime_records(approved_by);
create index if not exists overtime_created_by_idx on public.overtime_records(created_by);

alter table public.overtime_records enable row level security;

create policy overtime_read_self_or_hr
on public.overtime_records for select to authenticated
using (
  (select private.same_brand(overtime_records.brand_id))
  and (
    exists (
      select 1 from public.employees e
      where e.id=overtime_records.employee_id and e.user_id=(select auth.uid())
    )
    or (select private.has_capability('hr.manage'))
  )
);

create policy overtime_hr_insert
on public.overtime_records for insert to authenticated
with check (
  (select private.same_brand(overtime_records.brand_id))
  and (select private.has_capability('hr.manage'))
);

create policy overtime_hr_update
on public.overtime_records for update to authenticated
using (
  (select private.same_brand(overtime_records.brand_id))
  and (select private.has_capability('hr.manage'))
)
with check (
  (select private.same_brand(overtime_records.brand_id))
  and (select private.has_capability('hr.manage'))
);

grant select,insert,update on public.overtime_records to authenticated;

create table if not exists public.training_records (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  training_name text not null,
  completed_date date,
  expires_date date,
  status text not null default 'assigned',
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint training_name_nonempty check (btrim(training_name)<>''),
  constraint training_status_check check (status in ('assigned','completed','expired','waived')),
  constraint training_dates_check check (
    expires_date is null or completed_date is null or expires_date>=completed_date
  )
);

create index if not exists training_employee_idx on public.training_records(employee_id);
create index if not exists training_created_by_idx on public.training_records(created_by);

alter table public.training_records enable row level security;

create policy training_read_self_or_hr
on public.training_records for select to authenticated
using (
  (select private.same_brand(training_records.brand_id))
  and (
    exists (
      select 1 from public.employees e
      where e.id=training_records.employee_id and e.user_id=(select auth.uid())
    )
    or (select private.has_capability('hr.manage'))
  )
);

create policy training_hr_write
on public.training_records for all to authenticated
using (
  (select private.same_brand(training_records.brand_id))
  and (select private.has_capability('hr.manage'))
)
with check (
  (select private.same_brand(training_records.brand_id))
  and (select private.has_capability('hr.manage'))
);

grant select,insert,update,delete on public.training_records to authenticated;

create or replace view public.workforce_daily_kpis
with (security_invoker=true)
as
with worked as (
  select
    a.brand_id,
    a.outlet_id,
    a.attendance_date,
    count(*) filter (where a.status in ('present','late')) as present_count,
    count(*) filter (where a.status='late') as late_count,
    sum(
      case when a.check_in_at is not null and a.check_out_at is not null
        then extract(epoch from (a.check_out_at-a.check_in_at))/3600
        else 0 end
    ) as worked_hours
  from public.attendance a
  group by a.brand_id,a.outlet_id,a.attendance_date
),
headcount as (
  select brand_id,count(*) as active_headcount
  from public.employees where status='active'
  group by brand_id
)
select
  w.brand_id,w.outlet_id,w.attendance_date,
  coalesce(h.active_headcount,0) as active_headcount,
  w.present_count,w.late_count,w.worked_hours,
  coalesce(s.revenue,0) as revenue,
  case when w.worked_hours>0 then coalesce(s.revenue,0)/w.worked_hours else null end as sales_per_worked_hour
from worked w
left join headcount h on h.brand_id=w.brand_id
left join public.sales_daily_kpis s
  on s.brand_id=w.brand_id and s.metric_date=w.attendance_date;

grant select on public.workforce_daily_kpis to authenticated;

create or replace view public.payroll_input_summary
with (security_invoker=true)
as
with att as (
  select
    e.brand_id,e.id as employee_id,e.employee_no,e.full_name,
    date_trunc('month',a.attendance_date)::date as month,
    count(*) filter (where a.status in ('present','late')) as days_present,
    count(*) filter (where a.status='late') as late_days,
    sum(
      case when a.check_in_at is not null and a.check_out_at is not null
        then extract(epoch from (a.check_out_at-a.check_in_at))/3600
        else 0 end
    ) as worked_hours
  from public.employees e
  left join public.attendance a on a.employee_id=e.id
  group by e.brand_id,e.id,e.employee_no,e.full_name,date_trunc('month',a.attendance_date)
),
ot as (
  select
    employee_id,date_trunc('month',work_date)::date as month,
    sum(minutes) filter (where status in ('recorded','approved')) as overtime_minutes
  from public.overtime_records
  group by employee_id,date_trunc('month',work_date)
)
select
  a.brand_id,a.employee_id,a.employee_no,a.full_name,a.month,
  a.days_present,a.late_days,a.worked_hours,
  coalesce(o.overtime_minutes,0) as overtime_minutes
from att a
left join ot o on o.employee_id=a.employee_id and o.month=a.month
where a.month is not null;

grant select on public.payroll_input_summary to authenticated;

comment on table public.employees is 'Private HR employee master. Users can read only their own record unless they have HR management capability.';
comment on table public.attendance is 'Controlled self check-in/out attendance records with roster linkage.';
comment on table public.leave_requests is 'Employee leave request workflow integrated with generic approvals.';

commit;
