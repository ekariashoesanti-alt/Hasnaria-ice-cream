create or replace function public.get_ui_action_summary_v1(p_brand uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_pack jsonb;
  v_purchase_control jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required';
  end if;
  if p_brand is null or not private.same_brand(p_brand) then
    raise exception 'Brand access denied';
  end if;

  v_pack := private.get_ui_active_action_pack_v1(p_brand,12);

  select to_jsonb(r) into v_purchase_control
  from public.finance_purchase_reconciliation_monthly_v1 r
  where r.brand_id=p_brand
  order by r.period_month desc
  limit 1;

  return jsonb_build_object(
    'total', coalesce((v_pack->>'total')::bigint,0),
    'high', coalesce((v_pack->>'high')::bigint,0),
    'top_actions', coalesce(v_pack->'top_actions','[]'::jsonb),
    'purchase_control', coalesce(v_purchase_control,'{}'::jsonb)
  );
end;
$function$;
