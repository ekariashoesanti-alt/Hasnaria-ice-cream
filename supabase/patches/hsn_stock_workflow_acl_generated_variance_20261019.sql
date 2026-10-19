-- HSN P0 operational stock-opname RPC correction: review-only patch, not auto-deployed.
-- Validated on dedicated Singapore staging 2026-10-19 with authenticated
-- owner/pelaksana/head_store role simulation and transactional rollback tests.
-- DO NOT execute on Tokyo production before independent backup recovery proof,
-- protected UAT approval, final PR review and explicit production release.
-- Root causes:
-- 1) Public SECURITY INVOKER wrappers cannot invoke their private implementations.
-- 2) inventory_stock_opname.variance is GENERATED ALWAYS (physical_qty-system_qty),
--    and private.resolve_physical_stock_opname attempted an explicit INSERT value.
-- This patch does not insert/update/delete business records.
BEGIN;
SET LOCAL statement_timeout='25s';
SET LOCAL lock_timeout='2s';
DO $preflight$
BEGIN
 IF (SELECT is_generated FROM information_schema.columns WHERE table_schema='public'
  AND table_name='inventory_stock_opname' AND column_name='variance')<>'ALWAYS'
 THEN RAISE EXCEPTION 'BLOCK: expected generated variance column'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='private' AND p.proname='resolve_physical_stock_opname' AND p.prosecdef)
 THEN RAISE EXCEPTION 'BLOCK: expected private definer function'; END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION private.resolve_physical_stock_opname(p_inventory_item_id uuid, p_physical_qty numeric, p_opname_date date DEFAULT CURRENT_DATE, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    notes,
    created_by
  ) values (
    v_brand_id,
    p_inventory_item_id,
    p_opname_date,
    v_system_qty,
    p_physical_qty,
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

REVOKE EXECUTE ON FUNCTION private.create_stock_opname_run(uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_stock_opname_run(uuid,date,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.set_operational_run_item(uuid,boolean,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_operational_run_item(uuid,boolean,numeric,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.submit_operational_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.submit_operational_run(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.approve_stock_opname_run(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.approve_stock_opname_run(uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.reject_operational_run(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.reject_operational_run(uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.resolve_physical_stock_opname(uuid,numeric,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.resolve_physical_stock_opname(uuid,numeric,date,text) TO authenticated;
DO $verify$
BEGIN
IF NOT has_function_privilege('authenticated','private.create_stock_opname_run(uuid,date,text)','EXECUTE') OR has_function_privilege('anon','private.create_stock_opname_run(uuid,date,text)','EXECUTE') THEN RAISE EXCEPTION 'Operational RPC ACL failed: create_stock_opname_run(uuid,date,text)'; END IF;
IF NOT has_function_privilege('authenticated','private.set_operational_run_item(uuid,boolean,numeric,text,text)','EXECUTE') OR has_function_privilege('anon','private.set_operational_run_item(uuid,boolean,numeric,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Operational RPC ACL failed: set_operational_run_item(uuid,boolean,numeric,text,text)'; END IF;
IF NOT has_function_privilege('authenticated','private.submit_operational_run(uuid)','EXECUTE') OR has_function_privilege('anon','private.submit_operational_run(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Operational RPC ACL failed: submit_operational_run(uuid)'; END IF;
IF NOT has_function_privilege('authenticated','private.approve_stock_opname_run(uuid,text)','EXECUTE') OR has_function_privilege('anon','private.approve_stock_opname_run(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Operational RPC ACL failed: approve_stock_opname_run(uuid,text)'; END IF;
IF NOT has_function_privilege('authenticated','private.reject_operational_run(uuid,text)','EXECUTE') OR has_function_privilege('anon','private.reject_operational_run(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Operational RPC ACL failed: reject_operational_run(uuid,text)'; END IF;
IF NOT has_function_privilege('authenticated','private.resolve_physical_stock_opname(uuid,numeric,date,text)','EXECUTE') OR has_function_privilege('anon','private.resolve_physical_stock_opname(uuid,numeric,date,text)','EXECUTE') THEN RAISE EXCEPTION 'Operational RPC ACL failed: resolve_physical_stock_opname(uuid,numeric,date,text)'; END IF;
IF POSITION(E'    variance,\n    notes,' IN pg_get_functiondef('private.resolve_physical_stock_opname(uuid,numeric,date,text)'::regprocedure))>0
THEN RAISE EXCEPTION 'BLOCK: generated-column insert still present'; END IF;
END $verify$;
COMMIT;
