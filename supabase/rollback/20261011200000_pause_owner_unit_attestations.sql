-- Manual emergency fallback for HSN-P0 Owner-unit evidence capture.
-- Never drop the private table or erase approved/previously revoked records.
-- This pauses new Owner approvals/revocations. It does NOT touch Stock,
-- canonical Purchases or Finance journals. Reapply the Stage 4 migration
-- after correcting a problem to restore the original workflow.
create or replace function private.owner_purchase_unit_apply_v1(
 p_source_id uuid,p_source_unit text,p_multiplier numeric,
 p_token text,p_evidence text,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $safe$
begin
 perform private.owner_stock_review_assert_v1();
 raise exception 'Verifikasi satuan baru sementara dihentikan untuk pemeriksaan keamanan';
end;
$safe$;

create or replace function private.owner_purchase_unit_revoke_v1(
 p_review_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $safe$
begin
 perform private.owner_stock_review_assert_v1();
 raise exception 'Perubahan bukti verifikasi sementara dihentikan untuk pemeriksaan keamanan';
end;
$safe$;

comment on function private.owner_purchase_unit_apply_v1(uuid,text,numeric,text,text,text) is
 'Emergency pause: preserves Owner approval evidence and disables new approvals until Stage 4 is safely reapplied.';
comment on function private.owner_purchase_unit_revoke_v1(uuid,text) is
 'Emergency pause: prevents evidence revocation; retains all existing audit history.';
