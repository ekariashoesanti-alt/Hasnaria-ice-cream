-- Extend CEO backend with workforce and marketing summary metrics.

begin;

create or replace view public.workforce_mtd_summary
with (security_invoker=true)
as
with month_params as (
  select date_trunc('month',current_date)::date as month_start,current_date as today
),
headcount as (
  select brand_id,count(*) as active_headcount
  from public.employees
  where status='active'
  group by brand_id
),
att as (
  select
    a.brand_id,
    count(*) filter (where a.attendance_date=current_date and a.status in ('present','late')) as present_today,
    count(*) filter (where a.attendance_date=current_date and a.status='late') as late_today,
    count(*) filter (where a.status='late') as late_events_mtd,
    sum(
      case when a.check_in_at is not null and a.check_out_at is not null
        then extract(epoch from (a.check_out_at-a.check_in_at))/3600
        else 0 end
    ) as worked_hours_mtd
  from public.attendance a,month_params p
  where a.attendance_date between p.month_start and p.today
  group by a.brand_id
),
ot as (
  select
    o.brand_id,
    coalesce(sum(o.minutes) filter (where o.status in ('recorded','approved')),0) as overtime_minutes_mtd
  from public.overtime_records o,month_params p
  where o.work_date between p.month_start and p.today
  group by o.brand_id
),
sales as (
  select
    k.brand_id,sum(k.revenue) as revenue_mtd
  from public.sales_daily_kpis k,month_params p
  where k.metric_date between p.month_start and p.today
  group by k.brand_id
)
select
  b.id as brand_id,
  coalesce(h.active_headcount,0) as active_headcount,
  coalesce(a.present_today,0) as present_today,
  coalesce(a.late_today,0) as late_today,
  coalesce(a.late_events_mtd,0) as late_events_mtd,
  coalesce(a.worked_hours_mtd,0) as worked_hours_mtd,
  coalesce(o.overtime_minutes_mtd,0) as overtime_minutes_mtd,
  coalesce(s.revenue_mtd,0) as revenue_mtd,
  case when coalesce(a.worked_hours_mtd,0)>0
    then coalesce(s.revenue_mtd,0)/a.worked_hours_mtd
    else null end as sales_per_worked_hour_mtd
from public.brands b
left join headcount h on h.brand_id=b.id
left join att a on a.brand_id=b.id
left join ot o on o.brand_id=b.id
left join sales s on s.brand_id=b.id;

grant select on public.workforce_mtd_summary to authenticated;

create or replace view public.marketing_mtd_summary
with (security_invoker=true)
as
with month_params as (
  select date_trunc('month',current_date)::date as month_start,current_date as today
),
active_campaigns as (
  select brand_id,count(*) as active_campaigns
  from public.marketing_campaigns
  where status='active'
    and current_date between start_date and end_date
  group by brand_id
),
spend as (
  select
    c.brand_id,sum(cm.spend) as spend_mtd
  from public.campaign_metrics cm
  join public.marketing_campaigns c on c.id=cm.campaign_id
  cross join month_params p
  where cm.metric_date between p.month_start and p.today
  group by c.brand_id
),
attrib as (
  select
    sa.brand_id,
    count(distinct sa.sale_id) as attributed_transactions_mtd,
    sum(s.total_amount) as attributed_revenue_mtd
  from public.sale_attributions sa
  join public.sales s on s.id=sa.sale_id
  cross join month_params p
  where s.sold_at between p.month_start and p.today
  group by sa.brand_id
)
select
  b.id as brand_id,
  coalesce(ac.active_campaigns,0) as active_campaigns,
  coalesce(sp.spend_mtd,0) as marketing_spend_mtd,
  coalesce(at.attributed_transactions_mtd,0) as attributed_transactions_mtd,
  coalesce(at.attributed_revenue_mtd,0) as attributed_revenue_mtd,
  case when coalesce(sp.spend_mtd,0)>0
    then coalesce(at.attributed_revenue_mtd,0)/sp.spend_mtd
    else null end as marketing_roas_mtd
from public.brands b
left join active_campaigns ac on ac.brand_id=b.id
left join spend sp on sp.brand_id=b.id
left join attrib at on at.brand_id=b.id;

grant select on public.marketing_mtd_summary to authenticated;

create or replace view public.executive_dashboard_snapshot
with (security_invoker=true)
as
with decision_counts as (
  select
    d.brand_id,
    count(*) filter (where d.severity='CRITICAL') as critical_decisions,
    count(*) filter (where d.severity='WARNING') as warning_decisions,
    count(*) as total_decisions
  from public.executive_decision_center d
  group by d.brand_id
)
select
  k.*,
  c.reported_cash_position,
  c.latest_cash_variance_total,
  c.last_cash_close_at,
  coalesce(dc.critical_decisions,0) as critical_decisions,
  coalesce(dc.warning_decisions,0) as warning_decisions,
  coalesce(dc.total_decisions,0) as total_decisions,
  coalesce(w.active_headcount,0) as active_headcount,
  coalesce(w.present_today,0) as present_today,
  coalesce(w.late_today,0) as late_today,
  coalesce(w.worked_hours_mtd,0) as worked_hours_mtd,
  coalesce(w.overtime_minutes_mtd,0) as overtime_minutes_mtd,
  w.sales_per_worked_hour_mtd,
  coalesce(m.active_campaigns,0) as active_campaigns,
  coalesce(m.marketing_spend_mtd,0) as marketing_spend_mtd,
  coalesce(m.attributed_transactions_mtd,0) as marketing_attributed_transactions_mtd,
  coalesce(m.attributed_revenue_mtd,0) as marketing_attributed_revenue_mtd,
  m.marketing_roas_mtd
from public.executive_kpi_snapshot k
left join public.cash_position_summary c on c.brand_id=k.brand_id
left join decision_counts dc on dc.brand_id=k.brand_id
left join public.workforce_mtd_summary w on w.brand_id=k.brand_id
left join public.marketing_mtd_summary m on m.brand_id=k.brand_id;

grant select on public.executive_dashboard_snapshot to authenticated;

comment on view public.workforce_mtd_summary is
  'CEO workforce summary: headcount, attendance, worked hours, overtime and sales per worked hour.';
comment on view public.marketing_mtd_summary is
  'CEO marketing summary: active campaigns, MTD spend, attributed transactions/revenue and ROAS.';

commit;
