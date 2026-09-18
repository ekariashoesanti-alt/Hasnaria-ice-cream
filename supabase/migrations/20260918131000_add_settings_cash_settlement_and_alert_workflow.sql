-- ERP operational finance controls: settings, accounting periods, cash close,
-- payment settlements, and exception lifecycle.

begin;

create table if not exists public.business_settings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  setting_key text not null,
  setting_value jsonb not null,
  category text not null default 'general',
  description text,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_settings_key_nonempty check (btrim(setting_key)<>''),
  constraint business_settings_category_nonempty check (btrim(category)<>'')
);

create unique index if not exists business_settings_brand_key_uidx
  on public.business_settings(brand_id,lower(btrim(setting_key)));
create index if not exists business_settings_updated_by_idx
  on public.business_settings(updated_by);

alter table public.business_settings enable row level security;

create policy business_settings_read_same_brand
on public.business_settings for select to authenticated
using ((select private.same_brand(business_settings.brand_id)));

create policy business_settings_owner_insert
on public.business_settings for insert to authenticated
with check (
  (select private.same_brand(business_settings.brand_id))
  and (select private.has_capability('settings.manage'))
);

create policy business_settings_owner_update
on public.business_settings for update to authenticated
using (
  (select private.same_brand(business_settings.brand_id))
  and (select private.has_capability('settings.manage'))
)
with check (
  (select private.same_brand(business_settings.brand_id))
  and (select private.has_capability('settings.manage'))
);

grant select,insert,update on public.business_settings to authenticated;

insert into public.business_settings(brand_id,setting_key,setting_value,category,description)
select b.id,x.setting_key,x.setting_value::jsonb,x.category,x.description
from public.brands b
cross join (values
  ('currency','"IDR"','general','Base reporting currency'),
  ('timezone','"Asia/Jakarta"','general','Business reporting timezone'),
  ('cash_variance_warning','100000','alerts','Cash close variance warning threshold'),
  ('settlement_variance_warning','100000','alerts','QRIS/transfer settlement variance warning threshold')
) x(setting_key,setting_value,category,description)
where lower(btrim(b.name))='hasnaria'
  and not exists (
    select 1 from public.business_settings s
    where s.brand_id=b.id and lower(btrim(s.setting_key))=lower(btrim(x.setting_key))
  );

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open',
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  close_note text,
  reopen_note text,
  created_at timestamptz not null default now(),
  constraint accounting_periods_period_check check (period_end>=period_start),
  constraint accounting_periods_status_check check (status in ('open','closed'))
);

create unique index if not exists accounting_periods_brand_dates_uidx
  on public.accounting_periods(brand_id,period_start,period_end);
create index if not exists accounting_periods_closed_by_idx on public.accounting_periods(closed_by);
create index if not exists accounting_periods_reopened_by_idx on public.accounting_periods(reopened_by);

alter table public.accounting_periods enable row level security;

create policy accounting_periods_read_same_brand
on public.accounting_periods for select to authenticated
using ((select private.same_brand(accounting_periods.brand_id)));

grant select on public.accounting_periods to authenticated;

insert into public.accounting_periods(brand_id,period_start,period_end,status)
select
  b.id,
  date_trunc('month',current_date)::date,
  (date_trunc('month',current_date)+interval '1 month'-interval '1 day')::date,
  'open'
from public.brands b
where lower(btrim(b.name))='hasnaria'
on conflict (brand_id,period_start,period_end) do nothing;

create or replace function private.set_accounting_period_status(
  p_period_id uuid,
  p_status text,
  p_note text
)
returns public.accounting_periods
language plpgsql security definer set search_path=''
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

  select * into v_period from public.accounting_periods
  where id=p_period_id for update;

  if not found then raise exception 'Accounting period not found'; end if;
  if not private.same_brand(v_period.brand_id) then
    raise exception 'Accounting period is outside your brand';
  end if;

  if v_status=v_period.status then
    return v_period;
  end if;

  update public.accounting_periods
  set
    status=v_status,
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

create or replace function public.close_accounting_period(p_period_id uuid,p_note text default null)
returns public.accounting_periods
language sql security invoker set search_path=''
as $$ select private.set_accounting_period_status(p_period_id,'closed',p_note); $$;

create or replace function public.reopen_accounting_period(p_period_id uuid,p_note text)
returns public.accounting_periods
language sql security invoker set search_path=''
as $$ select private.set_accounting_period_status(p_period_id,'open',p_note); $$;

revoke execute on function public.close_accounting_period(uuid,text) from public,anon;
revoke execute on function public.reopen_accounting_period(uuid,text) from public,anon;
grant execute on function public.close_accounting_period(uuid,text) to authenticated;
grant execute on function public.reopen_accounting_period(uuid,text) to authenticated;

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  session_no text not null,
  session_date date not null default current_date,
  opening_cash numeric not null default 0,
  cash_sales numeric not null default 0,
  cash_outflows numeric not null default 0,
  expected_closing_cash numeric,
  actual_closing_cash numeric,
  variance numeric generated always as (
    case when actual_closing_cash is null or expected_closing_cash is null
      then null
      else actual_closing_cash-expected_closing_cash
    end
  ) stored,
  status text not null default 'open',
  notes text,
  opened_by uuid references auth.users(id) on delete set null default auth.uid(),
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  constraint cash_sessions_no_nonempty check (btrim(session_no)<>''),
  constraint cash_sessions_amounts_nonnegative check (
    opening_cash>=0 and cash_sales>=0 and cash_outflows>=0
    and (actual_closing_cash is null or actual_closing_cash>=0)
  ),
  constraint cash_sessions_status_check check (status in ('open','closed'))
);

create unique index if not exists cash_sessions_brand_no_uidx
  on public.cash_sessions(brand_id,lower(btrim(session_no)));
create unique index if not exists cash_sessions_one_open_uidx
  on public.cash_sessions(brand_id,outlet_id,session_date)
  where status='open';
create index if not exists cash_sessions_outlet_date_idx
  on public.cash_sessions(outlet_id,session_date desc);
create index if not exists cash_sessions_opened_by_idx on public.cash_sessions(opened_by);
create index if not exists cash_sessions_closed_by_idx on public.cash_sessions(closed_by);

alter table public.cash_sessions enable row level security;

create policy cash_sessions_read_same_brand
on public.cash_sessions for select to authenticated
using ((select private.same_brand(cash_sessions.brand_id)));

grant select on public.cash_sessions to authenticated;

create or replace function private.open_cash_session(
  p_outlet_id uuid,
  p_session_no text,
  p_opening_cash numeric,
  p_notes text
)
returns public.cash_sessions
language plpgsql security definer set search_path=''
as $$
declare
  v_outlet public.outlets%rowtype;
  v_row public.cash_sessions%rowtype;
begin
  if not private.can_ops_write() then
    raise exception 'Operations permission required';
  end if;

  select * into v_outlet from public.outlets where id=p_outlet_id;
  if not found or not private.same_brand(v_outlet.brand_id) or not v_outlet.active then
    raise exception 'Outlet is invalid or inactive';
  end if;

  if coalesce(p_opening_cash,0)<0 then raise exception 'Opening cash cannot be negative'; end if;

  insert into public.cash_sessions(
    brand_id,outlet_id,session_no,session_date,opening_cash,notes,opened_by
  ) values(
    v_outlet.brand_id,v_outlet.id,p_session_no,current_date,
    coalesce(p_opening_cash,0),p_notes,auth.uid()
  )
  returning * into v_row;

  perform private.write_audit_log(
    v_row.brand_id,v_row.outlet_id,'cash_session',v_row.id,'opened',
    auth.uid(),null,to_jsonb(v_row),p_notes,'{}'::jsonb
  );

  return v_row;
end;
$$;

revoke execute on function private.open_cash_session(uuid,text,numeric,text)
  from public,anon;
grant execute on function private.open_cash_session(uuid,text,numeric,text)
  to authenticated;

create or replace function public.open_cash_session(
  p_outlet_id uuid,p_session_no text,p_opening_cash numeric,p_notes text default null
)
returns public.cash_sessions
language sql security invoker set search_path=''
as $$ select private.open_cash_session(p_outlet_id,p_session_no,p_opening_cash,p_notes); $$;

revoke execute on function public.open_cash_session(uuid,text,numeric,text) from public,anon;
grant execute on function public.open_cash_session(uuid,text,numeric,text) to authenticated;

create or replace function private.close_cash_session(
  p_session_id uuid,
  p_actual_closing_cash numeric,
  p_cash_outflows numeric,
  p_notes text
)
returns public.cash_sessions
language plpgsql security definer set search_path=''
as $$
declare
  v_row public.cash_sessions%rowtype;
  v_cash_sales numeric;
  v_threshold numeric:=100000;
begin
  if not private.can_ops_write() then
    raise exception 'Operations permission required';
  end if;

  select * into v_row from public.cash_sessions
  where id=p_session_id for update;

  if not found then raise exception 'Cash session not found'; end if;
  if not private.same_brand(v_row.brand_id) then raise exception 'Cash session is outside your brand'; end if;
  if v_row.status<>'open' then raise exception 'Cash session is already closed'; end if;
  if coalesce(p_actual_closing_cash,-1)<0 or coalesce(p_cash_outflows,0)<0 then
    raise exception 'Cash amounts cannot be negative';
  end if;

  -- Sales currently remain brand-level; valid for Hasnaria's current single-outlet baseline.
  select coalesce(sum(cash_amount),0) into v_cash_sales
  from public.sales
  where brand_id=v_row.brand_id
    and sold_at=v_row.session_date;

  select coalesce((setting_value #>> '{}')::numeric,100000)
    into v_threshold
  from public.business_settings
  where brand_id=v_row.brand_id
    and lower(btrim(setting_key))='cash_variance_warning';

  update public.cash_sessions
  set
    cash_sales=v_cash_sales,
    cash_outflows=coalesce(p_cash_outflows,0),
    expected_closing_cash=opening_cash+v_cash_sales-coalesce(p_cash_outflows,0),
    actual_closing_cash=p_actual_closing_cash,
    status='closed',
    notes=coalesce(p_notes,notes),
    closed_by=auth.uid(),
    closed_at=now()
  where id=v_row.id
  returning * into v_row;

  perform private.write_audit_log(
    v_row.brand_id,v_row.outlet_id,'cash_session',v_row.id,'closed',
    auth.uid(),null,to_jsonb(v_row),p_notes,
    jsonb_build_object('variance',v_row.variance)
  );

  if abs(coalesce(v_row.variance,0))>=coalesce(v_threshold,100000) then
    insert into public.exception_events(
      brand_id,outlet_id,event_code,severity,entity_type,entity_id,title,detail,metadata
    ) values(
      v_row.brand_id,v_row.outlet_id,'CASH_VARIANCE',
      case when abs(v_row.variance)>=coalesce(v_threshold,100000)*2 then 'CRITICAL' else 'WARNING' end,
      'cash_session',v_row.id,'Selisih kas saat closing',
      'Variance kas Rp '||round(v_row.variance,0)::text,
      jsonb_build_object('variance',v_row.variance,'threshold',v_threshold)
    );
  end if;

  return v_row;
end;
$$;

revoke execute on function private.close_cash_session(uuid,numeric,numeric,text)
  from public,anon;
grant execute on function private.close_cash_session(uuid,numeric,numeric,text)
  to authenticated;

create or replace function public.close_cash_session(
  p_session_id uuid,
  p_actual_closing_cash numeric,
  p_cash_outflows numeric default 0,
  p_notes text default null
)
returns public.cash_sessions
language sql security invoker set search_path=''
as $$
  select private.close_cash_session(
    p_session_id,p_actual_closing_cash,p_cash_outflows,p_notes
  );
$$;

revoke execute on function public.close_cash_session(uuid,numeric,numeric,text) from public,anon;
grant execute on function public.close_cash_session(uuid,numeric,numeric,text) to authenticated;

create table if not exists public.payment_settlements (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete restrict,
  settlement_date date not null,
  payment_method text not null,
  expected_amount numeric not null default 0,
  actual_amount numeric,
  variance numeric generated always as (
    case when actual_amount is null then null else actual_amount-expected_amount end
  ) stored,
  status text not null default 'pending',
  reference_no text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  reconciled_by uuid references auth.users(id) on delete set null,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_settlements_method_check check (payment_method in ('QRIS','TRANSFER')),
  constraint payment_settlements_amount_check check (
    expected_amount>=0 and (actual_amount is null or actual_amount>=0)
  ),
  constraint payment_settlements_status_check check (status in ('pending','reconciled'))
);

create unique index if not exists payment_settlements_day_method_uidx
  on public.payment_settlements(brand_id,outlet_id,settlement_date,payment_method);
create index if not exists payment_settlements_created_by_idx on public.payment_settlements(created_by);
create index if not exists payment_settlements_reconciled_by_idx on public.payment_settlements(reconciled_by);

alter table public.payment_settlements enable row level security;

create policy payment_settlements_read_finance
on public.payment_settlements for select to authenticated
using (
  (select private.same_brand(payment_settlements.brand_id))
  and (select private.has_capability('finance.read'))
);

grant select on public.payment_settlements to authenticated;

create or replace function private.reconcile_payment_settlement(
  p_outlet_id uuid,
  p_settlement_date date,
  p_payment_method text,
  p_actual_amount numeric,
  p_reference_no text,
  p_notes text
)
returns public.payment_settlements
language plpgsql security definer set search_path=''
as $$
declare
  v_outlet public.outlets%rowtype;
  v_method text:=upper(btrim(coalesce(p_payment_method,'')));
  v_expected numeric;
  v_threshold numeric:=100000;
  v_row public.payment_settlements%rowtype;
begin
  if not private.has_capability('finance.ap.write') then
    raise exception 'Finance permission required';
  end if;

  if v_method not in ('QRIS','TRANSFER') then
    raise exception 'Settlement method must be QRIS or TRANSFER';
  end if;

  select * into v_outlet from public.outlets where id=p_outlet_id;
  if not found or not private.same_brand(v_outlet.brand_id) then
    raise exception 'Outlet is outside your brand';
  end if;

  if coalesce(p_actual_amount,-1)<0 then raise exception 'Actual settlement cannot be negative'; end if;

  select case when v_method='QRIS'
         then coalesce(sum(qris_amount),0)
         else coalesce(sum(tf_amount),0) end
    into v_expected
  from public.sales
  where brand_id=v_outlet.brand_id
    and sold_at=p_settlement_date;

  insert into public.payment_settlements(
    brand_id,outlet_id,settlement_date,payment_method,
    expected_amount,actual_amount,status,reference_no,notes,
    created_by,reconciled_by,reconciled_at
  ) values(
    v_outlet.brand_id,v_outlet.id,p_settlement_date,v_method,
    v_expected,p_actual_amount,'reconciled',p_reference_no,p_notes,
    auth.uid(),auth.uid(),now()
  )
  on conflict (brand_id,outlet_id,settlement_date,payment_method)
  do update set
    expected_amount=excluded.expected_amount,
    actual_amount=excluded.actual_amount,
    status='reconciled',
    reference_no=excluded.reference_no,
    notes=excluded.notes,
    reconciled_by=auth.uid(),
    reconciled_at=now(),
    updated_at=now()
  returning * into v_row;

  select coalesce((setting_value #>> '{}')::numeric,100000)
    into v_threshold
  from public.business_settings
  where brand_id=v_row.brand_id
    and lower(btrim(setting_key))='settlement_variance_warning';

  perform private.write_audit_log(
    v_row.brand_id,v_row.outlet_id,'payment_settlement',v_row.id,'reconciled',
    auth.uid(),null,to_jsonb(v_row),p_notes,
    jsonb_build_object('variance',v_row.variance)
  );

  if abs(coalesce(v_row.variance,0))>=coalesce(v_threshold,100000) then
    insert into public.exception_events(
      brand_id,outlet_id,event_code,severity,entity_type,entity_id,title,detail,metadata
    ) values(
      v_row.brand_id,v_row.outlet_id,'SETTLEMENT_VARIANCE',
      case when abs(v_row.variance)>=coalesce(v_threshold,100000)*2 then 'CRITICAL' else 'WARNING' end,
      'payment_settlement',v_row.id,
      'Selisih settlement '||v_method,
      'Variance settlement Rp '||round(v_row.variance,0)::text,
      jsonb_build_object('variance',v_row.variance,'expected',v_row.expected_amount,'actual',v_row.actual_amount)
    );
  end if;

  return v_row;
end;
$$;

revoke execute on function private.reconcile_payment_settlement(uuid,date,text,numeric,text,text)
  from public,anon;
grant execute on function private.reconcile_payment_settlement(uuid,date,text,numeric,text,text)
  to authenticated;

create or replace function public.reconcile_payment_settlement(
  p_outlet_id uuid,
  p_settlement_date date,
  p_payment_method text,
  p_actual_amount numeric,
  p_reference_no text default null,
  p_notes text default null
)
returns public.payment_settlements
language sql security invoker set search_path=''
as $$
  select private.reconcile_payment_settlement(
    p_outlet_id,p_settlement_date,p_payment_method,p_actual_amount,
    p_reference_no,p_notes
  );
$$;

revoke execute on function public.reconcile_payment_settlement(uuid,date,text,numeric,text,text)
  from public,anon;
grant execute on function public.reconcile_payment_settlement(uuid,date,text,numeric,text,text)
  to authenticated;

create or replace function private.manage_exception_event(
  p_event_id uuid,
  p_action text,
  p_note text
)
returns public.exception_events
language plpgsql security definer set search_path=''
as $$
declare
  v_event public.exception_events%rowtype;
  v_action text:=lower(btrim(coalesce(p_action,'')));
begin
  if not private.has_role(array['owner','head_store','pic']) then
    raise exception 'Exception management permission required';
  end if;

  select * into v_event from public.exception_events
  where id=p_event_id for update;

  if not found then raise exception 'Exception event not found'; end if;
  if not private.same_brand(v_event.brand_id) then raise exception 'Exception event is outside your brand'; end if;

  if v_action='acknowledge' then
    if v_event.acknowledged_at is null then
      update public.exception_events
      set acknowledged_by=auth.uid(),acknowledged_at=now()
      where id=v_event.id returning * into v_event;
    end if;
  elsif v_action='resolve' then
    update public.exception_events
    set
      acknowledged_by=coalesce(acknowledged_by,auth.uid()),
      acknowledged_at=coalesce(acknowledged_at,now()),
      resolved_by=auth.uid(),
      resolved_at=now(),
      resolution_note=p_note
    where id=v_event.id returning * into v_event;
  else
    raise exception 'Unsupported exception action';
  end if;

  perform private.write_audit_log(
    v_event.brand_id,v_event.outlet_id,'exception_event',v_event.id,v_action,
    auth.uid(),null,to_jsonb(v_event),p_note,'{}'::jsonb
  );

  return v_event;
end;
$$;

revoke execute on function private.manage_exception_event(uuid,text,text)
  from public,anon;
grant execute on function private.manage_exception_event(uuid,text,text)
  to authenticated;

create or replace function public.acknowledge_exception_event(p_event_id uuid,p_note text default null)
returns public.exception_events
language sql security invoker set search_path=''
as $$ select private.manage_exception_event(p_event_id,'acknowledge',p_note); $$;

create or replace function public.resolve_exception_event(p_event_id uuid,p_note text)
returns public.exception_events
language sql security invoker set search_path=''
as $$ select private.manage_exception_event(p_event_id,'resolve',p_note); $$;

revoke execute on function public.acknowledge_exception_event(uuid,text) from public,anon;
revoke execute on function public.resolve_exception_event(uuid,text) from public,anon;
grant execute on function public.acknowledge_exception_event(uuid,text) to authenticated;
grant execute on function public.resolve_exception_event(uuid,text) to authenticated;

create or replace view public.cash_reconciliation_summary
with (security_invoker=true)
as
select
  cs.brand_id,
  cs.outlet_id,
  cs.session_date,
  cs.session_no,
  cs.status,
  cs.opening_cash,
  cs.cash_sales,
  cs.cash_outflows,
  cs.expected_closing_cash,
  cs.actual_closing_cash,
  cs.variance,
  cs.opened_at,
  cs.closed_at
from public.cash_sessions cs;

grant select on public.cash_reconciliation_summary to authenticated;

-- Add persisted exception events to the dynamic Decision Center.
create or replace view public.executive_decision_center
with (security_invoker=true)
as
select
  ar.brand_id,ar.outlet_id,'APPROVAL'::text as decision_type,ar.id as entity_id,
  case when coalesce(ar.amount,0)>=5000000 then 'CRITICAL' else 'WARNING' end as severity,
  'Approval menunggu keputusan'::text as title,
  ar.entity_type||' · approver '||ar.approver_role as detail,
  ar.amount,ar.requested_at::date as event_date,
  greatest(current_date-ar.requested_at::date,0) as age_days
from public.approval_requests ar
where ar.status='pending'

union all

select
  l.brand_id,null::uuid,'STOCK',l.inventory_item_id,
  case when l.status='critical' then 'CRITICAL' else 'WARNING' end,
  case when l.status='critical' then 'Stok kritis' else 'Stok perlu dipesan' end,
  l.item_name||' · stok sistem '||l.ledger_qty::text||' '||l.unit,
  null::numeric,current_date,0
from public.inventory_ledger_balance l
where l.status in ('critical','order')

union all

select
  ap.brand_id,ap.outlet_id,'AP_OVERDUE',ap.purchase_invoice_id,
  case when ap.days_overdue>30 then 'CRITICAL' else 'WARNING' end,
  'Tagihan supplier jatuh tempo',
  ap.supplier_name||' · Invoice '||ap.invoice_no,
  ap.outstanding_amount,coalesce(ap.due_date,ap.invoice_date),ap.days_overdue
from public.accounts_payable_aging ap
where ap.outstanding_amount>0 and ap.days_overdue>0

union all

select
  e.brand_id,e.outlet_id,e.event_code,e.entity_id,e.severity,e.title,
  coalesce(e.detail,e.event_code),null::numeric,e.detected_at::date,
  greatest(current_date-e.detected_at::date,0)
from public.exception_events e
where e.resolved_at is null

union all

select
  k.brand_id,null::uuid,'DATA_QUALITY',null::uuid,
  case when k.cogs_coverage_pct=0 then 'CRITICAL' else 'WARNING' end,
  'Data COGS belum lengkap',
  'Coverage COGS bulan berjalan '||round(k.cogs_coverage_pct,1)::text||'%',
  null::numeric,k.as_of_date,0
from public.executive_kpi_snapshot k
where k.cogs_coverage_pct<99.9

union all

select
  k.brand_id,null::uuid,'DATA_QUALITY',null::uuid,
  case when k.inventory_cost_coverage_pct=0 then 'CRITICAL' else 'WARNING' end,
  'Valuasi persediaan belum lengkap',
  'Coverage harga pokok inventory '||round(k.inventory_cost_coverage_pct,1)::text||'%',
  null::numeric,k.as_of_date,0
from public.executive_kpi_snapshot k
where k.inventory_cost_coverage_pct<80

union all

select
  k.brand_id,null::uuid,'DATA_QUALITY',null::uuid,
  'WARNING','Item stok belum memiliki baseline opname',
  k.untracked_stock_items::text||' item belum ter-track',
  null::numeric,k.as_of_date,0
from public.executive_kpi_snapshot k
where k.untracked_stock_items>0

union all

select
  k.brand_id,null::uuid,'DATA_FRESHNESS',null::uuid,
  case when coalesce(k.sales_data_age_days,999)>3 then 'CRITICAL' else 'WARNING' end,
  'Data penjualan belum terbaru',
  'Update terakhir '||coalesce(k.sales_data_age_days::text,'?')||' hari lalu',
  null::numeric,k.as_of_date,coalesce(k.sales_data_age_days,999)
from public.executive_kpi_snapshot k
where coalesce(k.sales_data_age_days,999)>1;

grant select on public.executive_decision_center to authenticated;

comment on table public.cash_sessions is 'Operational cash opening/closing sessions with expected vs actual variance.';
comment on table public.payment_settlements is 'QRIS/transfer expected vs actual settlement reconciliation.';
comment on table public.accounting_periods is 'Finance reporting periods; close/reopen is Owner-controlled and audited.';

commit;
