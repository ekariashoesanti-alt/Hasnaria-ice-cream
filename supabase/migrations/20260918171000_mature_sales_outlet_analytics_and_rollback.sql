-- Sales ERP maturation: outlet scope, normalized payment/product/channel analytics,
-- import reconciliation/rollback, and outlet-accurate cash/settlement calculations.

begin;

alter table public.sales
  add column if not exists outlet_id uuid references public.outlets(id) on delete set null;

create index if not exists sales_outlet_sold_at_idx
  on public.sales(outlet_id,sold_at);

alter table public.sales_import_batches
  add column if not exists outlet_id uuid references public.outlets(id) on delete set null,
  add column if not exists rolled_back_by uuid references auth.users(id) on delete set null,
  add column if not exists rolled_back_at timestamptz,
  add column if not exists rollback_reason text;

create index if not exists sales_import_batches_outlet_idx
  on public.sales_import_batches(outlet_id);
create index if not exists sales_import_batches_rolled_back_by_idx
  on public.sales_import_batches(rolled_back_by);

alter table public.sales_import_batches
  drop constraint if exists sales_import_batches_status_check;
alter table public.sales_import_batches
  add constraint sales_import_batches_status_check
  check (status in ('preview','completed','failed','replaced','rolled_back'));

-- Backfill Hasnaria's existing single-outlet history.
update public.sales s
set outlet_id=o.id
from public.outlets o
join public.brands b on b.id=o.brand_id
where s.brand_id=b.id
  and lower(btrim(b.name))='hasnaria'
  and o.code='MAIN'
  and s.outlet_id is null;

update public.sales_import_batches sb
set outlet_id=o.id
from public.outlets o
join public.brands b on b.id=o.brand_id
where sb.brand_id=b.id
  and lower(btrim(b.name))='hasnaria'
  and o.code='MAIN'
  and sb.outlet_id is null;

create or replace function private.default_and_guard_sale_outlet()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_count integer;
  v_outlet uuid;
begin
  if new.outlet_id is null then
    select count(*),min(id)
      into v_count,v_outlet
    from public.outlets
    where brand_id=new.brand_id and active;

    if v_count=1 then
      new.outlet_id:=v_outlet;
    end if;
  end if;

  if new.outlet_id is not null and not exists(
    select 1 from public.outlets o
    where o.id=new.outlet_id
      and o.brand_id=new.brand_id
      and o.active
  ) then
    raise exception 'Sale outlet belongs to another brand or is inactive';
  end if;

  return new;
end;
$$;

revoke execute on function private.default_and_guard_sale_outlet()
  from public,anon,authenticated;

drop trigger if exists trg_default_guard_sale_outlet on public.sales;
create trigger trg_default_guard_sale_outlet
before insert or update of outlet_id,brand_id on public.sales
for each row execute function private.default_and_guard_sale_outlet();

create or replace function private.default_and_guard_sales_batch_outlet()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_count integer;
  v_outlet uuid;
begin
  if new.outlet_id is null then
    select count(*),min(id)
      into v_count,v_outlet
    from public.outlets
    where brand_id=new.brand_id and active;
    if v_count=1 then new.outlet_id:=v_outlet; end if;
  end if;

  if new.outlet_id is not null and not exists(
    select 1 from public.outlets o
    where o.id=new.outlet_id and o.brand_id=new.brand_id and o.active
  ) then
    raise exception 'Sales import batch outlet is invalid';
  end if;

  return new;
end;
$$;

revoke execute on function private.default_and_guard_sales_batch_outlet()
  from public,anon,authenticated;

drop trigger if exists trg_default_guard_sales_batch_outlet on public.sales_import_batches;
create trigger trg_default_guard_sales_batch_outlet
before insert or update of outlet_id,brand_id on public.sales_import_batches
for each row execute function private.default_and_guard_sales_batch_outlet();

create or replace view public.sales_daily_outlet_kpis
with (security_invoker=true)
as
with item_rollup as (
  select
    si.sale_id,
    sum(si.qty)::numeric as units_sold,
    sum(si.qty::numeric*si.unit_cogs) as cogs,
    sum(si.qty) filter(where si.unit_cogs>0)::numeric as cogs_known_units
  from public.sale_items si
  group by si.sale_id
)
select
  s.brand_id,
  s.outlet_id,
  s.sold_at as metric_date,
  sum(s.total_amount) as revenue,
  sum(s.transaction_count) as transactions,
  coalesce(sum(ir.units_sold),0) as units_sold,
  coalesce(sum(ir.cogs),0) as cogs_recorded,
  case when coalesce(sum(ir.units_sold),0)>0
    then coalesce(sum(ir.cogs_known_units),0)/sum(ir.units_sold)*100
    else 100 end as cogs_coverage_pct,
  case when coalesce(sum(ir.units_sold),0)=0
          or coalesce(sum(ir.cogs_known_units),0)>=coalesce(sum(ir.units_sold),0)
    then sum(s.total_amount)-coalesce(sum(ir.cogs),0)
    else null end as gross_profit,
  case when sum(s.total_amount)>0
          and (coalesce(sum(ir.units_sold),0)=0
            or coalesce(sum(ir.cogs_known_units),0)>=coalesce(sum(ir.units_sold),0))
    then (sum(s.total_amount)-coalesce(sum(ir.cogs),0))/sum(s.total_amount)*100
    else null end as gross_margin_pct,
  sum(s.cash_amount) as cash_revenue,
  sum(s.qris_amount) as qris_revenue,
  sum(s.tf_amount) as transfer_revenue,
  max(s.created_at) as last_updated_at
from public.sales s
left join item_rollup ir on ir.sale_id=s.id
group by s.brand_id,s.outlet_id,s.sold_at;

grant select on public.sales_daily_outlet_kpis to authenticated;

create or replace view public.sales_payment_method_daily
with (security_invoker=true)
as
select brand_id,outlet_id,sold_at as metric_date,'CASH'::text as payment_method,
       sum(cash_amount) as amount
from public.sales group by brand_id,outlet_id,sold_at
union all
select brand_id,outlet_id,sold_at,'QRIS',sum(qris_amount)
from public.sales group by brand_id,outlet_id,sold_at
union all
select brand_id,outlet_id,sold_at,'TRANSFER',sum(tf_amount)
from public.sales group by brand_id,outlet_id,sold_at;

grant select on public.sales_payment_method_daily to authenticated;

create or replace view public.sales_product_performance
with (security_invoker=true)
as
select
  s.brand_id,
  s.outlet_id,
  date_trunc('month',s.sold_at)::date as month,
  si.product_id,
  coalesce(p.name,si.item_name,'Unmapped') as product_name,
  sum(si.qty) as units_sold,
  sum(si.qty::numeric*si.unit_price) as revenue,
  sum(si.qty::numeric*si.unit_cogs) as cogs_recorded,
  case when sum(si.qty) filter(where si.unit_cogs>0)=sum(si.qty)
    then sum(si.qty::numeric*(si.unit_price-si.unit_cogs))
    else null end as gross_profit,
  case when sum(si.qty)>0
    then (sum(si.qty) filter(where si.unit_cogs>0))::numeric/sum(si.qty)*100
    else 100 end as cogs_coverage_pct
from public.sale_items si
join public.sales s on s.id=si.sale_id
left join public.products p on p.id=si.product_id
group by s.brand_id,s.outlet_id,date_trunc('month',s.sold_at),si.product_id,coalesce(p.name,si.item_name,'Unmapped');

grant select on public.sales_product_performance to authenticated;

create or replace view public.sales_channel_mix_monthly
with (security_invoker=true)
as
select
  brand_id,
  outlet_id,
  date_trunc('month',sold_at)::date as month,
  coalesce(nullif(btrim(channel),''),'UNKNOWN') as channel,
  sum(total_amount) as revenue,
  sum(transaction_count) as transactions
from public.sales
group by brand_id,outlet_id,date_trunc('month',sold_at),coalesce(nullif(btrim(channel),''),'UNKNOWN');

grant select on public.sales_channel_mix_monthly to authenticated;

create or replace view public.sales_target_performance
with (security_invoker=true)
as
select
  t.brand_id,
  t.outlet_id,
  t.id as target_id,
  t.period_start,
  t.period_end,
  t.target_value as revenue_target,
  coalesce((
    select sum(s.total_amount)
    from public.sales s
    where s.brand_id=t.brand_id
      and s.sold_at between t.period_start and t.period_end
      and (t.outlet_id is null or s.outlet_id=t.outlet_id)
  ),0) as revenue_actual,
  case when t.target_value>0 then
    coalesce((
      select sum(s.total_amount)
      from public.sales s
      where s.brand_id=t.brand_id
        and s.sold_at between t.period_start and t.period_end
        and (t.outlet_id is null or s.outlet_id=t.outlet_id)
    ),0)/t.target_value*100
    else null end as achievement_pct
from public.business_targets t
where lower(btrim(t.metric))='revenue';

grant select on public.sales_target_performance to authenticated;

create or replace view public.sales_import_reconciliation
with (security_invoker=true)
as
select
  b.brand_id,
  b.outlet_id,
  b.id as batch_id,
  b.filename,
  b.status,
  b.period_from,
  b.period_to,
  b.transaction_count as expected_transactions,
  count(s.id) as posted_transactions,
  b.total_amount as expected_revenue,
  coalesce(sum(s.total_amount),0) as posted_revenue,
  count(si.id) as posted_item_rows,
  count(si.id) filter(where si.product_id is null) as unmapped_item_rows,
  coalesce(sum(s.total_amount),0)-b.total_amount as revenue_variance
from public.sales_import_batches b
left join public.sales s on s.source_batch_id=b.id
left join public.sale_items si on si.sale_id=s.id
group by b.id;

grant select on public.sales_import_reconciliation to authenticated;

create or replace function private.rollback_sales_import_batch(
  p_batch_id uuid,
  p_reason text
)
returns public.sales_import_batches
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch public.sales_import_batches%rowtype;
  v_deleted integer;
  v_revenue numeric;
begin
  if not private.has_role(array['owner','head_store']) then
    raise exception 'Owner or Head Store permission required';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Rollback reason is required';
  end if;

  select * into v_batch
  from public.sales_import_batches
  where id=p_batch_id
  for update;

  if not found then raise exception 'Sales import batch not found'; end if;
  if not private.same_brand(v_batch.brand_id) then
    raise exception 'Sales import batch is outside your brand';
  end if;
  if v_batch.status<>'completed' then
    raise exception 'Only completed sales imports can be rolled back';
  end if;

  if exists(
    select 1 from public.sales s
    where s.source_batch_id=v_batch.id
      and exists(
        select 1 from public.accounting_periods ap
        where ap.brand_id=s.brand_id
          and s.sold_at between ap.period_start and ap.period_end
          and ap.status='closed'
      )
  ) then
    raise exception 'Sales import contains transactions in a closed accounting period';
  end if;

  select count(*),coalesce(sum(total_amount),0)
    into v_deleted,v_revenue
  from public.sales
  where source_batch_id=v_batch.id;

  delete from public.sales
  where source_batch_id=v_batch.id;

  update public.sales_import_batches
  set status='rolled_back',
      rolled_back_by=auth.uid(),
      rolled_back_at=now(),
      rollback_reason=p_reason
  where id=v_batch.id
  returning * into v_batch;

  perform private.write_audit_log(
    v_batch.brand_id,v_batch.outlet_id,'sales_import_batch',v_batch.id,
    'rolled_back',auth.uid(),
    jsonb_build_object('status','completed','transactions',v_deleted,'revenue',v_revenue),
    to_jsonb(v_batch),p_reason,'{}'::jsonb
  );

  return v_batch;
end;
$$;

revoke execute on function private.rollback_sales_import_batch(uuid,text)
  from public,anon;
grant execute on function private.rollback_sales_import_batch(uuid,text)
  to authenticated;

create or replace function public.rollback_sales_import_batch(
  p_batch_id uuid,p_reason text
)
returns public.sales_import_batches
language sql security invoker set search_path=''
as $$ select private.rollback_sales_import_batch(p_batch_id,p_reason); $$;

revoke execute on function public.rollback_sales_import_batch(uuid,text)
  from public,anon;
grant execute on function public.rollback_sales_import_batch(uuid,text)
  to authenticated;

-- Cash and settlement are now outlet-accurate.
create or replace function private.close_cash_session(
  p_session_id uuid,
  p_actual_closing_cash numeric,
  p_cash_outflows numeric,
  p_notes text
)
returns public.cash_sessions
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.cash_sessions%rowtype;
  v_cash_sales numeric;
  v_threshold numeric:=100000;
begin
  if not private.can_ops_write() then raise exception 'Operations permission required'; end if;

  select * into v_row from public.cash_sessions
  where id=p_session_id for update;

  if not found then raise exception 'Cash session not found'; end if;
  if not private.same_brand(v_row.brand_id) then raise exception 'Cash session is outside your brand'; end if;
  if v_row.status<>'open' then raise exception 'Cash session is already closed'; end if;
  if coalesce(p_actual_closing_cash,-1)<0 or coalesce(p_cash_outflows,0)<0 then
    raise exception 'Cash amounts cannot be negative';
  end if;

  select coalesce(sum(cash_amount),0) into v_cash_sales
  from public.sales
  where brand_id=v_row.brand_id
    and outlet_id=v_row.outlet_id
    and sold_at=v_row.session_date;

  select coalesce((setting_value #>> '{}')::numeric,100000)
    into v_threshold
  from public.business_settings
  where brand_id=v_row.brand_id
    and lower(btrim(setting_key))='cash_variance_warning';

  update public.cash_sessions
  set cash_sales=v_cash_sales,
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

create or replace function private.reconcile_payment_settlement(
  p_outlet_id uuid,
  p_settlement_date date,
  p_payment_method text,
  p_actual_amount numeric,
  p_reference_no text,
  p_notes text
)
returns public.payment_settlements
language plpgsql
security definer
set search_path=''
as $$
declare
  v_outlet public.outlets%rowtype;
  v_method text:=upper(btrim(coalesce(p_payment_method,'')));
  v_expected numeric;
  v_threshold numeric:=100000;
  v_row public.payment_settlements%rowtype;
begin
  if not private.has_capability('finance.ap.write') then raise exception 'Finance permission required'; end if;
  if v_method not in ('QRIS','TRANSFER') then raise exception 'Settlement method must be QRIS or TRANSFER'; end if;

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
    and outlet_id=v_outlet.id
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
      'payment_settlement',v_row.id,'Selisih settlement '||v_method,
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

comment on view public.sales_daily_outlet_kpis is
  'Outlet-scoped daily commercial KPIs with COGS coverage guard.';
comment on view public.sales_import_reconciliation is
  'Batch-level current posted counts/revenue vs import batch expected totals.';

commit;
