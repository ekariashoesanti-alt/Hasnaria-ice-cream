create or replace function private.sync_sale_item_inventory_movement(p_sale_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sale_item public.sale_items%rowtype;
  v_brand_id uuid;
  v_sold_at date;
  v_recipe record;
  v_effective_from date;
begin
  delete from public.inventory_movements
  where reference_type = 'sale_item'
    and reference_id = p_sale_item_id
    and system_generated;

  select * into v_sale_item
  from public.sale_items
  where id = p_sale_item_id;

  if not found or v_sale_item.product_id is null then return; end if;

  select s.brand_id, s.sold_at into v_brand_id, v_sold_at
  from public.sales s where s.id = v_sale_item.sale_id;

  if v_brand_id is null or v_sold_at is null then return; end if;

  select prv.effective_from into v_effective_from
  from public.product_recipe_verifications prv
  where prv.product_id = v_sale_item.product_id
    and prv.brand_id = v_brand_id
    and prv.status = 'verified'
    and prv.effective_from is not null
    and prv.effective_from <= v_sold_at;

  if v_effective_from is null then return; end if;

  for v_recipe in
    select r.inventory_item_id, r.qty_per_sale
    from public.inventory_recipe_components r
    where r.brand_id = v_brand_id
      and r.product_id = v_sale_item.product_id
      and r.active
  loop
    perform private.sync_inventory_baseline(v_recipe.inventory_item_id);
    insert into public.inventory_movements(
      brand_id, inventory_item_id, movement_date, movement_type,
      qty_delta, reference_type, reference_id, source_key,
      system_generated, notes
    ) values (
      v_brand_id, v_recipe.inventory_item_id, v_sold_at,
      'SALE_CONSUMPTION', -(v_sale_item.qty::numeric * v_recipe.qty_per_sale),
      'sale_item', v_sale_item.id,
      'SALE_ITEM:' || v_sale_item.id::text || ':' || v_recipe.inventory_item_id::text,
      true, v_sale_item.item_name
    )
    on conflict (brand_id, source_key) where source_key is not null and btrim(source_key) <> ''
    do update set movement_date=excluded.movement_date, qty_delta=excluded.qty_delta, notes=excluded.notes;
  end loop;
end;
$function$;

revoke execute on function private.sync_sale_item_inventory_movement(uuid) from public, anon, authenticated;
grant execute on function private.sync_sale_item_inventory_movement(uuid) to service_role;

create or replace function private.refresh_inventory_sale_consumption_for_product(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sale_item_id uuid;
  v_scanned bigint := 0;
  v_movements bigint := 0;
  v_brand_id uuid;
begin
  select p.brand_id into v_brand_id from public.products p where p.id=p_product_id;
  if v_brand_id is null then raise exception 'Product not found'; end if;

  for v_sale_item_id in
    select si.id from public.sale_items si
    join public.sales s on s.id=si.sale_id
    where si.product_id=p_product_id and s.brand_id=v_brand_id
  loop
    v_scanned:=v_scanned+1;
    perform private.sync_sale_item_inventory_movement(v_sale_item_id);
  end loop;

  select count(*) into v_movements
  from public.inventory_movements m
  join public.sale_items si on si.id=m.reference_id
  where m.brand_id=v_brand_id
    and m.reference_type='sale_item'
    and m.movement_type='SALE_CONSUMPTION'
    and m.system_generated
    and si.product_id=p_product_id;

  return jsonb_build_object('product_id',p_product_id,'sale_items_scanned',v_scanned,'active_consumption_movements',v_movements);
end;
$function$;

revoke execute on function private.refresh_inventory_sale_consumption_for_product(uuid) from public, anon, authenticated;
grant execute on function private.refresh_inventory_sale_consumption_for_product(uuid) to service_role;

create or replace function private.mark_recipe_draft_and_refresh(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product public.products%rowtype;
  v_refresh jsonb;
begin
  select * into v_product from public.products where id=p_product_id;
  if not found then return jsonb_build_object('status','product_missing'); end if;

  insert into public.product_recipe_verifications(product_id,brand_id,status,verified_by,verified_at,effective_from,updated_at)
  values(p_product_id,v_product.brand_id,'draft',null,null,null,now())
  on conflict(product_id) do update
  set status='draft',verified_by=null,verified_at=null,effective_from=null,updated_at=now();

  update public.sale_items si
  set unit_cogs=0,unit_cogs_source='missing',unit_cogs_confidence='unknown',unit_cogs_computed_at=null
  from public.sales s
  where s.id=si.sale_id and s.brand_id=v_product.brand_id and si.product_id=p_product_id
    and si.unit_cogs_source='verified_recipe_temporal_cost';

  v_refresh:=private.refresh_inventory_sale_consumption_for_product(p_product_id);
  return jsonb_build_object('status','draft','inventory_refresh',v_refresh);
end;
$function$;

revoke execute on function private.mark_recipe_draft_and_refresh(uuid) from public, anon, authenticated;
grant execute on function private.mark_recipe_draft_and_refresh(uuid) to service_role;

create or replace function private.recipe_inventory_movement_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product_id uuid;
  v_old_product_id uuid;
begin
  if tg_op='DELETE' then v_product_id:=old.product_id; else v_product_id:=new.product_id; end if;
  perform private.mark_recipe_draft_and_refresh(v_product_id);
  if tg_op='UPDATE' then
    v_old_product_id:=old.product_id;
    if v_old_product_id is distinct from new.product_id then
      perform private.mark_recipe_draft_and_refresh(v_old_product_id);
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

revoke execute on function private.recipe_inventory_movement_trigger() from public, anon, authenticated;

create or replace function private.resolve_product_recipe_verification_v2(
  p_product_id uuid,
  p_verified boolean,
  p_effective_from date default null,
  p_reason text default null
)
returns public.product_recipe_verifications
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product public.products%rowtype;
  v_before public.product_recipe_verifications%rowtype;
  v_after public.product_recipe_verifications%rowtype;
  v_components bigint;
  v_effective date;
  v_refresh jsonb;
  v_inventory_refresh jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  select * into v_product from public.products where id=p_product_id;
  if not found then raise exception 'Product not found'; end if;
  if not private.same_brand(v_product.brand_id) or not private.can_stock_write() then raise exception 'Stock write permission required for this brand'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Reason is required'; end if;

  select count(*) into v_components from public.inventory_recipe_components
  where product_id=p_product_id and brand_id=v_product.brand_id and active;
  if p_verified and v_components=0 then raise exception 'Cannot verify a recipe with zero active components'; end if;

  v_effective:=case when p_verified then coalesce(p_effective_from,current_date) else null end;
  if p_verified and v_effective>current_date then raise exception 'Recipe effective date cannot be in the future'; end if;

  select * into v_before from public.product_recipe_verifications where product_id=p_product_id;

  insert into public.product_recipe_verifications(product_id,brand_id,status,notes,verified_by,verified_at,effective_from,updated_at)
  values(p_product_id,v_product.brand_id,case when p_verified then 'verified' else 'draft' end,
         nullif(btrim(coalesce(p_reason,'')),''),case when p_verified then auth.uid() else null end,
         case when p_verified then now() else null end,v_effective,now())
  on conflict(product_id) do update
  set status=excluded.status,notes=excluded.notes,verified_by=excluded.verified_by,
      verified_at=excluded.verified_at,effective_from=excluded.effective_from,updated_at=now()
  returning * into v_after;

  if p_verified then
    v_refresh:=private.refresh_verified_sale_cogs_for_product(p_product_id,v_effective,current_date);
  else
    update public.sale_items si
    set unit_cogs=0,unit_cogs_source='missing',unit_cogs_confidence='unknown',unit_cogs_computed_at=null
    from public.sales s
    where s.id=si.sale_id and s.brand_id=v_product.brand_id and si.product_id=p_product_id
      and si.unit_cogs_source='verified_recipe_temporal_cost';
    v_refresh:=jsonb_build_object('status','recipe_reopened','cogs_reset',true);
  end if;

  v_inventory_refresh:=private.refresh_inventory_sale_consumption_for_product(p_product_id);

  perform private.write_audit_log(v_product.brand_id,null,'product_recipe_verification',p_product_id,
    case when p_verified then 'VERIFY' else 'REOPEN' end,auth.uid(),
    case when v_before.product_id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),p_reason,
    jsonb_build_object('active_components',v_components,'effective_from',v_effective,'cogs_refresh',v_refresh,'inventory_refresh',v_inventory_refresh));
  return v_after;
end;
$function$;

create or replace function private.save_product_recipe_draft(p_product_id uuid,p_components jsonb,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product public.products%rowtype;
  v_component jsonb;
  v_item public.inventory_items%rowtype;
  v_item_id uuid;
  v_qty numeric;
  v_seen uuid[] := '{}'::uuid[];
  v_before jsonb;
  v_after jsonb;
  v_count int := 0;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if not private.same_brand(v_product.brand_id) or not private.can_stock_write() then raise exception 'Stock write permission required for this brand'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Reason is required'; end if;
  if p_components is null or jsonb_typeof(p_components)<>'array' or jsonb_array_length(p_components)=0 then raise exception 'At least one recipe component is required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('inventory_item_id',r.inventory_item_id,'qty_per_sale',r.qty_per_sale,'active',r.active) order by r.inventory_item_id::text),'[]'::jsonb)
  into v_before from public.inventory_recipe_components r where r.product_id=p_product_id and r.brand_id=v_product.brand_id;

  for v_component in select value from jsonb_array_elements(p_components)
  loop
    begin
      v_item_id:=nullif(btrim(v_component->>'inventory_item_id'),'')::uuid;
      v_qty:=nullif(btrim(v_component->>'qty_per_sale'),'')::numeric;
    exception when others then raise exception 'Invalid recipe component payload'; end;
    if v_item_id is null then raise exception 'Inventory item is required for every component'; end if;
    if v_qty is null or v_qty<=0 then raise exception 'qty_per_sale must be greater than zero'; end if;
    if v_item_id=any(v_seen) then raise exception 'Duplicate inventory item in recipe'; end if;
    select * into v_item from public.inventory_items where id=v_item_id;
    if not found or v_item.brand_id<>v_product.brand_id then raise exception 'Inventory item not found in active brand'; end if;
    v_seen:=array_append(v_seen,v_item_id);
  end loop;

  delete from public.inventory_recipe_components where product_id=p_product_id and brand_id=v_product.brand_id;
  for v_component in select value from jsonb_array_elements(p_components)
  loop
    v_item_id:=(v_component->>'inventory_item_id')::uuid;
    v_qty:=(v_component->>'qty_per_sale')::numeric;
    insert into public.inventory_recipe_components(brand_id,product_id,inventory_item_id,qty_per_sale,active)
    values(v_product.brand_id,p_product_id,v_item_id,v_qty,true);
    v_count:=v_count+1;
  end loop;

  insert into public.product_recipe_verifications(product_id,brand_id,status,notes,verified_by,verified_at,effective_from,updated_at)
  values(p_product_id,v_product.brand_id,'draft',btrim(p_reason),null,null,null,now())
  on conflict(product_id) do update set status='draft',notes=excluded.notes,verified_by=null,verified_at=null,effective_from=null,updated_at=now();

  select coalesce(jsonb_agg(jsonb_build_object('inventory_item_id',r.inventory_item_id,'qty_per_sale',r.qty_per_sale,'active',r.active) order by r.inventory_item_id::text),'[]'::jsonb)
  into v_after from public.inventory_recipe_components r where r.product_id=p_product_id and r.brand_id=v_product.brand_id;

  perform private.write_audit_log(v_product.brand_id,null,'product_recipe',p_product_id,'SAVE_DRAFT',auth.uid(),v_before,v_after,btrim(p_reason),jsonb_build_object('component_count',v_count,'verification_status','draft'));
  return jsonb_build_object('product_id',p_product_id,'component_count',v_count,'verification_status','draft','components',v_after);
end;
$function$;

create or replace function public.save_product_recipe_draft(p_product_id uuid,p_components jsonb,p_reason text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.save_product_recipe_draft(p_product_id,p_components,p_reason);
$function$;

revoke all on function public.save_product_recipe_draft(uuid,jsonb,text) from public, anon;
grant execute on function public.save_product_recipe_draft(uuid,jsonb,text) to authenticated, service_role;
revoke all on function private.save_product_recipe_draft(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function private.save_product_recipe_draft(uuid,jsonb,text) to service_role;

do $block$
declare v_product_id uuid;
begin
  for v_product_id in select distinct r.product_id from public.inventory_recipe_components r
  loop
    perform private.refresh_inventory_sale_consumption_for_product(v_product_id);
  end loop;
end;
$block$;

create or replace view public.ui_action_capabilities_v4 with (security_invoker=true) as
select action_type,resolution_mode,rpc_name,input_schema,notes
from public.ui_action_capabilities_v3
where action_type not in ('zero_amount_purchase','missing_recipe')
union all select 'zero_amount_purchase','rpc','resolve_zero_amount_purchase_candidate','{"source_history_id":"uuid","resolution":"actual_amount|exclude","effective_amount":"number>0 required for actual_amount","reason":"text required"}'::jsonb,'Raw source remains unchanged. actual_amount supplies audited effective amount; exclude removes the source row from downstream mapping/posting.'
union all select 'financing_payment_review','rpc','resolve_financing_payment_candidate','{"reason":"text recommended","cash_date":"date required for cash_paid","resolution":"cash_paid|liability_only|exclude","cash_amount":"number>0 required for cash_paid","source_history_id":"uuid"}'::jsonb,'Cashflow hanya berubah jika resolution=cash_paid; liability_only tetap non-cash.'
union all select 'untracked_stock','rpc','resolve_physical_stock_opname','{"inventory_item_id":"uuid","physical_qty":"number>=0","opname_date":"date<=today","reason":"text required"}'::jsonb,'Physical count only. System quantity is read from the ledger; no stock value is guessed.'
union all select 'missing_recipe','rpc','save_product_recipe_draft','{"product_id":"uuid","components":"array of {inventory_item_id,qty_per_sale>0}","reason":"text required"}'::jsonb,'Saves recipe as draft only. Recipe must be verified separately with effective_from before it can affect COGS or inventory consumption.';

grant select on public.ui_action_capabilities_v4 to authenticated, service_role;

create or replace view public.ui_contract_manifest_v4 with (security_invoker=true) as
select endpoint_name,endpoint_type,purpose,access_mode from public.ui_contract_manifest_v3
union all select 'ui_manual_input_requirements_v2','view','Checklist manual lengkap termasuk missing recipe, component cost, dan physical opname','read_only'
union all select 'resolve_zero_amount_purchase_candidate','rpc','Resolve zero-amount purchase without mutating raw import','owner_write'
union all select 'resolve_physical_stock_opname','rpc','Record explicit physical stock count against current ledger','owner_write'
union all select 'save_product_recipe_draft','rpc','Save recipe components as draft; verification remains separate and temporal','stock_write';

grant select on public.ui_contract_manifest_v4 to authenticated, service_role;