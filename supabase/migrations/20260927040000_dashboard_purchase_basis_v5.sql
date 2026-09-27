-- Owner dashboard v5: active management reporting uses Purchase expense basis, not HPP.
-- Keep historical HPP objects intact for audit compatibility; do not query them on the active dashboard path.

create or replace view public.ui_management_monthly_purchase_basis_v1
with (security_invoker=true)
as
with months as (
  select p.period_month as month
  from public.finance_income_statement_purchase_basis_v1 p
  where p.brand_id=private.my_brand_id()
  union
  select c.month
  from public.owner_cashflow_monthly_v2 c
  where c.brand_id=private.my_brand_id()
), p as (
  select *
  from public.finance_income_statement_purchase_basis_v1
  where brand_id=private.my_brand_id()
), cf as (
  select *
  from public.owner_cashflow_monthly_v2
  where brand_id=private.my_brand_id()
)
select
  private.my_brand_id() as brand_id,
  m.month,
  coalesce(p.revenue_sales,0) as sales_revenue,
  coalesce(p.other_income,0) as other_income,
  coalesce(p.admin_expense,0) as admin_expense,
  coalesce(p.maintenance_expense,0) as maintenance_expense,
  coalesce(p.raw_material_expense,0) as raw_material_expense,
  coalesce(p.personnel_expense,0) as personnel_expense,
  coalesce(p.total_purchase_expense,0) as total_purchase_expense,
  coalesce(p.finance_expense,0) as finance_expense,
  coalesce(p.tax_expense,0) as tax_expense,
  coalesce(p.purchase_rows,0) as purchase_rows,
  coalesce(p.review_rows,0) as review_rows,
  coalesce(p.review_amount,0) as review_amount,
  coalesce(p.profit_before_tax,0) as profit_before_tax,
  coalesce(p.profit_after_tax,0) as profit_after_tax,
  coalesce(p.report_basis,'purchase_expense_categories') as report_basis,
  coalesce(cf.known_cash_in,0) as known_cash_in,
  coalesce(cf.known_cash_out,0) as known_cash_out,
  coalesce(cf.net_known_cash_movement,0) as net_known_cash_movement,
  coalesce(cf.credit_or_mixed_purchase,0) as credit_or_mixed_purchase,
  coalesce(cf.financing_liability_only,0) as financing_liability_only,
  coalesce(cf.financing_cash_paid,0) as financing_cash_paid,
  coalesce(cf.cashflow_data_status,'no_cashflow_data') as cashflow_data_status
from months m
left join p on p.period_month=m.month
left join cf on cf.month=m.month
order by m.month desc;

grant select on public.ui_management_monthly_purchase_basis_v1 to authenticated,service_role;

create or replace function private.get_ui_bootstrap_v5()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid;
  v_owner jsonb;
  v_freshness jsonb;
  v_purchase_control jsonb;
  v_total_actions bigint:=0;
  v_high_actions bigint:=0;
  v_inventory_items bigint:=0;
  v_inventory_tracked bigint:=0;
  v_inventory_critical bigint:=0;
  v_inventory_reorder bigint:=0;
  v_inventory_untracked bigint:=0;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  select up.brand_id into v_brand
  from public.user_profiles up
  where up.id=auth.uid() and up.status='active';
  if v_brand is null then raise exception 'Active brand profile required'; end if;

  select
    count(*),
    count(*) filter(where tracking_active),
    count(*) filter(where tracking_active and coalesce(system_qty,0)<=0),
    count(*) filter(where tracking_active and coalesce(system_qty,0)>0 and coalesce(min_qty,0)>0 and system_qty<min_qty),
    count(*) filter(where not tracking_active)
  into v_inventory_items,v_inventory_tracked,v_inventory_critical,v_inventory_reorder,v_inventory_untracked
  from public.inventory_stock_reconciliation
  where brand_id=v_brand;

  select count(*),count(*) filter(where priority='high')
  into v_total_actions,v_high_actions
  from public.ui_erp_action_queue_v4
  where brand_id=v_brand
    and action_type not in ('missing_recipe','missing_component_cost','recipe_verification');

  select to_jsonb(f) into v_freshness
  from public.ui_data_freshness f
  where f.brand_id=v_brand
  limit 1;

  select to_jsonb(r) into v_purchase_control
  from public.finance_purchase_reconciliation_monthly_v1 r
  where r.brand_id=v_brand
  order by r.period_month desc
  limit 1;

  v_owner:=jsonb_build_object(
    'brand_id',v_brand,
    'total_open_actions',v_total_actions,
    'high_priority_actions',v_high_actions,
    'inventory_items',v_inventory_items,
    'inventory_tracked',v_inventory_tracked,
    'inventory_critical',v_inventory_critical,
    'inventory_reorder',v_inventory_reorder,
    'inventory_untracked',v_inventory_untracked,
    'purchase_control',coalesce(v_purchase_control,'{}'::jsonb)
  );

  return jsonb_build_object(
    'owner',v_owner,
    'freshness',coalesce(v_freshness,'{}'::jsonb),
    'top_actions',coalesce((
      select jsonb_agg(to_jsonb(a) order by a.action_rank)
      from (
        select * from public.ui_erp_action_queue_v4
        where brand_id=v_brand
          and action_type not in ('missing_recipe','missing_component_cost','recipe_verification')
        order by action_rank
        limit 12
      ) a
    ),'[]'::jsonb),
    'manual_input_requirements',coalesce((
      select jsonb_agg(to_jsonb(r) order by case r.priority when 'high' then 1 when 'medium' then 2 else 3 end,r.requirement_type)
      from public.ui_manual_input_requirements_v2 r
      where r.brand_id=v_brand and r.open_items>0
        and r.requirement_type not in ('missing_recipe','missing_component_cost','recipe_verification')
    ),'[]'::jsonb),
    'finance_alerts',coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order) from public.ui_finance_alerts a),'[]'::jsonb),
    'monthly_trend',coalesce((
      select jsonb_agg(to_jsonb(m) order by m.month desc)
      from (
        select * from public.ui_management_monthly_purchase_basis_v1
        where brand_id=v_brand
        order by month desc
        limit 12
      ) m
    ),'[]'::jsonb),
    'report_basis','purchase_expense_categories',
    'hpp_status','retired'
  );
end;
$$;

create or replace function public.get_ui_bootstrap_v5()
returns jsonb
language sql
set search_path=''
as $$ select private.get_ui_bootstrap_v5(); $$;

grant execute on function public.get_ui_bootstrap_v5() to authenticated,service_role;
