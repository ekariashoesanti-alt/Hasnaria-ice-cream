-- P0.3/P0.4 disposable PostgreSQL end-to-end evidence review.
-- Does NOT write Hasnaria production. All source/batch inserts rolled back.
begin;
insert into public.offline_purchase_history(
 id,brand_id,source_period,source_file,row_no,purchase_date,
 item_name,quantity_text,unit_text,unit_price,total_amount,inventory_item_id)
values
('00000000-0000-0000-0000-000000000281',
 '00000000-0000-0000-0000-000000000001',
 date_trunc('month',current_date-interval '1 month')::date,
 'p03-fixture.xlsx',44,(current_date-interval '1 month')::date,
 'MISSING ITEM','1',null,40,40,null),
('00000000-0000-0000-0000-000000000282',
 '00000000-0000-0000-0000-000000000001',
 date_trunc('month',current_date-interval '1 month')::date,
 'p03-fixture.xlsx',45,(current_date-interval '1 month')::date,
 'AMBIGUOUS TEST','1',null,50,50,null);

do $p03$
declare q jsonb;p jsonb;v jsonb;v_id uuid;
 denied boolean:=false;receipt_before bigint;source_before bigint;
begin
 select count(*) into receipt_before from public.inventory_purchase_log;
 select count(*) into source_before from public.offline_purchase_history;
 q:=public.owner_purchase_unmapped_queue_v1((current_date-interval '1 month')::date);
 if (q->>'total')::int<>2 or
   (select count(*) from jsonb_array_elements(q->'items') a
      where a->>'mapping_status'='ambiguous_inventory_name')<>1 then
  raise exception 'P03 separate 1 ambiguous + 1 unmatched failed: %',q;
 end if;
 p:=public.owner_purchase_unmapped_preview_v1(
  '00000000-0000-0000-0000-000000000281','MAP_EXISTING_SKU',
  '00000000-0000-0000-0000-000000000101',null);
 if p->'target_snapshot'->>'item_name'<>'BAKSO TEST' or
    (p->>'stock_posted')::boolean or(p->>'finance_posted')::boolean then
    raise exception 'Unmapped proposal incorrectly posted SKU: %',p;
 end if;
 begin
  perform public.owner_purchase_unmapped_apply_v1(
    '00000000-0000-0000-0000-000000000281','MAP_EXISTING_SKU',
    '00000000-0000-0000-0000-000000000101',null,'invalid-token',
    'Original supplier invoice 281',
    'Owner inspected physical product and documented a SKU mapping decision');
 exception when others then denied:=true;end;
 if not denied then raise exception 'P03 invalid snapshot token accepted';end if;
 v:=public.owner_purchase_unmapped_apply_v1(
    '00000000-0000-0000-0000-000000000281','MAP_EXISTING_SKU',
    '00000000-0000-0000-0000-000000000101',null,p->>'token',
    'Original supplier invoice 281',
    'Owner inspected physical product and documented a SKU mapping decision');
 v_id:=(v->>'review_id')::uuid;
 if v_id is null or v->>'status'<>'DOCUMENTED_NOT_APPLIED' then
   raise exception 'P03 owner evidence decision missing: %',v;end if;
 if (select count(*) from public.inventory_purchase_log)<>receipt_before
  or (select count(*) from public.offline_purchase_history)<>source_before then
  raise exception 'P03 Owner documentary approval changed Purchase or Inventory';end if;
 denied:=false;
 begin
  perform public.owner_purchase_unmapped_preview_v1(
   '00000000-0000-0000-0000-000000000281','CLASSIFY_EXPENSE',null,
   'Beban Administrasi');
 exception when others then denied:=true;end;
 if not denied then raise exception 'P03 duplicate active approval allowed';end if;
 if (public.owner_p03_work_queue_v1((current_date-interval '1 month')::date)
     ->>'mapping_review_count')::integer<>2 then
    raise exception 'P03 aggregate queue must retain two unresolved source rows';end if;
 perform public.owner_purchase_unmapped_revoke_v1(v_id,
   'Supplier issued a corrected invoice; require new review and retain prior evidence');
 if (select count(*) from private.purchase_unmapped_owner_decisions_v1
   where id=v_id and revoked_at is not null and reviewed_by=auth.uid())<>1 then
    raise exception 'P03 historical revocation not auditable';end if;
 p:=public.owner_purchase_unmapped_preview_v1(
    '00000000-0000-0000-0000-000000000282','CLASSIFY_EXPENSE',
    null,'Beban Administrasi');
 if p->>'expense_category'<>'Beban Administrasi' or
   (p->>'rule_applied')::boolean then
    raise exception 'P03 expense is still merely a proposed mapping';end if;
 if has_table_privilege('authenticated','private.purchase_unmapped_owner_decisions_v1','SELECT')
 or has_table_privilege('authenticated','private.purchase_unmapped_owner_decisions_v1','INSERT') then
    raise exception 'P03 private decision table exposed to authenticated';end if;
 raise notice 'HSN P03 PASS: unknown and ambiguous classification, invalid token, audit revoke, no Stock/Finance writes';
end;
$p03$;

do $p04$
declare j jsonb;v_period date:=(date_trunc('month',current_date)+interval '1 month')::date;
begin
 -- Even if last month's batch is created DURING this month it must never
 -- be interpreted as a new business-month transaction.
 insert into public.import_jobs(brand_id,module,source_type,status,period_from,period_to,
  rows_total,rows_posted,created_at)
 values('00000000-0000-0000-0000-000000000001',
 'purchasing','owner_upload','completed',(v_period-interval '1 month')::date,
 (v_period-interval '1 day')::date,139,139,clock_timestamp());
 insert into public.sales_import_batches(brand_id,source,status,period_from,period_to,
  row_count,created_at)
 values('00000000-0000-0000-0000-000000000001','majoo','completed',
 (v_period-interval '1 month')::date,(v_period-interval '1 day')::date,
 641,clock_timestamp());
 j:=public.owner_p04_import_readiness_v1(v_period);
 if j->>'sales_status'<>'NO_SOURCE_UPLOAD_FOUND'
    or j->>'purchase_status'<>'NO_SOURCE_UPLOAD_FOUND'
    or (j->>'sales_jobs_for_period')::integer<>0
    or (j->>'sales_batches_for_period')::integer<>0 then
  raise exception 'Import-created date misclassified business month: %',j;
 end if;
 insert into public.sales_import_batches(brand_id,source,status,period_from,period_to,row_count)
 values('00000000-0000-0000-0000-000000000001','majoo','failed',
  v_period,(v_period+interval '1 month - 1 day')::date,50);
 j:=public.owner_p04_import_readiness_v1(v_period);
 if j->>'sales_status'<>'UPLOAD_ATTEMPT_NO_CANONICAL_DATA'
    or (j->>'failed_sales_batches_for_period')::integer<>1 then
  raise exception 'Failed target month batch should surface action, not invented sales: %',j;
 end if;
 insert into public.sales(id,brand_id,sold_at)
 values('00000000-0000-0000-0000-000000000881',
 '00000000-0000-0000-0000-000000000001',v_period);
 insert into public.offline_purchase_history(id,brand_id,source_period,source_file,
 row_no,purchase_date,item_name,quantity_text,total_amount)
 values('00000000-0000-0000-0000-000000000882',
 '00000000-0000-0000-0000-000000000001',
 v_period,'october-source-fixture.xlsx',1,v_period,'TESTING OCTOBER', '1',50);
 j:=public.owner_p04_import_readiness_v1(v_period);
 if j->>'sales_status'<>'PRESENT_IN_CANONICAL'
  or j->>'purchase_status'<>'PRESENT_IN_CANONICAL'
  or (j->>'import_created_at_not_business_date')::boolean<>true then
  raise exception 'Business-month canonical rows were not recognized: %',j;
 end if;
 raise notice 'HSN P04 PASS: source missing vs failed batch vs business rows; creation date cannot spoof period';
end;
$p04$;

rollback;
