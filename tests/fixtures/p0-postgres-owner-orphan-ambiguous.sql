-- Run after existing p0-postgres-owner-evidence.sql introduced a
-- second matching old Majoo invoice: this must DEMOTE the previous unique
-- match and prevent Owner from falsely certifying either invoice ID.
do $dup$
declare p jsonb; denied boolean:=false; id uuid;
begin
 id:='00000000-0000-0000-0000-000000000302'::uuid;
 begin
   perform public.owner_orphan_receipt_preview_v1(id,'CONFIRM_EXTERNAL_EVIDENCE');
 exception when others then denied:=true; end;
 if not denied then raise exception 'Ambiguous invoice falsely confirmed'; end if;
 p:=public.owner_orphan_receipt_preview_v1(id,'REQUEST_ORIGINAL_SOURCE');
 if p->>'evidence_triage'<>'AMBIGUOUS_EVIDENCE_MANUAL_REVIEW'
    or p->>'evidence_id' is not null then
   raise exception 'Ambiguous historical invoice was not demoted: %',p;
 end if;
 if (public.owner_orphan_receipt_queue_v1(null)->'items'->0->>'status')
   <>'NEEDS_ORIGINAL_SOURCE' then
   raise exception 'Owner queue must require original source when invoice ambiguous';
 end if;
 if (select count(*) from public.inventory_purchase_log
  where source_history_id='00000000-0000-0000-0000-000000000299')<>1 then
    raise exception 'Ambiguity review unexpectedly rebound historic Purchase UUID';
 end if;
 raise notice 'HSN P0.1 AMBIGUOUS INVOICE PASS: no unsupported source reconstruction, Owner original evidence required.';
end;
$dup$;
