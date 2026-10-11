-- HSN-P0 Owner unit documentation: NO business movement/Finance writes.
-- All test calls operate on disposable GitHub Actions PostgreSQL 17 only.
do $test$
declare
  q jsonb;
  p jsonb;
  applied jsonb;
  revoked jsonb;
  review_id uuid;
  n int;
  rejected boolean;
  src constant uuid := '00000000-0000-0000-0000-000000000204';
begin
  q:=private.owner_purchase_unit_queue_v1((current_date-interval '1 month')::date);
  if (q->>'total')::int<>2 then
    raise exception 'Unit review pending queue should include exactly 2 unposted sources, got %',q;
  end if;
  if (select count(*) from public.inventory_purchase_log)<>5 then
    raise exception 'Pre-approval synthetic Stock receipts unexpected';
  end if;
  p:=private.owner_purchase_unit_preview_v1(src,'pack',20);
  if (p->>'stock_qty')::numeric<>80
     or p->>'stock_unit'<>'pcs'
     or p->>'source_unit'<>'pack'
     or (p->>'will_post_stock')::boolean<>false then
    raise exception 'Owner preview incorrect: %',p;
  end if;
  rejected:=false;
  begin
    perform private.owner_purchase_unit_preview_v1(src,'pcs',20);
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Same-unit with multiplier 20 should be rejected'; end if;
  rejected:=false;
  begin
    perform private.owner_purchase_unit_preview_v1(
      '00000000-0000-0000-0000-000000000206','pcs',1);
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Already-posted source preview must fail'; end if;
  rejected:=false;
  begin
    perform private.owner_purchase_unit_apply_v1(src,'pack',20,'wrong_token',
      'Invoice fixture no 204','Bukti fisik pack ada isinya 20 pcs');
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Stale token must prevent approval'; end if;

  applied:=private.owner_purchase_unit_apply_v1(
    src,'pack',20,p->>'token',
    'Invoice fixture no 204 from supplier',
    'Foto kemasan menunjukkan 20 pcs setiap pack, verifikasi Owner');
  if applied->>'status'<>'DOCUMENTED_NOT_POSTED' or
     (applied->>'stock_qty')::numeric<>80 then
    raise exception 'Expected documentary approval but not posting: %',applied;
  end if;
  review_id:=(applied->>'review_id')::uuid;
  q:=private.owner_purchase_unit_queue_v1((current_date-interval '1 month')::date);
  if (select count(*) from jsonb_array_elements(q->'items') x
      where x->>'source_id'=src::text and x->>'status'='DOCUMENTED_NOT_POSTED')<>1 then
    raise exception 'Owner queue must show reviewed without posting: %',q;
  end if;
  if (select count(*) from public.inventory_purchase_log)<>5 then
    raise exception 'Documentary approval altered inventory receipts';
  end if;
  rejected:=false;
  begin
    perform private.owner_purchase_unit_apply_v1(
      src,'pack',20,p->>'token',
      'Invoice fixture no 204 from supplier',
      'Foto kemasan menunjukkan 20 pcs setiap pack, verifikasi Owner');
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Duplicate unit approval must fail'; end if;
  rejected:=false;
  begin
    perform private.owner_purchase_unit_revoke_v1(review_id,'short');
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Short revoke reason should fail'; end if;

  revoked:=private.owner_purchase_unit_revoke_v1(
    review_id,'Owner found different pack specification in invoice');
  if (revoked->>'stock_changed')::boolean<>false then
    raise exception 'Unit evidence revoke may not write Stock';
  end if;
  q:=private.owner_purchase_unit_queue_v1((current_date-interval '1 month')::date);
  if (select count(*) from jsonb_array_elements(q->'items') x
      where x->>'source_id'=src::text and x->>'status'='NEEDS_UNIT_VERIFICATION')<>1 then
    raise exception 'Revocation did not restore needs-review state';
  end if;
  if has_table_privilege('authenticated','private.purchase_unit_attestations_v1','SELECT')
   or has_table_privilege('authenticated','private.purchase_unit_attestations_v1','INSERT')
   or has_table_privilege('authenticated','private.purchase_unit_attestations_v1','UPDATE') then
    raise exception 'Private Owner evidence table exposed to authenticated clients';
  end if;
  if not has_function_privilege(
    'authenticated','public.owner_purchase_unit_queue_v1(date)','EXECUTE') then
    raise exception 'Owner-only queue wrapper not callable by authenticated role';
  end if;

  raise notice 'HSN-P0 OWNER UNIT PASS: queue=2, preview=80 pcs, wrong-token/duplicate rejected, audited approve/revoke with no receipt writes.';
end;
$test$;
