-- Hasnaria P0.3/P0.4: Owner read-only reconciliation / missing period audit.
-- A created_at in October does NOT mean the business transaction belongs to
-- October. Never infer/construct sales or purchases from old September imports.
create or replace function private.owner_p03_work_queue_v1(p_period date)
returns jsonb language plpgsql stable security definer set search_path=''
as $q$
declare v_brand uuid;v_month date;v_pending jsonb;v_unmapped jsonb;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if p_period is null then raise exception 'Bulan Pembelian wajib dipilih';end if;
 v_month:=date_trunc('month',p_period)::date;
 v_pending:=private.owner_purchase_unit_queue_v1(v_month);
 v_unmapped:=private.owner_purchase_unmapped_queue_v1(v_month);
 return jsonb_build_object(
 'period',v_month,
 'pending_unit',v_pending->'items','pending_unit_count',(v_pending->>'total')::integer,
 'mapping_review',v_unmapped->'items','mapping_review_count',(v_unmapped->>'total')::integer,
 'write_policy','DOCUMENT_ONLY_NO_STOCK_OR_FINANCE_WRITE',
 'posting_rule','Only approved post-opname source with verified unit and protected receipt transaction may be posted in a separately authorized release');
end;
$q$;

create or replace function private.owner_p04_import_readiness_v1(p_period date)
returns jsonb language plpgsql stable security definer set search_path=''
as $readiness$
declare v_brand uuid;v_start date;v_end date;
 v_sale integer;v_purchase integer;v_evidence integer;
 v_sales_jobs integer;v_purchase_jobs integer;v_sales_batches integer;
 v_failed_batches integer;v_import_failed integer;
 v_last_sale date;v_last_purchase date;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if p_period is null then raise exception 'Bulan transaksi wajib dipilih';end if;
 v_start:=date_trunc('month',p_period)::date;
 v_end:=(v_start+interval '1 month')::date;
 if v_start>(date_trunc('month',current_date)+interval '1 month')::date then
  raise exception 'Tidak boleh memproses bulan jauh di masa depan';end if;
 select count(*),max(sold_at) into v_sale,v_last_sale
 from public.sales where brand_id=v_brand and sold_at>=v_start and sold_at<v_end;
 select count(*),max(purchase_date) into v_purchase,v_last_purchase
 from public.offline_purchase_history where brand_id=v_brand and
   purchase_date>=v_start and purchase_date<v_end;
 select count(*) into v_evidence from public.purchase_import_evidence
 where brand_id=v_brand and purchase_date>=v_start and purchase_date<v_end;
 select count(*) filter(where module='sales'),
        count(*) filter(where module='purchasing'),
        count(*) filter(where status in ('failed','rejected'))
 into v_sales_jobs,v_purchase_jobs,v_import_failed
 from public.import_jobs
 where brand_id=v_brand and period_from<v_end and period_to>=v_start;
 select count(*),count(*) filter(where status='failed')
 into v_sales_batches,v_failed_batches
 from public.sales_import_batches where brand_id=v_brand
  and period_from<v_end and period_to>=v_start;
 return jsonb_build_object(
  'period',v_start,'sales_canonical_rows',v_sale,
  'purchase_canonical_rows',v_purchase,'purchase_invoice_evidence_rows',v_evidence,
  'sales_jobs_for_period',v_sales_jobs,'purchase_jobs_for_period',v_purchase_jobs,
  'sales_batches_for_period',v_sales_batches,
  'failed_sales_batches_for_period',v_failed_batches,
  'failed_import_jobs_for_period',v_import_failed,
  'latest_sale_business_date',v_last_sale,'latest_purchase_business_date',v_last_purchase,
  'sales_status',case
    when v_sale>0 then 'PRESENT_IN_CANONICAL'
    when v_sales_jobs+v_sales_batches=0 then 'NO_SOURCE_UPLOAD_FOUND'
    else 'UPLOAD_ATTEMPT_NO_CANONICAL_DATA' end,
  'purchase_status',case
    when v_purchase>0 then 'PRESENT_IN_CANONICAL'
    when v_purchase_jobs=0 and v_evidence=0 then 'NO_SOURCE_UPLOAD_FOUND'
    else 'UPLOAD_ATTEMPT_NO_CANONICAL_DATA' end,
  'import_created_at_not_business_date',true,
  'action',case
    when v_sale=0 or v_purchase=0 then 'CONFIRM_SOURCE_FILE_AND_UPLOAD_CORRECT_BUSINESS_MONTH'
    else 'VERIFY_PERIOD_RECONCILIATION' end,
  'will_create_or_change_transactions',false);
end;
$readiness$;

create or replace function public.owner_p03_work_queue_v1(p_period date)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.owner_p03_work_queue_v1(p_period)$$;
create or replace function public.owner_p04_import_readiness_v1(p_period date)
returns jsonb language sql stable security invoker set search_path=''
as $$select private.owner_p04_import_readiness_v1(p_period)$$;
revoke all on function public.owner_p03_work_queue_v1(date),
 public.owner_p04_import_readiness_v1(date) from public,anon;
grant execute on function public.owner_p03_work_queue_v1(date),
 public.owner_p04_import_readiness_v1(date) to authenticated,service_role;
comment on function private.owner_p04_import_readiness_v1(date) is
 'P0.4 Owner-only presence/source audit; distinguishes created_at import time from actual business period and never auto-creates missing transactions.';
