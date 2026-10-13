-- Synthetic P0 orphan lineage & Owner-undo checks.
-- Every state change below is to the disposable CI database only.
do $tests$
declare
  v record;
  reversed boolean := false;
  one integer;
begin
  select * into v from private.inventory_receipt_lineage_triage_v1
   where receipt_id='00000000-0000-0000-0000-000000000302';
  if not found
   or v.lineage_triage<>'MAJOO_EVIDENCE_UNIQUE_REVIEW_ONLY'
   or v.matching_evidence_rows<>1
   or v.evidence_source_record_key<>'majoo:fixture:old-source'
   or v.receipt_qty<>v.evidence_qty
   or v.receipt_amount<>v.evidence_amount then
    raise exception 'Orphan purchase evidence audit is not unique and verifiable: %',to_jsonb(v);
  end if;

  -- Old canonical Purchase stays missing: this is a read-only EVIDENCE link,
  -- not a canonical finance transaction or a repaired purchase source UUID.
  select count(*) into one from public.offline_purchase_history
    where id='00000000-0000-0000-0000-000000000299';
  if one<>0 then
    raise exception 'Evidence audit unexpectedly inserted a canonical Purchase';
  end if;

  -- No generic direct DELETE even when a reviewed purchase is present.
  begin
    delete from public.inventory_purchase_log
     where id='00000000-0000-0000-0000-000000000304';
  exception when foreign_key_violation then reversed := true;
  end;
  if not reversed then raise exception 'Unreviewed direct Owner-source receipt delete was accepted'; end if;

  -- Direct users cannot mark private reviews reverted (real production update
  -- GRANT denies this). Model the exact privileged private Owner RPC step.
  update private.purchase_stock_reviews
   set reverted_at=now(),reverted_by=auth.uid(),
       revert_reason='Owner evidence verified and correction approved'
   where id='00000000-0000-0000-0000-000000000404';
  delete from public.inventory_purchase_log
   where id='00000000-0000-0000-0000-000000000304';

  select count(*) into one from public.inventory_purchase_log
   where id='00000000-0000-0000-0000-000000000304';
  if one<>0 then raise exception 'Reviewed undo marker did not permit receipt reversal'; end if;
  select count(*) into one from public.offline_purchase_history
   where id='00000000-0000-0000-0000-000000000207';
  if one<>1 then raise exception 'Owner undo unexpectedly deleted canonical source'; end if;

  if position('update private.purchase_stock_reviews' in lower(pg_get_functiondef(
     'private.owner_stock_review_undo_v1(uuid,text)'::regprocedure)))=0 then
    raise exception 'Owner rollback function lacks guarded review marker update';
  end if;
  raise notice 'HSN-P0 EVIDENCE PASS: exactly-one Majoo factuur candidate, canonical untouched; guarded Owner revert permitted only after review authorization.';
end;
$tests$;

-- Simulate two otherwise indistinguishable factuur rows.
-- The private audit view must DEMOTE any such match from unique to ambiguous.
insert into public.purchase_import_evidence(
  brand_id,source_type,source_period,source_file,source_record_key,row_no,
  purchase_date,item_name,quantity,unit_text,total_amount,source_status)
select brand_id,source_type,source_period,source_file,
       'majoo:fixture:duplicate',100,purchase_date,item_name,quantity,
       unit_text,total_amount,source_status
from public.purchase_import_evidence
where source_record_key='majoo:fixture:old-source';

do $duplicate$
declare v record;
begin
  select * into v from private.inventory_receipt_lineage_triage_v1
   where receipt_id='00000000-0000-0000-0000-000000000302';
  if v.lineage_triage<>'AMBIGUOUS_EVIDENCE_MANUAL_REVIEW'
     or v.evidence_id is not null or v.matching_evidence_rows<>2 then
    raise exception 'Duplicate invoice evidence incorrectly treated as a unique recoverable source: %',to_jsonb(v);
  end if;
  raise notice 'HSN-P0 AMBIGUITY PASS: duplicate factuur evidence is blocked from automatic lineage association.';
end;
$duplicate$;
