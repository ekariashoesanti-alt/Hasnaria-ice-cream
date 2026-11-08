-- Execute against Singapore UAT only, AFTER the two stage migrations and source imports.
-- Hard read-only assertions; DO block raises if any source-integrity gate fails.
do $uat$
declare
  k constant text := 'majoo_20261108_0820';
  h constant text := 'ea801b3a0d2eb33ea135aba187daf04371acb3a49990eccb104b2ea46947f648';
  n int;
  q numeric;
begin
  if (select count(*) from hasnaria_uat.product_master where batch_key=k) <> 72
     or (select count(*) from hasnaria_uat.ingredient_master where batch_key=k) <> 61
     or (select count(*) from hasnaria_uat.recipe_composition where batch_key=k) <> 153 then
     raise exception '4-source UAT: SKU master / recipe completeness failed';
  end if;

  if not exists (select 1 from hasnaria_uat.product_master where batch_key=k and source_sku='FO20')
     or not exists (select 1 from hasnaria_uat.ingredient_master where batch_key=k and source_sku='#FO20') then
     raise exception '4-source UAT: product SKU vs ingredient SKU namespace collision';
  end if;

  if (select count(*) from public.sales_product_report_batches where file_sha256=h and status='under_review') <> 1
     or (select count(*) from public.sales_product_report_lines l join public.sales_product_report_batches b on b.id=l.batch_id where b.file_sha256=h) <> 54
     or (select sum(l.quantity) from public.sales_product_report_lines l join public.sales_product_report_batches b on b.id=l.batch_id where b.file_sha256=h) <> 2604 then
     raise exception '4-source UAT: monthly Majoo product report mismatch';
  end if;

  if (select count(*) from public.sales_product_report_lines l
      join public.sales_product_report_batches b on b.id=l.batch_id
      left join hasnaria_uat.product_master p on p.batch_key=k and p.source_sku=l.source_sku
      where b.file_sha256=h and p.source_sku is null) <> 0 then
     raise exception '4-source UAT: monthly sale SKU lacks product master reference';
  end if;

  if (select coalesce(sum(l.quantity),0)
      from public.sales_product_report_lines l join public.sales_product_report_batches b on b.id=l.batch_id
      where b.file_sha256=h and exists(select 1 from hasnaria_uat.recipe_composition c where c.batch_key=k and c.product_sku=l.source_sku)) <> 2300 then
     raise exception '4-source UAT: BOM-covered sale quantity drifted';
  end if;

  if (select sum(receipt_count) from hasnaria_uat.transaction_daily_reference where batch_key=k) <> 824
     or (select sum(gross_sales) from hasnaria_uat.transaction_daily_reference where batch_key=k) <> 21614500
     or (select sum(product_name_appearances) from hasnaria_uat.transaction_daily_reference where batch_key=k) <> 1823
     or (select sum(receipt_count) from hasnaria_uat.transaction_payment_reference where batch_key=k) <> 824
     or (select sum(gross_sales) from hasnaria_uat.transaction_payment_reference where batch_key=k) <> 21614500 then
     raise exception '4-source UAT: transaction and payment source controls differ';
  end if;

  if (select sum(source_sales_amount) from public.sales_product_report_lines l
      join public.sales_product_report_batches b on b.id=l.batch_id
      where b.file_sha256=h) <> 20992500 then
     raise exception '4-source UAT: product revenue drift';
  end if;

  -- Compare all 54 real workbook source rows to pre-staged immutable values.
  -- MD5 is a local reconciliation fingerprint (NOT a security checksum).
  -- Source original file SHA-256 remains available on the batch.
  if (select md5(string_agg(
       l.source_sku||'|'||l.quantity::text||'|'||
       l.source_sales_amount::numeric(18,2)::text||'|'||
       l.source_hpp_amount::numeric(18,2)::text||'|'||
       l.source_gross_profit::numeric(18,2)::text||'|'||
       l.refund_quantity::text||'|'||
       l.refund_amount::numeric(18,2)::text||'|'||
       l.refund_hpp_amount::numeric(18,2)::text,
       E'\n' order by l.source_sku))
      from public.sales_product_report_lines l
      join public.sales_product_report_batches b on b.id=l.batch_id
      where b.file_sha256=h) is distinct from 'a5368cfb4d09adfce797dcccab62a480' then
     raise exception '4-source UAT: original workbook line-by-line fingerprint drift';
  end if;


  if (select count(*) from hasnaria_uat.legacy_recipe_candidates where batch_key=k)<>7
     or exists (select 1 from hasnaria_uat.legacy_recipe_candidates where approved_for_stock) then
    raise exception '4-source UAT: legacy BOM candidate total or stock permissions unsafe';
  end if;
  if (select count(*) from hasnaria_uat.sold_product_bom_coverage_v2
      where source_coverage_status='LEGACY_BOM_REVIEW_ONLY')<>7
     or (select sum(quantity) from hasnaria_uat.sold_product_bom_coverage_v2
      where source_coverage_status='LEGACY_BOM_REVIEW_ONLY')<>304
     or (select count(*) from hasnaria_uat.sold_product_bom_coverage_v2
      where source_coverage_status='EXPORTED_BOM_UNAPPROVED')<>47
     or exists(select 1 from hasnaria_uat.sold_product_bom_coverage_v2
      where source_coverage_status='UNRESOLVED' or recipe_approved or stock_posting_allowed) then
    raise exception '4-source UAT: reference overlay coverage/approval invariant violated';
  end if;
  if exists (select 1 from hasnaria_uat.raw_bom_demand_preview_v1
      where not simulation_only or conversion_verified or stock_posting_allowed) then
     raise exception '4-source UAT: unapproved BOM demand can affect stock';
  end if;

  if (select count(*) from public.sales) <> 0
     or (select count(*) from public.sale_items) <> 0
     or (select count(*) from public.inventory_movements) <> 0 then
     raise exception '4-source UAT: an operational ledger/table was modified';
  end if;

  if has_schema_privilege('anon','hasnaria_uat','USAGE')
     or has_schema_privilege('authenticated','hasnaria_uat','USAGE') then
     raise exception '4-source UAT: browser role could read private source schema';
  end if;

  raise notice '4-source Singapore UAT integrity gates: PASS';
end;
$uat$;
