-- Approval delegation and automation run registry.

begin;

create table if not exists public.approval_delegations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  approver_role text not null,
  delegator_user_id uuid not null references auth.users(id) on delete cascade,
  delegate_user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  active boolean not null default true,
  reason text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,
  constraint approval_delegations_role_nonempty check (btrim(approver_role)<>''),
  constraint approval_delegations_period_check check (ends_at>starts_at),
  constraint approval_delegations_users_different check (delegator_user_id<>delegate_user_id),
  constraint approval_delegations_reason_nonempty check (btrim(reason)<>'')
);

create index if not exists approval_delegations_delegate_active_idx
  on public.approval_delegations(brand_id,delegate_user_id,approver_role,starts_at,ends_at)
  where active;
create index if not exists approval_delegations_delegator_idx
  on public.approval_delegations(delegator_user_id);
create index if not exists approval_delegations_created_by_idx
  on public.approval_delegations(created_by);
create index if not exists approval_delegations_revoked_by_idx
  on public.approval_delegations(revoked_by);

alter table public.approval_delegations enable row level security;

create policy approval_delegations_read_same_brand
on public.approval_delegations for select to authenticated
using ((select private.same_brand(approval_delegations.brand_id)));

grant select on public.approval_delegations to authenticated;

create or replace function private.can_act_as_approver(
  p_brand_id uuid,
  p_approver_role text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    private.is_super_admin()
    or private.is_owner()
    or exists (
      select 1
      from public.user_profiles p
      where p.id=auth.uid()
        and p.status='active'
        and p.brand_id=p_brand_id
        and p.role=p_approver_role
    )
    or exists (
      select 1
      from public.approval_delegations d
      join public.user_profiles delegator
        on delegator.id=d.delegator_user_id
      join public.user_profiles delegatee
        on delegatee.id=d.delegate_user_id
      where d.brand_id=p_brand_id
        and d.delegate_user_id=auth.uid()
        and d.approver_role=p_approver_role
        and d.active
        and now() between d.starts_at and d.ends_at
        and delegator.status='active'
        and delegator.brand_id=p_brand_id
        and delegator.role=p_approver_role
        and delegatee.status='active'
        and delegatee.brand_id=p_brand_id
    );
$$;

revoke execute on function private.can_act_as_approver(uuid,text)
  from public,anon,authenticated;

create or replace function private.create_approval_delegation(
  p_approver_role text,
  p_delegate_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
returns public.approval_delegations
language plpgsql
security definer
set search_path=''
as $$
declare
  v_me public.user_profiles%rowtype;
  v_delegate public.user_profiles%rowtype;
  v_row public.approval_delegations%rowtype;
begin
  select * into v_me
  from public.user_profiles
  where id=auth.uid() and status='active';

  if not found or v_me.brand_id is null then
    raise exception 'Active brand profile required';
  end if;

  if not private.is_owner() and v_me.role<>p_approver_role then
    raise exception 'Only the approver role or Owner may create this delegation';
  end if;

  select * into v_delegate
  from public.user_profiles
  where id=p_delegate_user_id
    and status='active'
    and brand_id=v_me.brand_id;

  if not found then
    raise exception 'Delegate must be an active user in the same brand';
  end if;

  if p_delegate_user_id=auth.uid() then
    raise exception 'Cannot delegate approval to yourself';
  end if;

  if coalesce(p_ends_at,now())<=coalesce(p_starts_at,now()) then
    raise exception 'Delegation end must be after start';
  end if;

  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Delegation reason is required';
  end if;

  insert into public.approval_delegations(
    brand_id,approver_role,delegator_user_id,delegate_user_id,
    starts_at,ends_at,active,reason,created_by
  ) values(
    v_me.brand_id,p_approver_role,auth.uid(),p_delegate_user_id,
    coalesce(p_starts_at,now()),p_ends_at,true,p_reason,auth.uid()
  )
  returning * into v_row;

  perform private.write_audit_log(
    v_row.brand_id,null,'approval_delegation',v_row.id,'created',
    auth.uid(),null,to_jsonb(v_row),p_reason,'{}'::jsonb
  );

  return v_row;
end;
$$;

revoke execute on function private.create_approval_delegation(text,uuid,timestamptz,timestamptz,text)
  from public,anon;
grant execute on function private.create_approval_delegation(text,uuid,timestamptz,timestamptz,text)
  to authenticated;

create or replace function public.create_approval_delegation(
  p_approver_role text,
  p_delegate_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
returns public.approval_delegations
language sql security invoker set search_path=''
as $$
  select private.create_approval_delegation(
    p_approver_role,p_delegate_user_id,p_starts_at,p_ends_at,p_reason
  );
$$;

revoke execute on function public.create_approval_delegation(text,uuid,timestamptz,timestamptz,text)
  from public,anon;
grant execute on function public.create_approval_delegation(text,uuid,timestamptz,timestamptz,text)
  to authenticated;

create or replace function private.revoke_approval_delegation(
  p_delegation_id uuid,
  p_reason text
)
returns public.approval_delegations
language plpgsql security definer set search_path=''
as $$
declare
  v_row public.approval_delegations%rowtype;
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Revocation reason is required';
  end if;

  select * into v_row
  from public.approval_delegations
  where id=p_delegation_id
  for update;

  if not found then raise exception 'Delegation not found'; end if;
  if not private.same_brand(v_row.brand_id) then
    raise exception 'Delegation is outside your brand';
  end if;
  if auth.uid()<>v_row.delegator_user_id and not private.is_owner() then
    raise exception 'Only delegator or Owner may revoke delegation';
  end if;

  update public.approval_delegations
  set active=false,revoked_by=auth.uid(),revoked_at=now(),revoke_reason=p_reason
  where id=v_row.id
  returning * into v_row;

  perform private.write_audit_log(
    v_row.brand_id,null,'approval_delegation',v_row.id,'revoked',
    auth.uid(),null,to_jsonb(v_row),p_reason,'{}'::jsonb
  );

  return v_row;
end;
$$;

revoke execute on function private.revoke_approval_delegation(uuid,text)
  from public,anon;
grant execute on function private.revoke_approval_delegation(uuid,text)
  to authenticated;

create or replace function public.revoke_approval_delegation(
  p_delegation_id uuid,p_reason text
)
returns public.approval_delegations
language sql security invoker set search_path=''
as $$ select private.revoke_approval_delegation(p_delegation_id,p_reason); $$;

revoke execute on function public.revoke_approval_delegation(uuid,text)
  from public,anon;
grant execute on function public.revoke_approval_delegation(uuid,text)
  to authenticated;

-- Approval decision now accepts active delegation.
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
  if v_action not in ('approved','rejected') then
    raise exception 'Unsupported approval action';
  end if;
  if v_action='rejected' and nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Rejection reason is required';
  end if;

  if not exists (
    select 1 from public.user_profiles
    where id=auth.uid() and status='active'
  ) then
    raise exception 'Active profile required';
  end if;

  select * into v_request
  from public.approval_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'Approval request not found'; end if;
  if not private.same_brand(v_request.brand_id) then
    raise exception 'Approval request is outside your brand';
  end if;
  if v_request.status<>'pending' then
    raise exception 'Approval request is no longer pending';
  end if;
  if v_request.requested_by=auth.uid() then
    raise exception 'Self-approval is not allowed';
  end if;
  if not private.can_act_as_approver(v_request.brand_id,v_request.approver_role) then
    raise exception 'You are not an authorized approver for this request';
  end if;

  update public.approval_requests
  set status=v_action,
      resolved_by=auth.uid(),
      resolved_at=now(),
      decision_reason=nullif(btrim(coalesce(p_reason,'')),'')
  where id=v_request.id
  returning * into v_request;

  insert into public.approval_history(
    approval_request_id,action,actor_id,reason,metadata
  ) values(
    v_request.id,v_request.status,auth.uid(),v_request.decision_reason,
    jsonb_build_object(
      'delegated',not exists (
        select 1 from public.user_profiles p
        where p.id=auth.uid() and p.role=v_request.approver_role
      )
    )
  );

  if v_request.entity_type='purchase_request' then
    update public.purchase_requests
    set status=case when v_request.status='approved' then 'approved' else 'rejected' end,
        approved_at=case when v_request.status='approved' then now() else approved_at end,
        rejected_at=case when v_request.status='rejected' then now() else rejected_at end,
        updated_at=now()
    where id=v_request.entity_id;
  end if;

  perform private.write_audit_log(
    v_request.brand_id,v_request.outlet_id,'approval_request',v_request.id,
    v_request.status,auth.uid(),
    jsonb_build_object('status','pending'),
    jsonb_build_object(
      'status',v_request.status,
      'resolved_by',auth.uid(),
      'resolved_at',v_request.resolved_at
    ),
    v_request.decision_reason,
    jsonb_build_object(
      'entity_type',v_request.entity_type,
      'entity_id',v_request.entity_id,
      'approver_role',v_request.approver_role
    )
  );

  return v_request;
end;
$$;

revoke execute on function private.decide_approval_request(uuid,text,text)
  from public,anon;
grant execute on function private.decide_approval_request(uuid,text,text)
  to authenticated;

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  job_key text not null,
  name text not null,
  schedule_description text,
  active boolean not null default true,
  owner_role text not null default 'owner',
  configuration jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_jobs_key_nonempty check (btrim(job_key)<>''),
  constraint automation_jobs_name_nonempty check (btrim(name)<>'')
);

create unique index if not exists automation_jobs_brand_key_uidx
  on public.automation_jobs(brand_id,lower(btrim(job_key)));
create index if not exists automation_jobs_created_by_idx
  on public.automation_jobs(created_by);

alter table public.automation_jobs enable row level security;

create policy automation_jobs_read_same_brand
on public.automation_jobs for select to authenticated
using ((select private.same_brand(automation_jobs.brand_id)));

create policy automation_jobs_owner_insert
on public.automation_jobs for insert to authenticated
with check (
  (select private.same_brand(automation_jobs.brand_id))
  and (select private.has_capability('settings.manage'))
);

create policy automation_jobs_owner_update
on public.automation_jobs for update to authenticated
using (
  (select private.same_brand(automation_jobs.brand_id))
  and (select private.has_capability('settings.manage'))
)
with check (
  (select private.same_brand(automation_jobs.brand_id))
  and (select private.has_capability('settings.manage'))
);

grant select,insert,update on public.automation_jobs to authenticated;

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.automation_jobs(id) on delete cascade,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  triggered_by uuid references auth.users(id) on delete set null,
  constraint automation_runs_status_check check (
    status in ('running','success','failed','skipped')
  )
);

create index if not exists automation_runs_job_started_idx
  on public.automation_runs(job_id,started_at desc);
create index if not exists automation_runs_triggered_by_idx
  on public.automation_runs(triggered_by);

alter table public.automation_runs enable row level security;

create policy automation_runs_read_same_brand
on public.automation_runs for select to authenticated
using (
  exists (
    select 1 from public.automation_jobs j
    where j.id=automation_runs.job_id
      and (select private.same_brand(j.brand_id))
  )
);

grant select on public.automation_runs to authenticated;

insert into public.automation_jobs(
  brand_id,job_key,name,schedule_description,configuration
)
select b.id,x.job_key,x.name,x.schedule_description,x.configuration::jsonb
from public.brands b
cross join (values
  ('daily_alert_refresh','Daily Alert Refresh','Daily business-alert evaluation','{"view":"business_alerts"}'),
  ('daily_owner_digest','Daily Owner Digest','Daily executive digest preparation','{"view":"executive_dashboard_snapshot"}'),
  ('approval_sla_watch','Approval SLA Watch','Hourly pending approval SLA evaluation','{"view":"approval_queue"}')
) x(job_key,name,schedule_description,configuration)
where lower(btrim(b.name))='hasnaria'
on conflict (brand_id,lower(btrim(job_key))) do nothing;

comment on table public.approval_delegations is
  'Time-bounded, auditable approval delegation; decisions still prohibit self-approval.';
comment on table public.automation_jobs is
  'Registry for scheduled/background ERP jobs. Actual scheduler may be external.';
comment on table public.automation_runs is
  'Execution history/status for scheduled/background ERP jobs.';

commit;
