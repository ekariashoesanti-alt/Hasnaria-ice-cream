-- Executive data-quality guards: never present incomplete COGS/valuation as fully reliable profit.

begin;

create or replace view public.sales_daily_kpis
with (security_invoker=true)
as
with item_rollup as (
  select
    si.sale_id,
    sum(si.qty)::numeric as units_sold,
    sum(si.qty::numeric * si.unit_cogs) as cogs,
    sum(si.qty) filter (where si.unit_cogs>0)::numeric as cogs_known_units
  from public.sale_items si
  group by si.sale_id
),
daily as (
  select
    s.brand_id,
    s.sold_at as metric_date,
    sum(s.total_amount) as revenue,
    sum(s.transaction_count) as transactions,
    coalesce(sum(ir.units_sold),0) as units_sold,
    coalesce(sum(ir.cogs),0) as cogs,
    coalesce(sum(ir.cogs_known_units),0) as cogs_known_units,
    sum(s.cash_amount) as cash_revenue,
    sum(s.qris_amount) as qris_revenue,
    sum(s.tf_amount) as transfer_revenue,
    max(s.created_at) as last_updated_at
  from public.sales s
  left join item_rollup ir on ir.sale_id=s.id
  group by s.brand_id,s.sold_at
)
select
  d.*,
  case when d.units_sold>0 then d.cogs_known_units/d.units_sold*100 else 100 end as cogs_coverage_pct,
  case
    when d.units_sold=0 or d.cogs_known_units>=d.units_sold
      then d.revenue-d.cogs
    else null
  end as gross_profit,
  case
    when d.revenue>0 and (d.units_sold=0 or d.cogs_known_units>=d.units_sold)
      then (d.revenue-d.cogs)/d.revenue*100
    else null
  end as gross_margin_pct
from daily d;

grant select on public.sales_daily_kpis to authenticated;

create or replace view public.finance_daily_summary
with (security_invoker=true)
as
with days as (
  select brand_id,metric_date from public.sales_daily_kpis
  union
  select brand_id,expense_date from public.expenses
  where status in ('recorded','approved')
  union
  select brand_id,payment_date from public.purchase_payments
),
sales as (
  select * from public.sales_daily_kpis
),
opex as (
  select brand_id,expense_date as metric_date,sum(amount) as operating_expense
  from public.expenses
  where status in ('recorded','approved')
  group by brand_id,expense_date
),
supplier_cash as (
  select brand_id,payment_date as metric_date,sum(amount) as supplier_payments
  from public.purchase_payments
  group by brand_id,payment_date
)
select
  d.brand_id,
  d.metric_date,
  coalesce(s.revenue,0) as revenue,
  coalesce(s.cogs,0) as cogs_recorded,
  coalesce(s.cogs_coverage_pct,0) as cogs_coverage_pct,
  s.gross_profit,
  s.gross_margin_pct,
  coalesce(o.operating_expense,0) as operating_expense,
  case when s.gross_profit is null then null
       else s.gross_profit-coalesce(o.operating_expense,0) end as operating_profit,
  coalesce(s.cash_revenue,0)+coalesce(s.qris_revenue,0)+coalesce(s.transfer_revenue,0) as sales_cash_in,
  coalesce(sc.supplier_payments,0) as supplier_payments,
  coalesce(s.cash_revenue,0)+coalesce(s.qris_revenue,0)+coalesce(s.transfer_revenue,0)
    -coalesce(o.operating_expense,0)-coalesce(sc.supplier_payments,0) as net_cash_movement
from days d
left join sales s on s.brand_id=d.brand_id and s.metric_date=d.metric_date
left join opex o on o.brand_id=d.brand_id and o.metric_date=d.metric_date
left join supplier_cash sc on sc.brand_id=d.brand_id and sc.metric_date=d.metric_date;

grant select on public.finance_daily_summary to authenticated;

create or replace view public.executive_kpi_snapshot
with (security_invoker=true)
as
with params as (
  select
    date_trunc('month',current_date)::date as month_start,
    current_date as today,
    (date_trunc('month',current_date)-interval '1 month')::date as prev_start,
    (date_trunc('month',current_date)::date-1) as prev_end,
    (current_date-date_trunc('month',current_date)::date) as elapsed_days
),
brand_scope as (
  select id as brand_id from public.brands
),
sales_mtd as (
  select
    k.brand_id,
    sum(k.revenue) as revenue,
    sum(k.transactions) as transactions,
    sum(k.units_sold) as units_sold,
    sum(k.cogs_known_units) as cogs_known_units,
    sum(k.cogs) as cogs_recorded,
    max(k.last_updated_at) as sales_updated_at
  from public.sales_daily_kpis k,params p
  where k.metric_date between p.month_start and p.today
  group by k.brand_id
),
sales_prev as (
  select k.brand_id,sum(k.revenue) as revenue
  from public.sales_daily_kpis k,params p
  where k.metric_date between p.prev_start
    and least(p.prev_start+p.elapsed_days,p.prev_end)
  group by k.brand_id
),
opex_mtd as (
  select e.brand_id,sum(e.amount) as opex
  from public.expenses e,params p
  where e.status in ('recorded','approved')
    and e.expense_date between p.month_start and p.today
  group by e.brand_id
),
supplier_payments_mtd as (
  select pp.brand_id,sum(pp.amount) as supplier_payments
  from public.purchase_payments pp,params p
  where pp.payment_date between p.month_start and p.today
  group by pp.brand_id
),
targets as (
  select t.brand_id,sum(t.target_value) as revenue_target
  from public.business_targets t,params p
  where lower(btrim(t.metric))='revenue'
    and p.today between t.period_start and t.period_end
  group by t.brand_id
),
approvals as (
  select brand_id,count(*) as pending_approvals
  from public.approval_requests where status='pending'
  group by brand_id
),
ap as (
  select
    brand_id,
    sum(outstanding_amount) as ap_outstanding,
    sum(outstanding_amount) filter (where days_overdue>0) as ap_overdue
  from public.accounts_payable_aging
  group by brand_id
)
select
  b.brand_id,
  p.month_start,
  p.today as as_of_date,
  coalesce(sm.revenue,0) as revenue_mtd,
  coalesce(sp.revenue,0) as revenue_prior_comparable_mtd,
  case when coalesce(sp.revenue,0)>0
    then ((coalesce(sm.revenue,0)-sp.revenue)/sp.revenue)*100 else null end as revenue_growth_pct,
  coalesce(t.revenue_target,0) as revenue_target,
  case when coalesce(t.revenue_target,0)>0
    then coalesce(sm.revenue,0)/t.revenue_target*100 else null end as revenue_target_achievement_pct,
  coalesce(sm.transactions,0) as transactions_mtd,
  case when coalesce(sm.transactions,0)>0
    then coalesce(sm.revenue,0)/sm.transactions else 0 end as average_transaction_value,
  coalesce(sm.cogs_recorded,0) as cogs_recorded_mtd,
  case when coalesce(sm.units_sold,0)>0
    then coalesce(sm.cogs_known_units,0)/sm.units_sold*100 else 100 end as cogs_coverage_pct,
  case
    when coalesce(sm.units_sold,0)=0 or coalesce(sm.cogs_known_units,0)>=sm.units_sold
      then coalesce(sm.revenue,0)-coalesce(sm.cogs_recorded,0)
    else null
  end as gross_profit_mtd,
  case
    when coalesce(sm.revenue,0)>0
      and (coalesce(sm.units_sold,0)=0 or coalesce(sm.cogs_known_units,0)>=sm.units_sold)
      then (coalesce(sm.revenue,0)-coalesce(sm.cogs_recorded,0))/sm.revenue*100
    else null
  end as gross_margin_pct,
  coalesce(o.opex,0) as operating_expense_mtd,
  case
    when coalesce(sm.units_sold,0)>0 and coalesce(sm.cogs_known_units,0)<sm.units_sold
      then null
    else coalesce(sm.revenue,0)-coalesce(sm.cogs_recorded,0)-coalesce(o.opex,0)
  end as operating_profit_mtd,
  coalesce(pm.supplier_payments,0) as supplier_payments_mtd,
  coalesce(iv.inventory_value,0) as inventory_value_estimated,
  coalesce(iv.cost_coverage_pct,0) as inventory_cost_coverage_pct,
  coalesce(iv.critical_items,0) as critical_stock_items,
  coalesce(iv.reorder_items,0) as reorder_stock_items,
  coalesce(iv.untracked_items,0) as untracked_stock_items,
  coalesce(a.pending_approvals,0) as pending_approvals,
  coalesce(ap.ap_outstanding,0) as accounts_payable_outstanding,
  coalesce(ap.ap_overdue,0) as accounts_payable_overdue,
  sm.sales_updated_at,
  case when sm.sales_updated_at is null then null
       else p.today-sm.sales_updated_at::date end as sales_data_age_days
from brand_scope b
cross join params p
left join sales_mtd sm on sm.brand_id=b.brand_id
left join sales_prev sp on sp.brand_id=b.brand_id
left join opex_mtd o on o.brand_id=b.brand_id
left join supplier_payments_mtd pm on pm.brand_id=b.brand_id
left join targets t on t.brand_id=b.brand_id
left join inventory_valuation_summary iv on iv.brand_id=b.brand_id
left join approvals a on a.brand_id=b.brand_id
left join ap on ap.brand_id=b.brand_id;

grant select on public.executive_kpi_snapshot to authenticated;

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

comment on view public.executive_kpi_snapshot is
  'Executive snapshot with explicit COGS/inventory coverage and freshness guards; incomplete costing yields NULL profit/margin rather than false precision.';

commit;
