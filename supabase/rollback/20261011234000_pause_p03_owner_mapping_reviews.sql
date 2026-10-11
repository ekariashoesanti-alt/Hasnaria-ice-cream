-- P0.3 emergency pause: block new Owner mapping decisions/revocations.
-- Preserve private documentary evidence, read-only queue, Stock and Finance.
create or replace function private.owner_purchase_unmapped_apply_v1(
 p_source uuid,p_decision text,p_target uuid,p_expense text,p_token text,
 p_evidence text,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $pause$
begin
 perform private.owner_stock_review_assert_v1();
 raise exception 'P0.3 PAUSED: Owner mapping decisions temporarily disabled; previous audit evidence is preserved';
end;$pause$;
create or replace function private.owner_purchase_unmapped_revoke_v1(
 p_review uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $pause$
begin
 perform private.owner_stock_review_assert_v1();
 raise exception 'P0.3 PAUSED: historical mapping review revisions temporarily disabled';
end;$pause$;
comment on function private.owner_purchase_unmapped_apply_v1(uuid,text,uuid,text,text,text,text) is
 'Emergency pause stops new documentary Owner mapping reviews; does not reset stock, Purchase, Finance, rules or previously recorded decisions.';
