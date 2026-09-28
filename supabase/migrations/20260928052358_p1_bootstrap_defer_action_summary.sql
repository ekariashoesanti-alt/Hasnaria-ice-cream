create or replace function private.get_ui_bootstrap_v6()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_brand uuid;
  v_owner jsonb;
  v_freshness jsonb;
  v_purchase_control jsonb;
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
    'total_open_actions',null,
    'high_priority_actions',null,
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
    'top_actions','[]'::jsonb,
    'manual_input_requirements','[]'::jsonb,
    'monthly_trend','[]'::jsonb,
    'report_basis','purchase_expense_categories',
    'hpp_status','retired'
  );
end;
$function$;
