create or replace function private.resolve_physical_stock_opname(
  p_inventory_item_id uuid,
  p_physical_qty numeric,
  p_opname_date date default current_date,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_brand_id uuid;
  v_item public.inventory_items%rowtype;
  v_system_qty numeric;
  v_opname public.inventory_stock_opname%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required';
  end if;

  v_brand_id := private.my_brand_id();
  if v_brand_id is null or not private.can_stock_write() then
    raise exception 'Stock write permission required';
  end if;

  if p_inventory_item_id is null then
    raise exception 'Inventory item is required';
  end if;
  if p_physical_qty is null or p_physical_qty < 0 then
    raise exception 'Physical quantity must be zero or greater';
  end if;
  if p_opname_date is null then
    raise exception 'Opname date is required';
  end if;
  if p_opname_date > current_date then
    raise exception 'Future-dated stock opname is not allowed';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Reason is required';
  end if;

  select * into v_item
  from public.inventory_items
  where id = p_inventory_item_id and brand_id = v_brand_id;
  if not found then
    raise exception 'Inventory item not found in active brand';
  end if;

  select l.ledger_qty
    into v_system_qty
  from public.inventory_ledger_balance l
  where l.brand_id = v_brand_id and l.inventory_item_id = p_inventory_item_id;

  v_system_qty := coalesce(v_system_qty, 0);

  insert into public.inventory_stock_opname(
    brand_id,
    inventory_item_id,
    opname_date,
    system_qty,
    physical_qty,
    variance,
    notes,
    created_by
  ) values (
    v_brand_id,
    p_inventory_item_id,
    p_opname_date,
    v_system_qty,
    p_physical_qty,
    p_physical_qty - v_system_qty,
    btrim(p_reason),
    auth.uid()
  )
  returning * into v_opname;

  perform private.write_audit_log(
    v_brand_id,
    null,
    'inventory_stock_opname',
    v_opname.id,
    'resolve_physical_stock_opname',
    auth.uid(),
    null,
    to_jsonb(v_opname),
    btrim(p_reason),
    jsonb_build_object(
      'source','ui_workflow',
      'inventory_item_id',p_inventory_item_id,
      'system_qty',v_system_qty,
      'physical_qty',p_physical_qty
    )
  );

  return jsonb_build_object(
    'opname_id', v_opname.id,
    'inventory_item_id', v_opname.inventory_item_id,
    'opname_date', v_opname.opname_date,
    'system_qty', v_opname.system_qty,
    'physical_qty', v_opname.physical_qty,
    'variance', v_opname.variance
  );
end;
$function$;

create or replace function public.resolve_physical_stock_opname(
  p_inventory_item_id uuid,
  p_physical_qty numeric,
  p_opname_date date default current_date,
  p_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.resolve_physical_stock_opname(
    p_inventory_item_id,
    p_physical_qty,
    p_opname_date,
    p_reason
  );
$function$;

revoke all on function public.resolve_physical_stock_opname(uuid,numeric,date,text) from public, anon;
grant execute on function public.resolve_physical_stock_opname(uuid,numeric,date,text) to authenticated, service_role;
revoke all on function private.resolve_physical_stock_opname(uuid,numeric,date,text) from public, anon, authenticated;
grant execute on function private.resolve_physical_stock_opname(uuid,numeric,date,text) to service_role;

create or replace view public.ui_action_capabilities_v4
with (security_invoker=true)
as
select action_type,resolution_mode,rpc_name,input_schema,notes
from public.ui_action_capabilities_v3
where action_type not in ('zero_amount_purchase','untracked_stock')
union all
select 'zero_amount_purchase'::text,
       'rpc'::text,
       'resolve_zero_amount_purchase_candidate'::text,
       '{"source_history_id":"uuid","resolution":"actual_amount|exclude","effective_amount":"number>0 required for actual_amount","reason":"text required"}'::jsonb,
       'Raw source remains unchanged. actual_amount supplies audited effective amount; exclude removes the source row from downstream mapping/posting.'::text
union all
select 'untracked_stock'::text,
       'rpc'::text,
       'resolve_physical_stock_opname'::text,
       '{"inventory_item_id":"uuid","physical_qty":"number>=0","opname_date":"date<=today","reason":"text required"}'::jsonb,
       'Physical count becomes the stock baseline on the opname date; system quantity is read from the current ledger and no stock value is guessed.'::text
union all
select 'financing_payment_review'::text,
       'rpc'::text,
       'resolve_financing_payment_candidate'::text,
       '{"reason":"text recommended","cash_date":"date required for cash_paid","resolution":"cash_paid|liability_only|exclude","cash_amount":"number>0 required for cash_paid","source_history_id":"uuid"}'::jsonb,
       'Cashflow hanya berubah jika resolution=cash_paid; liability_only tetap non-cash.'::text;
