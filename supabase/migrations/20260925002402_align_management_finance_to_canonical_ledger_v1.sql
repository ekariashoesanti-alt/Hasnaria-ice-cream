-- Align management/executive Finance summaries to the same canonical ledger
-- used by formal SAK EMKM reporting. Unauthorized roles receive NULL Finance metrics.

create or replace view public.finance_operating_expense_daily_v2
with (security_invoker=true)
as
select e.brand_id,e.entry_date as metric_date,
       sum(l.debit-l.credit)::numeric as operating_expense
from public.finance_journal_entries e
join public.finance_journal_lines l on l.entry_id=e.id
join public.finance_accounts a on a.brand_id=e.brand_id and a.code=l.account_code
where e.status<>'void' and a.account_type='EXPENSE' and a.code not in ('6400','6500')
group by e.brand_id,e.entry_date;
grant select on public.finance_operating_expense_daily_v2 to authenticated;

create or replace view public.finance_cash_movement_daily_v1
with (security_invoker=true)
as
select e.brand_id,e.entry_date as metric_date,
       sum(l.debit-l.credit)::numeric as net_cash_movement
from public.finance_journal_entries e
join public.finance_journal_lines l on l.entry_id=e.id
where e.status<>'void' and l.account_code in ('1000','1100')
group by e.brand_id,e.entry_date;
grant select on public.finance_cash_movement_daily_v1 to authenticated;

create or replace view public.finance_daily_summary
with (security_invoker=true)
as
with cap as (
  select private.has_capability('finance.read') as finance_allowed
), days as (
  select brand_id,metric_date from public.sales_daily_kpis
  union select brand_id,metric_date from public.finance_operating_expense_daily_v2
  union select brand_id,metric_date from public.finance_cash_movement_daily_v1
  union select brand_id,payment_date from public.purchase_payments
), sales as (
  select * from public.sales_daily_kpis
), opex as (
  select * from public.finance_operating_expense_daily_v2
), supplier_cash as (
  select brand_id,payment_date as metric_date,sum(amount) as supplier_payments
  from public.purchase_payments group by brand_id,payment_date
), cashflow as (
  select * from public.finance_cash_movement_daily_v1
)
select d.brand_id,d.metric_date,
  coalesce(s.revenue,0) as revenue,
  coalesce(s.cogs,0) as cogs,
  s.gross_profit,s.gross_margin_pct,
  case when cap.finance_allowed then coalesce(o.operating_expense,0) else null end as operating_expense,
  case when not cap.finance_allowed or s.gross_profit is null then null
       else s.gross_profit-coalesce(o.operating_expense,0) end as operating_profit,
  coalesce(s.cash_revenue,0)+coalesce(s.qris_revenue,0)+coalesce(s.transfer_revenue,0) as sales_cash_in,
  coalesce(sc.supplier_payments,0) as supplier_payments,
  case when cap.finance_allowed then coalesce(cf.net_cash_movement,0) else null end as net_cash_movement,
  coalesce(s.cogs_coverage_pct,0) as cogs_coverage_pct
from days d
cross join cap
left join sales s on s.brand_id=d.brand_id and s.metric_date=d.metric_date
left join opex o on o.brand_id=d.brand_id and o.metric_date=d.metric_date
left join supplier_cash sc on sc.brand_id=d.brand_id and sc.metric_date=d.metric_date
left join cashflow cf on cf.brand_id=d.brand_id and cf.metric_date=d.metric_date;
grant select on public.finance_daily_summary to authenticated;

create or replace view public.executive_kpi_snapshot
with (security_invoker=true)
as
with params as (
  select date_trunc('month',current_date)::date as month_start,
         current_date as today,
         (date_trunc('month',current_date)-interval '1 month')::date as prev_start,
         (date_trunc('month',current_date)::date-1) as prev_end,
         (current_date-date_trunc('month',current_date)::date) as elapsed_days
), cap as (
  select private.has_capability('finance.read') as finance_allowed
), brand_scope as (
  select id as brand_id from public.brands
), sales_mtd as (
  select k.brand_id,sum(k.revenue) revenue,sum(k.transactions) transactions,
         sum(k.units_sold) units_sold,sum(k.cogs_known_units) cogs_known_units,
         sum(k.cogs) cogs_recorded,max(k.last_updated_at) sales_updated_at
  from public.sales_daily_kpis k,params p
  where k.metric_date between p.month_start and p.today
  group by k.brand_id
), sales_prev as (
  select k.brand_id,sum(k.revenue) revenue
  from public.sales_daily_kpis k,params p
  where k.metric_date between p.prev_start and least(p.prev_start+p.elapsed_days,p.prev_end)
  group by k.brand_id
), opex_mtd as (
  select o.brand_id,sum(o.operating_expense) opex
  from public.finance_operating_expense_daily_v2 o,params p
  where o.metric_date between p.month_start and p.today
  group by o.brand_id
), supplier_payments_mtd as (
  select pp.brand_id,sum(pp.amount) supplier_payments
  from public.purchase_payments pp,params p
  where pp.payment_date between p.month_start and p.today
  group by pp.brand_id
), targets as (
  select t.brand_id,sum(t.target_value) revenue_target
  from public.business_targets t,params p
  where lower(btrim(t.metric))='revenue' and p.today between t.period_start and t.period_end
  group by t.brand_id
), approvals as (
  select brand_id,count(*) pending_approvals from public.approval_requests
  where status='pending' group by brand_id
), ap as (
  select brand_id,sum(outstanding_amount) ap_outstanding,
         sum(outstanding_amount) filter(where days_overdue>0) ap_overdue
  from public.accounts_payable_aging group by brand_id
)
select b.brand_id,p.month_start,p.today as as_of_date,
  coalesce(sm.revenue,0) as revenue_mtd,
  coalesce(sp.revenue,0) as revenue_prior_comparable_mtd,
  case when coalesce(sp.revenue,0)>0 then ((coalesce(sm.revenue,0)-sp.revenue)/sp.revenue)*100 else null end as revenue_growth_pct,
  coalesce(t.revenue_target,0) as revenue_target,
  case when coalesce(t.revenue_target,0)>0 then coalesce(sm.revenue,0)/t.revenue_target*100 else null end as revenue_target_achievement_pct,
  coalesce(sm.transactions,0) as transactions_mtd,
  case when coalesce(sm.transactions,0)>0 then coalesce(sm.revenue,0)/sm.transactions else 0 end as average_transaction_value,
  coalesce(sm.cogs_recorded,0) as cogs_mtd,
  case when coalesce(sm.units_sold,0)=0 or coalesce(sm.cogs_known_units,0)>=sm.units_sold
       then coalesce(sm.revenue,0)-coalesce(sm.cogs_recorded,0) else null end as gross_profit_mtd,
  case when coalesce(sm.revenue,0)>0 and (coalesce(sm.units_sold,0)=0 or coalesce(sm.cogs_known_units,0)>=sm.units_sold)
       then (coalesce(sm.revenue,0)-coalesce(sm.cogs_recorded,0))/sm.revenue*100 else null end as gross_margin_pct,
  case when cap.finance_allowed then coalesce(o.opex,0) else null end as operating_expense_mtd,
  case when not cap.finance_allowed then null
       when coalesce(sm.units_sold,0)>0 and coalesce(sm.cogs_known_units,0)<sm.units_sold then null
       else coalesce(sm.revenue,0)-coalesce(sm.cogs_recorded,0)-coalesce(o.opex,0) end as operating_profit_mtd,
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
  case when coalesce(sm.units_sold,0)>0 then coalesce(sm.cogs_known_units,0)/sm.units_sold*100 else 100 end as cogs_coverage_pct,
  case when sm.sales_updated_at is null then null else p.today-sm.sales_updated_at::date end as sales_data_age_days
from brand_scope b
cross join params p
cross join cap
left join sales_mtd sm on sm.brand_id=b.brand_id
left join sales_prev sp on sp.brand_id=b.brand_id
left join opex_mtd o on o.brand_id=b.brand_id
left join supplier_payments_mtd pm on pm.brand_id=b.brand_id
left join targets t on t.brand_id=b.brand_id
left join public.inventory_valuation_summary iv on iv.brand_id=b.brand_id
left join approvals a on a.brand_id=b.brand_id
left join ap on ap.brand_id=b.brand_id;
grant select on public.executive_kpi_snapshot to authenticated;
