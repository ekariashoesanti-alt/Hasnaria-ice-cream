-- HSN-P0 Stage 3: SAFE manual emergency rollback / fail-closed mode.
-- This is not an auto-applied migration. Run only after reviewed approval.
-- Disables new canonical Purchase -> Stock posting rather than restoring the
-- original unsafe unit-blind sync implementation. Keeps all existing receipts,
-- movements, ownership checks, and unit/source guards in place.
-- Original function definition must not be re-enabled until source units are approved.

create or replace function private.sync_purchase_quantity_stock_v1(
  p_brand uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
begin
  if p_brand is null or p_from is null or p_to is null or p_from>p_to then
    raise exception 'Invalid Purchase stock sync range';
  end if;
  if not private.same_brand(p_brand)
     or not (private.has_capability('settings.manage')
             or private.can_import_module('purchasing')
             or private.can_stock_write()) then
    raise exception 'Purchase stock sync permission required';
  end if;
  return jsonb_build_object(
    'synced_stock_rows',0,
    'eligible_stock_rows',0,
    'blocked_for_unit_review',null,
    'from',p_from,'to',p_to,
    'basis','emergency_stock_sync_paused'
  );
end;
$function$;

comment on function private.sync_purchase_quantity_stock_v1(uuid,date,date) is
  'HSN-P0 emergency rollback: posting safely paused; linked Purchase sources and existing Stock rows preserved.';
