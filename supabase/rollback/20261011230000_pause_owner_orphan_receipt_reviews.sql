-- Emergency P0.1: stop NEW historical Owner documentary attestations.
-- Keeps queue and previous evidence/audit rows intact. Never changes
-- Purchase source UUIDs, receipt movements, Stock or Finance.
-- Safe rollout order: apply after 20261011230000 when abnormal RPC use,
-- role discrepancies or missing backup are detected.
create or replace function private.owner_orphan_receipt_apply_v1(
 p_receipt_id uuid,p_decision text,p_token text,
 p_evidence_reference text,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $paused$
begin
 perform private.owner_stock_review_assert_v1();
 raise exception 'P0.1 PAUSED: persetujuan histori Owner ditangguhkan; review baca dan bukti lama tetap tersimpan';
end;
$paused$;
create or replace function private.owner_orphan_receipt_revoke_v1(
 p_review_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $paused$
begin
 perform private.owner_stock_review_assert_v1();
 raise exception 'P0.1 PAUSED: perubahan keputusan historis ditangguhkan; audit lama tetap tersimpan';
end;
$paused$;
comment on function private.owner_orphan_receipt_apply_v1(uuid,text,text,text,text) is
 'Emergency pause: documentary historical receipt review writes disabled, existing audits preserved, SELECT queue still available.';
