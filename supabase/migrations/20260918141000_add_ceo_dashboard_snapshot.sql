-- Consolidated CEO-ready snapshot including cash position and decision counts.

begin;

create or replace view public.cash_position_summary
with (security_invoker=true)
as
with ranked as (
  select
    cs.*,
    row_number() over (
      partition by cs.brand_id,cs.outlet_id
      order by cs.session_date desc,cs.closed_at desc nulls last,cs.created_at desc
    ) as rn
  from public.cash_sessions cs
  where cs.status='closed'
)
select
  r.brand_id,
  sum(r.actual_closing_cash) as reported_cash_position,
  sum(coalesce(r.variance,0)) as latest_cash_variance_total,
  max(r.closed_at) as last_cash_close_at,
  count(*) as outlets_with_closed_cash
from ranked r
where r.rn=1
group by r.brand_id;

grant select on public.cash_position_summary to authenticated;

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
  coalesce(dc.total_decisions,0) as total_decisions
from public.executive_kpi_snapshot k
left join public.cash_position_summary c on c.brand_id=k.brand_id
left join decision_counts dc on dc.brand_id=k.brand_id;

grant select on public.executive_dashboard_snapshot to authenticated;

comment on view public.executive_dashboard_snapshot is
  'CEO-ready consolidated snapshot: commercial KPI, profit quality, inventory, AP, latest reported cash and decision counts.';

commit;
