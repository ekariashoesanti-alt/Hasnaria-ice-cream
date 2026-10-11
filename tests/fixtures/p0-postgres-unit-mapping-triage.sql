-- P0 priority #2: isolated owner-unit preview + SKU/conversion triage.
-- Transaction blocks are disposable rollback-only; production data untouched.
do $base$
declare v record; denied boolean:=false;
begin
 select * into v from private.inventory_unit_conversion_triage_v1
 where inventory_item_id='00000000-0000-0000-0000-000000000101'
   and normalized_purchase_unit='pack' and normalized_sale_unit='pcs';
 if not found or v.verification_gate<>'VERIFIED_MASTER_ALIGNED'
    or v.verified_count<>1 or v.rule_count<>1 or v.smallest_factor<>20 then
  raise exception 'Verified 20 pcs/pack baseline must be unambiguous: %',to_jsonb(v);
 end if;
 select * into v from private.purchase_unit_mapping_gate_v1
 where purchase_source_id='00000000-0000-0000-0000-000000000204';
 if not found or v.unit_mapping_gate<>'REVIEW_MISSING_PURCHASE_UNIT'
    or v.already_posted then
  raise exception 'Missing canonical unit must remain a review candidate: %',to_jsonb(v);
 end if;
 begin
  perform private.owner_purchase_unit_preview_v1(
    '00000000-0000-0000-0000-000000000204','pack',21);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Owner could approve factor 21 against verified factor 20'; end if;
 if has_table_privilege('authenticated','private.inventory_unit_conversion_triage_v1','SELECT')
 or has_table_privilege('anon','private.purchase_unit_mapping_gate_v1','SELECT') then
  raise exception 'Private unit review exposed to public callers';
 end if;
 raise notice 'HSN-P0 UNITS BASELINE PASS: verified pack factor, missing source and conflicting owner factor tested.';
end;
$base$;

-- Contradiction between master Stock unit and the sale-unit of a purchase
-- conversion is release-blocking (e.g. BAKSO AYAM: master pack, sale_unit pcs).
begin;
update public.inventory_items set unit='pack'
 where id='00000000-0000-0000-0000-000000000101';
do $conflict$
declare v record; denied boolean:=false;
begin
 select * into v from private.inventory_unit_conversion_triage_v1
 where inventory_item_id='00000000-0000-0000-0000-000000000101';
 if v.verification_gate<>'BLOCK_MASTER_SALE_UNIT_CONFLICT' then
  raise exception 'Master pack / conversion pcs must block: %',to_jsonb(v);
 end if;
 select * into v from private.purchase_unit_mapping_gate_v1
 where purchase_source_id='00000000-0000-0000-0000-000000000204';
 if v.unit_mapping_gate<>'BLOCK_MASTER_UNIT_CONFLICT' then
  raise exception 'Purchase mapping gate missed master mismatch: %',to_jsonb(v);
 end if;
 begin
  perform private.owner_purchase_unit_preview_v1(
    '00000000-0000-0000-0000-000000000204','pack',20);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Owner may not approve mismatched master unit'; end if;
end;
$conflict$;
rollback;

-- Two independently VERIFIED identical rules must still BLOCK ambiguity.
begin;
insert into public.inventory_unit_conversions
(brand_id,inventory_item_id,status,purchase_unit,sale_unit,units_per_purchase_unit)
values('00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000101',
       'verified','pack','pcs',20);
do $duplicate_verified$
declare v record; denied boolean:=false;
begin
 select * into v from private.inventory_unit_conversion_triage_v1
 where inventory_item_id='00000000-0000-0000-0000-000000000101';
 if v.verification_gate<>'BLOCK_DUPLICATE_OR_CONTRADICTING_FACTORS'
    or v.verified_count<>2 or v.rule_count<>2 then
  raise exception 'Two verified duplicate factors must block: %',to_jsonb(v);
 end if;
 begin
  perform private.owner_purchase_unit_preview_v1(
    '00000000-0000-0000-0000-000000000204','pack',20);
 exception when others then denied:=true; end;
 if not denied then raise exception 'Owner preview accepts duplicate verified rules'; end if;
end;
$duplicate_verified$;
rollback;

-- Duplicate DRAFT rules are visible for review, but must NEVER become
-- one verified automatic conversion just because their factor is identical.
begin;
insert into public.inventory_unit_conversions
(brand_id,inventory_item_id,status,purchase_unit,sale_unit,units_per_purchase_unit)
values('00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000102',
       'needs_verification','pack','pcs',40),
      ('00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000102',
       'needs_verification','pack','pcs',40);
do $duplicate_draft$
declare v record;
begin
 select * into v from private.inventory_unit_conversion_triage_v1
 where inventory_item_id='00000000-0000-0000-0000-000000000102'
   and normalized_purchase_unit='pack';
 if v.verification_gate<>'REVIEW_DUPLICATE_UNVERIFIED_RULES'
    or v.rule_count<>2 or v.verified_count<>0 then
   raise exception 'Duplicate draft factors wrongly treated as verified: %',to_jsonb(v);
 end if;
end;
$duplicate_draft$;
rollback;

-- Master placeholder must never be interpreted as a unit.
begin;
update public.inventory_items set unit='purchase_unit'
 where id='00000000-0000-0000-0000-000000000101';
do $placeholder$
declare v record; q jsonb;
begin
 select * into v from private.purchase_unit_mapping_gate_v1
 where purchase_source_id='00000000-0000-0000-0000-000000000204';
 if v.unit_mapping_gate<>'BLOCK_MASTER_UNIT_PLACEHOLDER' then
  raise exception 'Placeholder stock master not blocked: %',to_jsonb(v);
 end if;
 q:=private.owner_purchase_unit_queue_v1(
    date_trunc('month',current_date-interval '1 month')::date);
 if (select count(*) from jsonb_array_elements(q->'items') item
      where item->>'source_id'='00000000-0000-0000-0000-000000000204'
        and item->>'status'='MASTER_UNIT_NEEDS_CORRECTION')<>1 then
   raise exception 'Owner queue must explicitly block placeholder master unit: %',q;
 end if;
end;
$placeholder$;
rollback;

do $done$
begin
 if (select count(*) from public.inventory_unit_conversions)<>1 then
   raise exception 'Rollback of unit triage test cases leaked draft conversion rules';
 end if;
 if (select unit from public.inventory_items
     where id='00000000-0000-0000-0000-000000000101')<>'pcs' then
   raise exception 'Rollback leaked updated SKU unit';
 end if;
 raise notice 'HSN-P0 UNITS REGRESSION PASS: verified factor, master mismatch, duplicate, draft and placeholder fail closed.';
end;
$done$;
