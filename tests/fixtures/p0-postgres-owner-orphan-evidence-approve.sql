-- P0.1 genuine SQL integration test: disposable PostgreSQL 17 only.
-- Exercises source snapshot freshness, Owner documentary approval, revoke,
-- audit immutability and zero Stock/Finance source mutation.
do $main$
declare q jsonb; p jsonb; approved jsonb; src uuid; review_id uuid;
 receipt_before integer; movement_before integer; invoice_before integer;
 mismatch boolean;
begin
 src:='00000000-0000-0000-0000-000000000302'::uuid;
 select count(*) into receipt_before from public.inventory_purchase_log;
 select count(*) into movement_before from public.inventory_movements;
 select count(*) into invoice_before from public.purchase_import_evidence;
 q:=public.owner_orphan_receipt_queue_v1(null);
 if (q->>'total')::integer<>1
    or q->'items'->0->>'status'<>'UNIQUE_EXTERNAL_EVIDENCE_TO_VERIFY'
    or q->'items'->0->>'evidence_status'<>'MAJOO_EVIDENCE_UNIQUE_REVIEW_ONLY' then
   raise exception 'Owner legacy queue must show one Majoo receipt awaiting proof: %',q;
 end if;
 p:=public.owner_orphan_receipt_preview_v1(src,'CONFIRM_EXTERNAL_EVIDENCE');
 if p->>'evidence_triage'<>'MAJOO_EVIDENCE_UNIQUE_REVIEW_ONLY'
    or nullif(p->>'evidence_id','') is null
    or (p->>'will_rebind_source')::boolean is distinct from false
    or (p->>'will_change_stock')::boolean is distinct from false then
    raise exception 'Unique invoice preview must only document external evidence: %',p;
 end if;
 mismatch:=false;
 begin
  perform public.owner_orphan_receipt_apply_v1(src,'CONFIRM_EXTERNAL_EVIDENCE',
   'invalid-preview-token','Invoice Majoo fixture original receipt',
   'Owner checked supplier invoice and confirmed SKU, quantity, date, value');
 exception when others then mismatch:=true; end;
 if not mismatch then raise exception 'Wrong token allowed evidence attestation'; end if;
 mismatch:=false;
 begin
   perform public.owner_orphan_receipt_apply_v1(src,'CONFIRM_EXTERNAL_EVIDENCE',
     p->>'token','tiny',
     'Owner checked supplier invoice and confirmed SKU, quantity, date, value');
 exception when others then mismatch:=true; end;
 if not mismatch then raise exception 'Evidence reference shorter than 12 allowed'; end if;
 mismatch:=false;
 begin
   perform public.owner_orphan_receipt_preview_v1(src,'REQUEST_ORIGINAL_SOURCE');
 exception when others then mismatch:=true; end;
 if not mismatch then raise exception 'Requested missing source despite valid unique invoice'; end if;
 approved:=public.owner_orphan_receipt_apply_v1(src,'CONFIRM_EXTERNAL_EVIDENCE',
   p->>'token','Invoice Majoo fixture proof number 99',
   'Owner verified unique invoice fields with original receipt; historical only');
 review_id:=(approved->>'review_id')::uuid;
 if approved->>'status'<>'DOCUMENTED_NOT_REBOUND' or review_id is null then
   raise exception 'Documentary approval status incorrect: %',approved; end if;
 if (select count(*) from private.orphan_receipt_owner_reviews_v1
     where id=review_id and evidence_id is not null
       and reviewed_by=auth.uid() and revoked_at is null)<>1 then
    raise exception 'Owner audit evidence row missing'; end if;
 q:=public.owner_orphan_receipt_queue_v1(null);
 if q->'items'->0->>'status'<>'DOCUMENTED_NOT_REBOUND' then
   raise exception 'Owner audit queue did not preserve documented decision: %',q; end if;
 mismatch:=false;
 begin
   perform public.owner_orphan_receipt_preview_v1(src,'CONFIRM_EXTERNAL_EVIDENCE');
 exception when others then mismatch:=true; end;
 if not mismatch then raise exception 'Duplicate approval was not blocked'; end if;
 if (select count(*) from public.inventory_purchase_log)<>receipt_before
  or (select count(*) from public.inventory_movements)<>movement_before
  or (select count(*) from public.purchase_import_evidence)<>invoice_before
  or (select count(*) from public.offline_purchase_history
      where id='00000000-0000-0000-0000-000000000299')<>0 then
    raise exception 'Historical evidence attestation rewrote operational records'; end if;
 if has_table_privilege('authenticated',
   'private.orphan_receipt_owner_reviews_v1','SELECT')
  or has_table_privilege('authenticated',
   'private.orphan_receipt_owner_reviews_v1','INSERT') then
    raise exception 'Private historical review exposed directly to signed-in clients'; end if;
 perform public.owner_orphan_receipt_revoke_v1(review_id,
   'Original invoice details require reassessment with Owner audit notes');
 if (select count(*) from private.orphan_receipt_owner_reviews_v1
     where id=review_id and revoked_at is not null
       and revoked_by=auth.uid())<>1 then
   raise exception 'Owner review revoke did not preserve audit history'; end if;
 if (public.owner_orphan_receipt_queue_v1(null)->'items'->0->>'status')
    <>'UNIQUE_EXTERNAL_EVIDENCE_TO_VERIFY' then
   raise exception 'Revocation did not reopen evidence review queue'; end if;
 raise notice 'HSN-P0 HISTORICAL OWNER REVIEW PASS: unique evidence, idempotency, revoke and no Stock/Finance/source change.';
end;
$main$;
