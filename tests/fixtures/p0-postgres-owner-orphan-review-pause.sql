-- Runs ONLY after supabase/rollback/20261011230000_pause_owner_orphan_receipt_reviews.sql
-- on disposable Postgres. Recreate authenticated Owner claim in this psql process.
select set_config('app.test_uid','00000000-0000-0000-0000-000000009999',false);
select set_config('app.test_role','owner',false);
create temporary table p0_orphan_review_pre_pause_count as
select count(*)::bigint as rows_before from private.orphan_receipt_owner_reviews_v1;
set role authenticated;
do $paused$
declare expected boolean; q jsonb;
begin
 expected:=false;
 begin
  perform public.owner_orphan_receipt_apply_v1(
    '00000000-0000-0000-0000-000000000302'::uuid,
    'REQUEST_ORIGINAL_SOURCE','stale',
    'Physical invoice unavailable until archived documents checked',
    'Owner wants original supplier documents before ledger review can continue');
 exception when others then expected:=position('P0.1 PAUSED' in sqlerrm)>0; end;
 if not expected then raise exception 'Emergency pause allowed new owner historical attestation'; end if;
 expected:=false;
 begin
  perform public.owner_orphan_receipt_revoke_v1(
    '00000000-0000-0000-0000-000000000405',
    'Owner tested pause and should never mutate audit history here');
 exception when others then expected:=position('P0.1 PAUSED' in sqlerrm)>0; end;
 if not expected then raise exception 'Emergency pause allowed audit revocation'; end if;
 q:=public.owner_orphan_receipt_queue_v1(null);
 if (q->>'total')::integer<>1 then
   raise exception 'Emergency pause disabled historical read-only queue';
 end if;
 raise notice 'HSN-P0 ORPHAN REVIEW PAUSE PASS: no writes, old reviews preserved, Owner read queue still available';
end;
$paused$;
reset role;
do $verify$
begin
 if (select count(*) from private.orphan_receipt_owner_reviews_v1) <>
    (select rows_before from pg_temp.p0_orphan_review_pre_pause_count) then
   raise exception 'Emergency pause changed documentary Owner rows';
 end if;
end;
$verify$;
