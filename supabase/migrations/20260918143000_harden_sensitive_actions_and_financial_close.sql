-- ERP controls hardening: sensitive reasons, approval SLA queue and financial close enforcement.

begin;

create or replace function private.assert_accounting_period_open(
  p_brand_id uuid,
  p_business_date date
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if exists (
    select 1
    from public.accounting_periods ap
    where ap.brand_id=p_brand_id
      and p_business_date between ap.period_start and ap.period_end
      and ap.status='closed'
  ) then
    raise exception 'Accounting period is closed for date %',p_business_date;
  end if;
end;
$$;

revoke execute on function private.assert_accounting_period_open(uuid,date)
  from public,anon,authenticated;

-- Reject decisions require a reason. Approval reason remains optional.
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
  v_action text:=lower(btrim(coalesce(p_action,'')));
begin
  if v_action not in ('approved','rejected') then
    raise exception 'Unsupported approval action';
  end if;

  if v_action='rejected' and nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Rejection reason is required';
  end if;

  select role,is_super_admin into v_role,v_is_super
  from public.user_profiles
  where id=auth.uid() and status='active';

  if v_role is null and coalesce(v_is_super,false)=false then
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

  if not coalesce(v_is_super,false)
     and v_role<>v_request.approver_role
     and not (v_role='owner' and v_request.approver_role='head_store') then
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
    approval_request_id,action,actor_id,reason
  ) values(
    v_request.id,v_request.status,auth.uid(),v_request.decision_reason
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
      'entity_id',v_request.entity_id
    )
  );

  return v_request;
end;
$$;

revoke execute on function private.decide_approval_request(uuid,text,text)
  from public,anon;
grant execute on function private.decide_approval_request(uuid,text,text)
  to authenticated;

-- Manual waste/adjustment requires a clear reason.
create or replace function private.post_manual_inventory_movement(
  p_inventory_item_id uuid,
  p_outlet_id uuid,
  p_movement_type text,
  p_qty_delta numeric,
  p_movement_date date,
  p_unit_cost numeric,
  p_notes text,
  p_source_key text
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_items%rowtype;
  v_row public.inventory_movements%rowtype;
  v_type text:=upper(btrim(coalesce(p_movement_type,'')));
  v_date date:=coalesce(p_movement_date,current_date);
  v_current_qty numeric;
  v_last_opname date;
begin
  if not private.can_stock_write() then
    raise exception 'Stock write permission required';
  end if;

  if v_type not in ('WASTE','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT') then
    raise exception 'Unsupported manual inventory movement type';
  end if;

  if v_type in ('WASTE','ADJUSTMENT')
     and nullif(btrim(coalesce(p_notes,'')),'') is null then
    raise exception 'Reason/notes are required for waste or adjustment';
  end if;

  if p_qty_delta is null or p_qty_delta=0 then
    raise exception 'Quantity delta must be non-zero';
  end if;
  if v_type='WASTE' and p_qty_delta>=0 then
    raise exception 'Waste must use a negative quantity';
  end if;
  if v_type='TRANSFER_IN' and p_qty_delta<=0 then
    raise exception 'Transfer in must use a positive quantity';
  end if;
  if v_type='TRANSFER_OUT' and p_qty_delta>=0 then
    raise exception 'Transfer out must use a negative quantity';
  end if;
  if v_date>current_date then
    raise exception 'Future-dated manual inventory movement is not allowed';
  end if;

  select * into v_item
  from public.inventory_items
  where id=p_inventory_item_id;

  if not found or not private.same_brand(v_item.brand_id) then
    raise exception 'Inventory item not found in your brand';
  end if;

  perform private.assert_accounting_period_open(v_item.brand_id,v_date);

  if p_outlet_id is not null and not exists(
    select 1 from public.outlets o
    where o.id=p_outlet_id
      and o.brand_id=v_item.brand_id
      and o.active
  ) then
    raise exception 'Outlet is invalid or inactive for this brand';
  end if;

  select max(opname_date) into v_last_opname
  from public.inventory_stock_opname
  where inventory_item_id=p_inventory_item_id
    and opname_date<=v_date;

  if v_last_opname is null then
    raise exception 'Physical stock opname is required before manual stock movements';
  end if;
  if v_date<=v_last_opname then
    raise exception 'Movement date must be after the latest stock opname date';
  end if;

  v_current_qty:=private.inventory_ledger_qty_as_of(p_inventory_item_id,v_date);

  if p_qty_delta<0 and v_current_qty+p_qty_delta<0 then
    raise exception 'Movement would create negative inventory';
  end if;

  insert into public.inventory_movements(
    brand_id,outlet_id,inventory_item_id,movement_date,movement_type,
    qty_delta,unit_cost,reference_type,source_key,
    system_generated,notes,created_by
  ) values(
    v_item.brand_id,p_outlet_id,p_inventory_item_id,v_date,v_type,
    p_qty_delta,p_unit_cost,'manual',
    nullif(btrim(coalesce(p_source_key,'')),''),
    false,p_notes,auth.uid()
  )
  returning * into v_row;

  perform private.write_audit_log(
    v_item.brand_id,p_outlet_id,'inventory_movement',v_row.id,
    'created',auth.uid(),null,to_jsonb(v_row),p_notes,
    jsonb_build_object('movement_type',v_row.movement_type)
  );

  return v_row;
end;
$$;

revoke execute on function private.post_manual_inventory_movement(uuid,uuid,text,numeric,date,numeric,text,text)
  from public,anon;
grant execute on function private.post_manual_inventory_movement(uuid,uuid,text,numeric,date,numeric,text,text)
  to authenticated;

-- Reopening a financial period always needs an explicit reason.
create or replace function private.set_accounting_period_status(
  p_period_id uuid,
  p_status text,
  p_note text
)
returns public.accounting_periods
language plpgsql
security definer
set search_path=''
as $$
declare
  v_period public.accounting_periods%rowtype;
  v_status text:=lower(btrim(coalesce(p_status,'')));
begin
  if not private.has_capability('settings.manage') then
    raise exception 'Owner permission required';
  end if;
  if v_status not in ('open','closed') then
    raise exception 'Unsupported period status';
  end if;
  if v_status='open' and nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'Reopen reason is required';
  end if;

  select * into v_period
  from public.accounting_periods
  where id=p_period_id
  for update;

  if not found then raise exception 'Accounting period not found'; end if;
  if not private.same_brand(v_period.brand_id) then
    raise exception 'Accounting period is outside your brand';
  end if;
  if v_status=v_period.status then return v_period; end if;

  update public.accounting_periods
  set status=v_status,
      closed_by=case when v_status='closed' then auth.uid() else closed_by end,
      closed_at=case when v_status='closed' then now() else closed_at end,
      close_note=case when v_status='closed' then p_note else close_note end,
      reopened_by=case when v_status='open' then auth.uid() else reopened_by end,
      reopened_at=case when v_status='open' then now() else reopened_at end,
      reopen_note=case when v_status='open' then p_note else reopen_note end
  where id=v_period.id
  returning * into v_period;

  perform private.write_audit_log(
    v_period.brand_id,null,'accounting_period',v_period.id,
    case when v_status='closed' then 'closed' else 'reopened' end,
    auth.uid(),null,to_jsonb(v_period),p_note,'{}'::jsonb
  );

  return v_period;
end;
$$;

revoke execute on function private.set_accounting_period_status(uuid,text,text)
  from public,anon;
grant execute on function private.set_accounting_period_status(uuid,text,text)
  to authenticated;

-- Closed periods block financial transaction changes.
create or replace function private.guard_expense_open_period()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid:=coalesce(new.brand_id,old.brand_id);
  v_date date:=coalesce(new.expense_date,old.expense_date);
begin
  perform private.assert_accounting_period_open(v_brand,v_date);
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke execute on function private.guard_expense_open_period()
  from public,anon,authenticated;
drop trigger if exists trg_expense_open_period on public.expenses;
create trigger trg_expense_open_period
before insert or update or delete on public.expenses
for each row execute function private.guard_expense_open_period();

create or replace function private.guard_purchase_invoice_open_period()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  perform private.assert_accounting_period_open(
    coalesce(new.brand_id,old.brand_id),
    coalesce(new.invoice_date,old.invoice_date)
  );
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke execute on function private.guard_purchase_invoice_open_period()
  from public,anon,authenticated;
drop trigger if exists trg_purchase_invoice_open_period on public.purchase_invoices;
create trigger trg_purchase_invoice_open_period
before insert or update or delete on public.purchase_invoices
for each row execute function private.guard_purchase_invoice_open_period();

create or replace function private.guard_purchase_payment_open_period()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  perform private.assert_accounting_period_open(
    coalesce(new.brand_id,old.brand_id),
    coalesce(new.payment_date,old.payment_date)
  );
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke execute on function private.guard_purchase_payment_open_period()
  from public,anon,authenticated;
drop trigger if exists trg_purchase_payment_open_period on public.purchase_payments;
create trigger trg_purchase_payment_open_period
before insert or update or delete on public.purchase_payments
for each row execute function private.guard_purchase_payment_open_period();

create or replace view public.approval_queue
with (security_invoker=true)
as
select
  ar.*,
  greatest(current_date-ar.requested_at::date,0) as age_days,
  coalesce((
    select (s.setting_value #>> '{}')::integer
    from public.business_settings s
    where s.brand_id=ar.brand_id
      and lower(btrim(s.setting_key))='approval_sla_days'
  ),2) as sla_days,
  case
    when ar.status<>'pending' then 'RESOLVED'
    when greatest(current_date-ar.requested_at::date,0) >=
      coalesce((
        select (s.setting_value #>> '{}')::integer
        from public.business_settings s
        where s.brand_id=ar.brand_id
          and lower(btrim(s.setting_key))='approval_sla_days'
      ),2)*2 then 'CRITICAL_OVERDUE'
    when greatest(current_date-ar.requested_at::date,0) >=
      coalesce((
        select (s.setting_value #>> '{}')::integer
        from public.business_settings s
        where s.brand_id=ar.brand_id
          and lower(btrim(s.setting_key))='approval_sla_days'
      ),2) then 'OVERDUE'
    else 'ON_TIME'
  end as sla_status
from public.approval_requests ar;

grant select on public.approval_queue to authenticated;

comment on view public.approval_queue is
  'Approval queue with age_days and brand-configured SLA status.';

commit;
