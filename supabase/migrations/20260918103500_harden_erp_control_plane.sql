-- Harden ERP control-plane after advisor review:
-- 1) public approval RPC becomes SECURITY INVOKER wrapper;
-- 2) privileged implementation moves to private schema;
-- 3) approval_rules write policies no longer duplicate SELECT policy;
-- 4) add covering indexes for new foreign keys.

begin;

drop function if exists public.decide_approval_request(uuid,text,text);

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
  v_role text;
  v_is_super boolean;
begin
  if lower(btrim(coalesce(p_action, ''))) not in ('approved','rejected') then
    raise exception 'Unsupported approval action';
  end if;

  select role, is_super_admin
    into v_role, v_is_super
  from public.user_profiles
  where id = auth.uid()
    and status = 'active';

  if v_role is null and coalesce(v_is_super, false) = false then
    raise exception 'Active profile required';
  end if;

  select *
    into v_request
  from public.approval_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Approval request not found';
  end if;

  if not private.same_brand(v_request.brand_id) then
    raise exception 'Approval request is outside your brand';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Approval request is no longer pending';
  end if;

  if v_request.requested_by = auth.uid() then
    raise exception 'Self-approval is not allowed';
  end if;

  if not coalesce(v_is_super, false)
     and v_role <> v_request.approver_role
     and not (v_role = 'owner' and v_request.approver_role = 'head_store') then
    raise exception 'You are not an authorized approver for this request';
  end if;

  update public.approval_requests
  set
    status = lower(btrim(p_action)),
    resolved_by = auth.uid(),
    resolved_at = now(),
    decision_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_request.id
  returning * into v_request;

  insert into public.approval_history (
    approval_request_id, action, actor_id, reason
  ) values (
    v_request.id, v_request.status, auth.uid(), v_request.decision_reason
  );

  perform private.write_audit_log(
    v_request.brand_id,
    v_request.outlet_id,
    'approval_request',
    v_request.id,
    v_request.status,
    auth.uid(),
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', v_request.status,
      'resolved_by', auth.uid(),
      'resolved_at', v_request.resolved_at
    ),
    v_request.decision_reason,
    jsonb_build_object(
      'entity_type', v_request.entity_type,
      'entity_id', v_request.entity_id
    )
  );

  return v_request;
end;
$$;

revoke execute on function private.decide_approval_request(uuid,text,text)
  from public, anon;
grant execute on function private.decide_approval_request(uuid,text,text)
  to authenticated;

create or replace function public.decide_approval_request(
  p_request_id uuid,
  p_action text,
  p_reason text default null
)
returns public.approval_requests
language sql
security invoker
set search_path = ''
as $$
  select private.decide_approval_request(p_request_id, p_action, p_reason);
$$;

revoke execute on function public.decide_approval_request(uuid,text,text)
  from public, anon;
grant execute on function public.decide_approval_request(uuid,text,text)
  to authenticated;

drop policy if exists approval_rules_owner_write on public.approval_rules;

drop policy if exists approval_rules_owner_insert on public.approval_rules;
create policy approval_rules_owner_insert
on public.approval_rules
for insert to authenticated
with check (
  (select private.same_brand(approval_rules.brand_id))
  and (
    (select private.has_capability('settings.manage'))
    or (select private.is_super_admin())
  )
);

drop policy if exists approval_rules_owner_update on public.approval_rules;
create policy approval_rules_owner_update
on public.approval_rules
for update to authenticated
using (
  (select private.same_brand(approval_rules.brand_id))
  and (
    (select private.has_capability('settings.manage'))
    or (select private.is_super_admin())
  )
)
with check (
  (select private.same_brand(approval_rules.brand_id))
  and (
    (select private.has_capability('settings.manage'))
    or (select private.is_super_admin())
  )
);

drop policy if exists approval_rules_owner_delete on public.approval_rules;
create policy approval_rules_owner_delete
on public.approval_rules
for delete to authenticated
using (
  (select private.same_brand(approval_rules.brand_id))
  and (
    (select private.has_capability('settings.manage'))
    or (select private.is_super_admin())
  )
);

create index if not exists outlets_created_by_idx on public.outlets(created_by);
create index if not exists import_jobs_created_by_idx on public.import_jobs(created_by);
create index if not exists approval_rules_created_by_idx on public.approval_rules(created_by);
create index if not exists approval_requests_outlet_idx on public.approval_requests(outlet_id);
create index if not exists approval_requests_rule_idx on public.approval_requests(rule_id);
create index if not exists approval_requests_requested_by_idx on public.approval_requests(requested_by);
create index if not exists approval_requests_resolved_by_idx on public.approval_requests(resolved_by);
create index if not exists approval_history_actor_idx on public.approval_history(actor_id);
create index if not exists audit_logs_outlet_idx on public.audit_logs(outlet_id);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);
create index if not exists exception_events_outlet_idx on public.exception_events(outlet_id);
create index if not exists exception_events_ack_by_idx on public.exception_events(acknowledged_by);
create index if not exists exception_events_resolved_by_idx on public.exception_events(resolved_by);

commit;
