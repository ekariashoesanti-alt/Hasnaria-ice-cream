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
  if current_setting('hasnaria.recipe_bulk_edit', true) = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_product_id := old.product_id;
  else
    v_product_id := new.product_id;
  end if;

  perform private.mark_recipe_draft_and_refresh(v_product_id);

  if tg_op = 'UPDATE' then
    v_old_product_id := old.product_id;
    if v_old_product_id is distinct from new.product_id then
      perform private.mark_recipe_draft_and_refresh(v_old_product_id);
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke execute on function private.recipe_inventory_movement_trigger() from public, anon, authenticated;

create or replace function private.save_product_recipe_draft(
  p_product_id uuid,
  p_components jsonb,
  p_reason text default null
)
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
  v_refresh jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if not private.same_brand(v_product.brand_id) or not private.can_stock_write() then
    raise exception 'Stock write permission required for this brand';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Reason is required'; end if;
  if p_components is null or jsonb_typeof(p_components) <> 'array' or jsonb_array_length(p_components)=0 then
    raise exception 'At least one recipe component is required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'inventory_item_id',r.inventory_item_id,
    'qty_per_sale',r.qty_per_sale,
    'active',r.active
  ) order by r.inventory_item_id::text),'[]'::jsonb)
  into v_before
  from public.inventory_recipe_components r
  where r.product_id=p_product_id and r.brand_id=v_product.brand_id;

  for v_component in select value from jsonb_array_elements(p_components)
  loop
    begin
      v_item_id := nullif(btrim(v_component->>'inventory_item_id'),'')::uuid;
      v_qty := nullif(btrim(v_component->>'qty_per_sale'),'')::numeric;
    exception when others then
      raise exception 'Invalid recipe component payload';
    end;
    if v_item_id is null then raise exception 'Inventory item is required for every component'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'qty_per_sale must be greater than zero'; end if;
    if v_item_id = any(v_seen) then raise exception 'Duplicate inventory item in recipe'; end if;
    select * into v_item from public.inventory_items where id=v_item_id;
    if not found or v_item.brand_id<>v_product.brand_id then
      raise exception 'Inventory item not found in active brand';
    end if;
    v_seen := array_append(v_seen,v_item_id);
  end loop;

  perform set_config('hasnaria.recipe_bulk_edit','1',true);

  delete from public.inventory_recipe_components
  where product_id=p_product_id and brand_id=v_product.brand_id;

  for v_component in select value from jsonb_array_elements(p_components)
  loop
    v_item_id := (v_component->>'inventory_item_id')::uuid;
    v_qty := (v_component->>'qty_per_sale')::numeric;
    insert into public.inventory_recipe_components(
      brand_id,product_id,inventory_item_id,qty_per_sale,active
    ) values (
      v_product.brand_id,p_product_id,v_item_id,v_qty,true
    );
    v_count := v_count + 1;
  end loop;

  perform set_config('hasnaria.recipe_bulk_edit','0',true);
  v_refresh := private.mark_recipe_draft_and_refresh(p_product_id);

  update public.product_recipe_verifications
  set notes=btrim(p_reason),updated_at=now()
  where product_id=p_product_id and brand_id=v_product.brand_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'inventory_item_id',r.inventory_item_id,
    'qty_per_sale',r.qty_per_sale,
    'active',r.active
  ) order by r.inventory_item_id::text),'[]'::jsonb)
  into v_after
  from public.inventory_recipe_components r
  where r.product_id=p_product_id and r.brand_id=v_product.brand_id;

  perform private.write_audit_log(
    v_product.brand_id,null,'product_recipe',p_product_id,'SAVE_DRAFT',auth.uid(),
    v_before,v_after,btrim(p_reason),
    jsonb_build_object('component_count',v_count,'verification_status','draft','inventory_refresh',v_refresh)
  );

  return jsonb_build_object(
    'product_id',p_product_id,
    'component_count',v_count,
    'verification_status','draft',
    'components',v_after,
    'inventory_refresh',v_refresh
  );
exception when others then
  perform set_config('hasnaria.recipe_bulk_edit','0',true);
  raise;
end;
$function$;