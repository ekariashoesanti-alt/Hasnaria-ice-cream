-- HSN P0.2 emergency rollback: pause Owner packaging conversion approvals.
-- Does NOT resurrect the old unsafe function that silently activated recipes.
-- Does NOT change conversion rows, owner audits, Stock, Finance, BOM or
-- historical receipts. Keep guard_verified_inventory_conversion_v1 trigger.
create or replace function private.resolve_inventory_conversion_ui(
 p_conversion_id uuid,p_units_per_purchase_unit numeric,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=''
as $pause$
begin
 perform private.owner_stock_review_assert_v1();
 raise exception 'Verifikasi konversi satuan dihentikan sementara; tidak ada perubahan resep atau stok';
end;
$pause$;
comment on function private.resolve_inventory_conversion_ui(uuid,numeric,text) is
 'Emergency P0.2 pause: do not call old BOM-mutating conversion handler, do not erase past Owner evidence. To resume reapply 20261011223000 migration after UAT.';
