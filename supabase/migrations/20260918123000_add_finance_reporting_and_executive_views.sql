-- Finance reporting + executive KPI backend.
-- Adds minimal chart of accounts, business targets, reconciled KPI views and Owner Decision Center.

begin;

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint finance_accounts_code_nonempty check (btrim(code)<>''),
  constraint finance_accounts_name_nonempty check (btrim(name)<>''),
  constraint finance_accounts_type_check check (
    account_type in ('ASSET','LIABILITY','EQUITY','REVENUE','COGS','EXPENSE')
  )
);

create unique index if not exists finance_accounts_brand_code_uidx
  on public.finance_accounts(brand_id,lower(btrim(code)));

alter table public.finance_accounts enable row level security;

create policy finance_accounts_read_same_brand
on public.finance_accounts for select to authenticated
using ((select private.same_brand(finance_accounts.brand_id)));

create policy finance_accounts_owner_write
on public.finance_accounts for all to authenticated
using (
  (select private.same_brand(finance_accounts.brand_id))
  and (select private.has_capability('settings.manage'))
)
with check (
  (select private.same_brand(finance_accounts.brand_id))
  and (select private.has_capability('settings.manage'))
);

grant select,insert,update,delete on public.finance_accounts to authenticated;

insert into public.finance_accounts(brand_id,code,name,account_type)
select b.id,x.code,x.name,x.account_type
from public.brands b
cross join (values
  ('1000','Cash','ASSET'),
  ('1100','Bank / QRIS Settlement','ASSET'),
  ('1300','Inventory','ASSET'),
  ('2000','Accounts Payable','LIABILITY'),
  ('3000','Owner Equity','EQUITY'),
  ('4000','Sales Revenue','REVENUE'),
  ('5000','Cost of Goods Sold','COGS'),
  ('6000','Operating Expenses','EXPENSE')
) as x(code,name,account_type)
where not exists (
  select 1 from public.finance_accounts fa
  where fa.brand_id=b.id and lower(btrim(fa.code))=lower(btrim(x.code))
);

create table if not exists public.business_targets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete cascade,
  metric text not null,
  period_start date not null,
  period_end date not null,
  target_value numeric not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_targets_metric_nonempty check (btrim(metric)<>''),
  constraint business_targets_period_check check (period_end>=period_start),
  constraint business_targets_value_nonnegative check (target_value>=0)
);

create index if not exists business_targets_lookup_idx
  on public.business_targets(brand_id,metric,period_start,period_end);
create index if not exists business_targets_outlet_idx
  on public.business_targets(outlet_id);
create index if not exists business_targets_created_by_idx
  on public.business_targets(created_by);

alter table public.business_targets enable row level security;

create policy business_targets_read_same_brand
on public.business_targets for select to authenticated
using ((select private.same_brand(business_targets.brand_id)));

create policy business_targets_write_management
on public.business_targets for all to authenticated
using (
  (select private.same_brand(business_targets.brand_id))
  and (select private.has_role(array['owner','head_store']))
)
with check (
  (select private.same_brand(business_targets.brand_id))
  and (select private.has_role(array['owner','head_store']))
  and (
    business_targets.outlet_id is null
    or exists (
      select 1 from public.outlets o
      where o.id=business_targets.outlet_id
        and o.brand_id=business_targets.brand_id
    )
  )
);

grant select,insert,update,delete on public.business_targets to authenticated;

create or replace view public.sales_daily_kpis
with (security_invoker=true)
as
with item_rollup as (
  select
    si.sale_id,
    sum(si.qty)::numeric as units_sold,
    sum(si.qty::numeric * si.unit_cogs) as cogs
  from public.sale_items si
  group by si.sale_id
)
select
  s.brand_id,
  s.sold_at as metric_date,
  sum(s.total_amount) as revenue,
  sum(s.transaction_count) as transactions,
  coalesce(sum(ir.units_sold),0) as units_sold,
  coalesce(sum(ir.cogs),0) as cogs,
  sum(s.total_amount)-coalesce(sum(ir.cogs),0) as gross_profit,
  case when sum(s.total_amount)>0
    then ((sum(s.total_amount)-coalesce(sum(ir.cogs),0))/sum(s.total_amount))*100
    else 0 end as gross_margin_pct,
  sum(s.cash_amount) as cash_revenue,
  sum(s.qris_amount) as qris_revenue,
  sum(s.tf_amount) as transfer_revenue,
  max(s.created_at) as last_updated_at
from public.sales s
left join item_rollup ir on ir.sale_id=s.id
group by s.brand_id,s.sold_at;

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
  coalesce(s.cogs,0) as cogs,
  coalesce(s.gross_profit,0) as gross_profit,
  coalesce(s.gross_margin_pct,0) as gross_margin_pct,
  coalesce(o.operating_expense,0) as operating_expense,
  coalesce(s.gross_profit,0)-coalesce(o.operating_expense,0) as operating_profit,
  coalesce(s.cash_revenue,0)+coalesce(s.qris_revenue,0)+coalesce(s.transfer_revenue,0) as sales_cash_in,
  coalesce(sc.supplier_payments,0) as supplier_payments,
  coalesce(s.cash_revenue,0)+coalesce(s.qris_revenue,0)+coalesce(s.transfer_revenue,0)
    -coalesce(o.operating_expense,0)-coalesce(sc.supplier_payments,0) as net_cash_movement
from days d
left join sales s on s.brand_id=d.brand_id and s.metric_date=d.metric_date
left join opex o on o.brand_id=d.brand_id and o.metric_date=d.metric_date
left join supplier_cash sc on sc.brand_id=d.brand_id and sc.metric_date=d.metric_date;

grant select on public.finance_daily_summary to authenticated;

create or replace view public.inventory_valuation_summary
with (security_invoker=true)
as
with latest_cost as (
  select distinct on (m.brand_id,m.inventory_item_id)
    m.brand_id,m.inventory_item_id,m.unit_cost,m.movement_date,m.created_at
  from public.inventory_movements m
  where m.unit_cost is not null
    and m.unit_cost>0
    and m.movement_date<=current_date
  order by m.brand_id,m.inventory_item_id,m.movement_date desc,m.created_at desc
)
select
  l.brand_id,
  count(*) as inventory_items,
  count(*) filter (where lc.unit_cost is not null) as valued_items,
  case when count(*)>0
    then (count(*) filter (where lc.unit_cost is not null))::numeric/count(*)*100
    else 0 end as cost_coverage_pct,
  sum(greatest(l.ledger_qty,0)*coalesce(lc.unit_cost,0)) as inventory_value,
  count(*) filter (where l.status='critical') as critical_items,
  count(*) filter (where l.status='order') as reorder_items,
  count(*) filter (where l.status='untracked') as untracked_items
from public.inventory_ledger_balance l
left join latest_cost lc
  on lc.brand_id=l.brand_id
 and lc.inventory_item_id=l.inventory_item_id
group by l.brand_id;

grant select on public.inventory_valuation_summary to authenticated;

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
    sum(k.cogs) as cogs,
    sum(k.gross_profit) as gross_profit,
    max(k.last_updated_at) as sales_updated_at
  from public.sales_daily_kpis k,params p
  where k.metric_date between p.month_start and p.today
  group by k.brand_id
),
sales_prev as (
  select
    k.brand_id,
    sum(k.revenue) as revenue
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
  from public.approval_requests
  where status='pending'
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
    then ((coalesce(sm.revenue,0)-sp.revenue)/sp.revenue)*100
    else null end as revenue_growth_pct,
  coalesce(t.revenue_target,0) as revenue_target,
  case when coalesce(t.revenue_target,0)>0
    then coalesce(sm.revenue,0)/t.revenue_target*100
    else null end as revenue_target_achievement_pct,
  coalesce(sm.transactions,0) as transactions_mtd,
  case when coalesce(sm.transactions,0)>0
    then coalesce(sm.revenue,0)/sm.transactions
    else 0 end as average_transaction_value,
  coalesce(sm.cogs,0) as cogs_mtd,
  coalesce(sm.gross_profit,0) as gross_profit_mtd,
  case when coalesce(sm.revenue,0)>0
    then coalesce(sm.gross_profit,0)/sm.revenue*100
    else 0 end as gross_margin_pct,
  coalesce(o.opex,0) as operating_expense_mtd,
  coalesce(sm.gross_profit,0)-coalesce(o.opex,0) as operating_profit_mtd,
  coalesce(pm.supplier_payments,0) as supplier_payments_mtd,
  coalesce(iv.inventory_value,0) as inventory_value_estimated,
  coalesce(iv.cost_coverage_pct,0) as inventory_cost_coverage_pct,
  coalesce(iv.critical_items,0) as critical_stock_items,
  coalesce(iv.reorder_items,0) as reorder_stock_items,
  coalesce(iv.untracked_items,0) as untracked_stock_items,
  coalesce(a.pending_approvals,0) as pending_approvals,
  coalesce(ap.ap_outstanding,0) as accounts_payable_outstanding,
  coalesce(ap.ap_overdue,0) as accounts_payable_overdue,
  sm.sales_updated_at
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
  ar.brand_id,
  ar.outlet_id,
  'APPROVAL'::text as decision_type,
  ar.id as entity_id,
  case when coalesce(ar.amount,0)>=5000000 then 'CRITICAL' else 'WARNING' end as severity,
  'Approval menunggu keputusan'::text as title,
  ar.entity_type||' · approver '||ar.approver_role as detail,
  ar.amount,
  ar.requested_at::date as event_date,
  greatest(current_date-ar.requested_at::date,0) as age_days
from public.approval_requests ar
where ar.status='pending'

union all

select
  l.brand_id,
  null::uuid as outlet_id,
  'STOCK'::text as decision_type,
  l.inventory_item_id as entity_id,
  case when l.status='critical' then 'CRITICAL' else 'WARNING' end as severity,
  case when l.status='critical' then 'Stok kritis' else 'Stok perlu dipesan' end as title,
  l.item_name||' · stok sistem '||l.ledger_qty::text||' '||l.unit as detail,
  null::numeric as amount,
  current_date as event_date,
  0 as age_days
from public.inventory_ledger_balance l
where l.status in ('critical','order')

union all

select
  ap.brand_id,
  ap.outlet_id,
  'AP_OVERDUE'::text as decision_type,
  ap.purchase_invoice_id as entity_id,
  case when ap.days_overdue>30 then 'CRITICAL' else 'WARNING' end as severity,
  'Tagihan supplier jatuh tempo'::text as title,
  ap.supplier_name||' · Invoice '||ap.invoice_no as detail,
  ap.outstanding_amount as amount,
  coalesce(ap.due_date,ap.invoice_date) as event_date,
  ap.days_overdue as age_days
from public.accounts_payable_aging ap
where ap.outstanding_amount>0 and ap.days_overdue>0;

grant select on public.executive_decision_center to authenticated;

comment on view public.executive_kpi_snapshot is
  'Owner/CEO MTD snapshot with comparable prior MTD, margin, operating profit, inventory, approvals and AP.';
comment on view public.executive_decision_center is
  'Dynamic action queue for approvals, stock exceptions and overdue supplier invoices.';

commit;
