-- Disposable PostgreSQL fixture: rollback and RLS-view checks.
-- Must execute only after behavioral assertions, prior view restore, and reapply.
do $rollback$
declare balance numeric;
begin
  select system_qty into balance
  from public.inventory_stock_reconciliation
  where inventory_item_id='00000000-0000-0000-0000-000000000102';
  if balance<>11 then
    raise exception 'Reapplied movement-based Stock view did not restore Qty=11: %',balance;
  end if;

  if pg_get_viewdef('public.inventory_stock_reconciliation'::regclass,true)
     not like '%JOIN inventory_movements%' then
    raise exception 'Stock view did not return to posted ledger formula';
  end if;

  if pg_get_viewdef('public.inventory_stock_reconciliation'::regclass,true)
     like '%JOIN inventory_recipe_components%' then
    raise exception 'Draft recipe usage is unexpectedly counted after reapply';
  end if;
end;
$rollback$;

-- Confirm authenticated Stock view can be queried with ownership privileges
-- through SECURITY INVOKER, and cross-brand data is hidden by RLS policies.
insert into public.inventory_items
 (id,brand_id,item_name,category,unit,opening_qty)
values('00000000-0000-0000-0000-000000000104',
       '00000000-0000-0000-0000-000000000002',
       'FOREIGN BRAND TEST','Bahan','pcs',8);
grant select on public.inventory_items,public.inventory_stock_opname,
  public.inventory_purchase_log,public.inventory_movements to authenticated;

alter table public.inventory_items enable row level security;
alter table public.inventory_stock_opname enable row level security;
alter table public.inventory_purchase_log enable row level security;
alter table public.inventory_movements enable row level security;

create policy fixture_inventory_read on public.inventory_items
  for select to authenticated
  using (brand_id='00000000-0000-0000-0000-000000000001');
create policy fixture_opname_read on public.inventory_stock_opname
  for select to authenticated
  using (brand_id='00000000-0000-0000-0000-000000000001');
create policy fixture_receipt_read on public.inventory_purchase_log
  for select to authenticated
  using (brand_id='00000000-0000-0000-0000-000000000001');
create policy fixture_movement_read on public.inventory_movements
  for select to authenticated
  using (brand_id='00000000-0000-0000-0000-000000000001');

set role authenticated;
do $access$
declare v_all integer; v_other integer;
begin
  select count(*) into v_all from public.inventory_stock_reconciliation;
  select count(*) into v_other from public.inventory_stock_reconciliation
    where item_name='FOREIGN BRAND TEST';
  if v_all<>3 or v_other<>0 then
    raise exception 'SECURITY INVOKER RLS read failed, all=%, foreign=%',v_all,v_other;
  end if;
end;
$access$;
reset role;

-- The safer emergency rollback pauses new automatic receipt posting entirely
-- instead of restoring the legacy unit-blind posting logic.
do $paused$
declare v jsonb;
begin
  v:=private.sync_purchase_quantity_stock_v1(
    '00000000-0000-0000-0000-000000000001',current_date-20,current_date);
  if (v->>'synced_stock_rows')::integer<>0 or
     v->>'basis'<>'emergency_stock_sync_paused' then
    raise exception 'Emergency rollback must pause posting: %',v;
  end if;
  if (select count(*) from public.inventory_purchase_log
      where source_history_id='00000000-0000-0000-0000-000000000206')<>1 then
    raise exception 'Emergency rollback altered historical Stock data';
  end if;
  raise notice 'HSN-P0 ROLLBACK PASS: view restored and re-applied, RLS restricted cross-brand, emergency sync paused with ledger untouched.';
end;
$paused$;
