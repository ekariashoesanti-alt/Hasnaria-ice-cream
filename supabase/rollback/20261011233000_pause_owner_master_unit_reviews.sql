-- HSN P0.2 emergency STOP: disable new Owner master-SKU documentary
-- approvals/revocations but leave all audit rows and Owner queue readable.
-- Do not revert inventory history or modify Stock/BOM/Finance.
create or replace function private.owner_master_unit_apply_v1(
 p_item_id uuid,p_decision text,p_unit text,p_token text,
 p_evidence text,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $pause$
begin
 perform private.owner_stock_review_assert_v1();
 raise exception 'P0.2 PAUSED: perubahan review satuan master dihentikan sementara; antrean dan histori audit tetap ada';
end;
$pause$;
create or replace function private.owner_master_unit_revoke_v1(
 p_review_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $pause$
begin
 perform private.owner_stock_review_assert_v1();
 raise exception 'P0.2 PAUSED: pembatalan bukti master dihentikan sementara; histori tetap tersimpan';
end;
$pause$;
comment on function private.owner_master_unit_apply_v1(uuid,text,text,text,text,text) is
 'Emergency pause, not DDL rollback: master-unit documentary writes stopped without removing Owner approvals, Stock, BOM or Finance.';
