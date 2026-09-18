-- Budgeting, purchase price variance and business alert rules.

begin;

insert into public.business_settings(brand_id,setting_key,setting_value,category,description)
select b.id,x.setting_key,x.setting_value::jsonb,'alerts',x.description
from public.brands b
cross join (values
  ('sales_drop_warning_pct','15','7-day revenue drop warning threshold'),
  ('purchase_price_increase_warning_pct','10','Supplier item price increase warning threshold'),
  ('waste_pct_warning','10','7-day waste quantity vs latest baseline warning threshold'),
  ('approval_sla_days','2','Pending approval aging threshold in days')
) x(setting_key,setting_value,description)
where lower(btrim(b.name))='hasnaria'
  and not exists (
    select 1 from public.business_settings s
    where s.brand_id=b.id
      and lower(btrim(s.setting_key))=lower(btrim(x.setting_key))
  );

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete cascade,
  category text not null,
  period_start date not null,
  period_end date not null,
  budget_amount numeric not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_category_nonempty check (btrim(category)<>''),
  constraint budgets_period_check check (period_end>=period_start),
  constraint budgets_amount_nonnegative check (budget_amount>=0)
);

create unique index if not exists budgets_scope_uidx
  on public.budgets(
    brand_id,
    coalesce(outlet_id,'00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(category)),
    period_start,
    period_end
  );
create index if not exists budgets_outlet_idx on public.budgets(outlet_id);
create index if not exists budgets_created_by_idx on public.budgets(created_by);

alter table public.budgets enable row level security;

create policy budgets_read_finance
on public.budgets for select to authenticated
using (
  (select private.same_brand(budgets.brand_id))
  and (select private.has_capability('finance.read'))
);

create policy budgets_insert_management
on public.budgets for insert to authenticated
with check (
  (select private.same_brand(budgets.brand_id))
  and (select private.has_role(array['owner','head_store']))
  and (
    budgets.outlet_id is null
    or exists (
      select 1 from public.outlets o
      where o.id=budgets.outlet_id and o.brand_id=budgets.brand_id
    )
  )
);

create policy budgets_update_management
on public.budgets for update to authenticated
using (
  (select private.same_brand(budgets.brand_id))
  and (select private.has_role(array['owner','head_store']))
)
with check (
  (select private.same_brand(budgets.brand_id))
  and (select private.has_role(array['owner','head_store']))
  and (
    budgets.outlet_id is null
    or exists (
      select 1 from public.outlets o
      where o.id=budgets.outlet_id and o.brand_id=budgets.brand_id
    )
  )
);

create policy budgets_delete_management
on public.budgets for delete to authenticated
using (
  (select private.same_brand(budgets.brand_id))
  and (select private.has_role(array['owner','head_store']))
);

grant select,insert,update,delete on public.budgets to authenticated;

create or replace view public.budget_vs_actual
with (security_invoker=true)
as
select
  b.brand_id,
  b.outlet_id,
  b.id as budget_id,
  b.category,
  b.period_start,
  b.period_end,
  b.budget_amount,
  coalesce(sum(e.amount),0) as actual_amount,
  coalesce(sum(e.amount),0)-b.budget_amount as variance_amount,
  case when b.budget_amount>0
    then coalesce(sum(e.amount),0)/b.budget_amount*100
    else null end as utilization_pct
from public.budgets b
left join public.expenses e
  on e.brand_id=b.brand_id
 and lower(btrim(e.category))=lower(btrim(b.category))
 and e.expense_date between b.period_start and b.period_end
 and e.status in ('recorded','approved')
group by b.id;

grant select on public.budget_vs_actual to authenticated;

create or replace view public.purchase_price_variance
with (security_invoker=true)
as
with priced as (
  select
    po.brand_id,
    po.supplier_id,
    s.name as supplier_name,
    poi.inventory_item_id,
    poi.item_name,
    po.id as purchase_order_id,
    po.po_no,
    po.order_date,
    poi.unit_price,
    lag(poi.unit_price) over (
      partition by po.brand_id,po.supplier_id,poi.inventory_item_id
      order by po.order_date,po.created_at,poi.created_at
    ) as previous_unit_price
  from public.purchase_order_items poi
  join public.purchase_orders po on po.id=poi.purchase_order_id
  join public.suppliers s on s.id=po.supplier_id
  where po.status<>'cancelled'
    and poi.inventory_item_id is not null
)
select
  p.*,
  p.unit_price-coalesce(p.previous_unit_price,p.unit_price) as price_delta,
  case when coalesce(p.previous_unit_price,0)>0
    then (p.unit_price-p.previous_unit_price)/p.previous_unit_price*100
    else null end as price_change_pct
from priced p;

grant select on public.purchase_price_variance to authenticated;

create or replace view public.sales_anomaly_summary
with (security_invoker=true)
as
with anchor as (
  select brand_id,max(metric_date) as anchor_date
  from public.sales_daily_kpis
  group by brand_id
),
rollup as (
  select
    a.brand_id,
    a.anchor_date,
    coalesce(sum(k.revenue) filter (
      where k.metric_date between a.anchor_date-6 and a.anchor_date
    ),0) as revenue_last_7d,
    coalesce(sum(k.revenue) filter (
      where k.metric_date between a.anchor_date-13 and a.anchor_date-7
    ),0) as revenue_prev_7d
  from anchor a
  left join public.sales_daily_kpis k on k.brand_id=a.brand_id
  group by a.brand_id,a.anchor_date
)
select
  r.*,
  case when r.revenue_prev_7d>0
    then (r.revenue_last_7d-r.revenue_prev_7d)/r.revenue_prev_7d*100
    else null end as revenue_change_pct
from rollup r;

grant select on public.sales_anomaly_summary to authenticated;

create or replace view public.inventory_waste_summary
with (security_invoker=true)
as
with latest_opname as (
  select distinct on (o.brand_id,o.inventory_item_id)
    o.brand_id,o.inventory_item_id,o.opname_date,o.physical_qty
  from public.inventory_stock_opname o
  where o.opname_date<=current_date
  order by o.brand_id,o.inventory_item_id,o.opname_date desc,o.created_at desc
),
waste as (
  select
    m.brand_id,m.inventory_item_id,
    sum(abs(m.qty_delta)) as waste_qty_7d,
    count(*) as waste_events_7d
  from public.inventory_movements m
  where m.movement_type='WASTE'
    and m.movement_date between current_date-6 and current_date
  group by m.brand_id,m.inventory_item_id
)
select
  w.brand_id,
  w.inventory_item_id,
  i.item_name,
  i.unit,
  w.waste_qty_7d,
  w.waste_events_7d,
  lo.physical_qty as latest_baseline_qty,
  case when coalesce(lo.physical_qty,0)>0
    then w.waste_qty_7d/lo.physical_qty*100
    else null end as waste_vs_baseline_pct
from waste w
join public.inventory_items i on i.id=w.inventory_item_id
left join latest_opname lo
  on lo.brand_id=w.brand_id and lo.inventory_item_id=w.inventory_item_id;

grant select on public.inventory_waste_summary to authenticated;

create or replace view public.business_alerts
with (security_invoker=true)
as
with settings as (
  select
    b.id as brand_id,
    coalesce((
      select (s.setting_value #>> '{}')::numeric
      from public.business_settings s
      where s.brand_id=b.id and lower(btrim(s.setting_key))='sales_drop_warning_pct'
    ),15) as sales_drop_pct,
    coalesce((
      select (s.setting_value #>> '{}')::numeric
      from public.business_settings s
      where s.brand_id=b.id and lower(btrim(s.setting_key))='purchase_price_increase_warning_pct'
    ),10) as price_increase_pct,
    coalesce((
      select (s.setting_value #>> '{}')::numeric
      from public.business_settings s
      where s.brand_id=b.id and lower(btrim(s.setting_key))='waste_pct_warning'
    ),10) as waste_pct,
    coalesce((
      select (s.setting_value #>> '{}')::integer
      from public.business_settings s
      where s.brand_id=b.id and lower(btrim(s.setting_key))='approval_sla_days'
    ),2) as approval_sla_days
  from public.brands b
),
latest_price as (
  select *
  from (
    select
      ppv.*,
      row_number() over (
        partition by ppv.brand_id,ppv.supplier_id,ppv.inventory_item_id
        order by ppv.order_date desc,ppv.purchase_order_id desc
      ) as rn
    from public.purchase_price_variance ppv
    where ppv.price_change_pct is not null
  ) x
  where rn=1
)
select
  sa.brand_id,
  null::uuid as outlet_id,
  'SALES_DROP'::text as event_code,
  case when sa.revenue_change_pct<=-(s.sales_drop_pct*2) then 'CRITICAL' else 'WARNING' end as severity,
  null::uuid as entity_id,
  'Penjualan 7 hari menurun'::text as title,
  'Perubahan '||round(sa.revenue_change_pct,1)::text||'% vs 7 hari sebelumnya' as detail,
  sa.anchor_date as event_date,
  abs(sa.revenue_change_pct) as metric_value
from public.sales_anomaly_summary sa
join settings s on s.brand_id=sa.brand_id
where sa.revenue_prev_7d>0
  and sa.revenue_change_pct<=-s.sales_drop_pct

union all

select
  l.brand_id,null::uuid,'LOW_STOCK',
  case when l.status='critical' then 'CRITICAL' else 'WARNING' end,
  l.inventory_item_id,
  case when l.status='critical' then 'Stok kritis' else 'Stok perlu dipesan' end,
  l.item_name||' · stok '||l.ledger_qty::text||' '||l.unit,
  current_date,
  l.ledger_qty
from public.inventory_ledger_balance l
where l.status in ('critical','order')

union all

select
  w.brand_id,null::uuid,'HIGH_WASTE','WARNING',
  w.inventory_item_id,
  'Waste tinggi',
  w.item_name||' · waste 7 hari '||round(w.waste_vs_baseline_pct,1)::text||'% dari baseline',
  current_date,
  w.waste_vs_baseline_pct
from public.inventory_waste_summary w
join settings s on s.brand_id=w.brand_id
where w.waste_vs_baseline_pct is not null
  and w.waste_vs_baseline_pct>=s.waste_pct

union all

select
  b.brand_id,b.outlet_id,'OVER_BUDGET',
  case when b.utilization_pct>=120 then 'CRITICAL' else 'WARNING' end,
  b.budget_id,
  'Budget terlampaui',
  b.category||' · realisasi '||round(b.utilization_pct,1)::text||'%',
  current_date,
  b.utilization_pct
from public.budget_vs_actual b
where b.actual_amount>b.budget_amount

union all

select
  p.brand_id,null::uuid,'PRICE_INCREASE',
  case when p.price_change_pct>=s.price_increase_pct*2 then 'CRITICAL' else 'WARNING' end,
  p.purchase_order_id,
  'Harga beli meningkat',
  p.item_name||' · '||round(p.price_change_pct,1)::text||'% dari harga sebelumnya',
  p.order_date,
  p.price_change_pct
from latest_price p
join settings s on s.brand_id=p.brand_id
where p.price_change_pct>=s.price_increase_pct

union all

select
  ar.brand_id,ar.outlet_id,'LATE_APPROVAL',
  case when current_date-ar.requested_at::date>=s.approval_sla_days*2 then 'CRITICAL' else 'WARNING' end,
  ar.id,
  'Approval melewati SLA',
  ar.entity_type||' · menunggu '||(current_date-ar.requested_at::date)::text||' hari',
  ar.requested_at::date,
  (current_date-ar.requested_at::date)::numeric
from public.approval_requests ar
join settings s on s.brand_id=ar.brand_id
where ar.status='pending'
  and current_date-ar.requested_at::date>=s.approval_sla_days

union all

select
  e.brand_id,e.outlet_id,e.event_code,e.severity,e.entity_id,e.title,
  coalesce(e.detail,e.event_code),e.detected_at::date,
  case
    when e.metadata ? 'variance' then (e.metadata->>'variance')::numeric
    else null
  end
from public.exception_events e
where e.resolved_at is null
  and e.event_code in ('CASH_VARIANCE','SETTLEMENT_VARIANCE');

grant select on public.business_alerts to authenticated;

-- Extend Decision Center with alert types not already represented there.
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
  a.brand_id,a.outlet_id,a.event_code,a.entity_id,a.severity,a.title,a.detail,
  null::numeric,a.event_date,greatest(current_date-a.event_date,0)
from public.business_alerts a
where a.event_code in ('SALES_DROP','HIGH_WASTE','OVER_BUDGET','PRICE_INCREASE','LATE_APPROVAL')

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

comment on view public.business_alerts is
  'Unified business alert rules: sales drop, low stock, high waste, over budget, purchase price increase, late approval and persisted cash/settlement variance.';

commit;
