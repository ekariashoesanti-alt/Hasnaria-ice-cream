-- P1 final startup optimization.
-- Keep the blocking bootstrap lightweight; expensive 12-month management trend
-- and quality requirements are loaded only when their UI sections are opened.

create or replace function public.get_ui_monthly_trend_v1(
  p_brand uuid,
  p_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,12),24));
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  if p_brand is null or not private.same_brand(p_brand) then raise exception 'Brand access denied'; end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.month desc),'[]'::jsonb)
  into v_rows
  from (
    select *
    from public.ui_management_monthly_purchase_basis_v1
    where brand_id=p_brand
    order by month desc
    limit v_limit
  ) m;

  return coalesce(v_rows,'[]'::jsonb);
end;
$$;

revoke all on function public.get_ui_monthly_trend_v1(uuid,integer) from public,anon;
grant execute on function public.get_ui_monthly_trend_v1(uuid,integer) to authenticated,service_role;

create or replace function private.get_ui_bootstrap_v6()
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
  v_action_pack jsonb;
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

  -- One materialized action-queue evaluation feeds both counts and top actions.
  v_action_pack:=private.get_ui_active_action_pack_v1(v_brand,12);
  v_total_actions:=coalesce((v_action_pack->>'total')::bigint,0);
  v_high_actions:=coalesce((v_action_pack->>'high')::bigint,0);

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
    'top_actions',coalesce(v_action_pack->'top_actions','[]'::jsonb),
    'manual_input_requirements','[]'::jsonb,
    'monthly_trend','[]'::jsonb,
    'report_basis','purchase_expense_categories',
    'hpp_status','retired'
  );
end;
$$;

revoke all on function private.get_ui_bootstrap_v6() from public;

create or replace function public.get_ui_bootstrap_v6()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  return private.get_ui_bootstrap_v6();
end;
$$;

revoke all on function public.get_ui_bootstrap_v6() from public,anon;
grant execute on function public.get_ui_bootstrap_v6() to authenticated,service_role;
