-- Canonical SOP: Purchase is the single value source; every eligible purchase value is expensed,
-- while stock receives quantity only. Production open periods were reconciled when this migration was applied.

create or replace view public.finance_purchase_expense_category_v1
with (security_invoker=true)
as
select
  x.brand_id,x.source_history_id,p.source_period,x.purchase_date as effective_date,x.period_month,
  x.item_name,x.total_amount::numeric(18,2) as total_amount,x.payment_method,
  coalesce(nullif(p.raw_data->>'analytics_group',''),'Belum diklasifikasi') as analytics_group,
  coalesce(nullif(p.raw_data->>'analytics_category',''),nullif(p.expense_category,''),'Lainnya') as analytics_category,
  'expense'::text as accounting_treatment,x.journal_status as finance_status,x.expense_category,
  case when x.journal_status='provisional' then 'provisional' else 'classified' end::text as category_status
from public.finance_purchase_expense_bridge_v1 x
join public.purchase_inventory_bridge p on p.brand_id=x.brand_id and p.id=x.source_history_id;

grant select on public.finance_purchase_expense_category_v1 to authenticated,service_role;

create or replace function private.reconcile_purchase_classification_v2(p_brand uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_deleted integer:=0; v_entries integer:=0; v_lines integer:=0; v_rc integer:=0;
begin
  if p_brand is null or p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid Purchase reconciliation range'; end if;
  if not private.same_brand(p_brand) or not (private.has_capability('settings.manage') or private.can_import_module('purchasing')) then raise exception 'Purchase Finance reconciliation permission required'; end if;

  delete from public.finance_journal_entries e
  where e.brand_id=p_brand and e.auto_generated and e.entry_date between p_from and p_to
    and e.source_type in ('purchase','purchase_expense');
  get diagnostics v_deleted=row_count;

  insert into public.finance_journal_entries(brand_id,entry_date,source_type,source_id,source_key,description,status,auto_generated,metadata)
  select x.brand_id,x.purchase_date,'purchase_expense',x.source_history_id,'purchase_expense:'||x.source_history_id::text,
    'Beban pembelian '||coalesce(x.item_name,'(tanpa nama)'),x.journal_status,true,
    jsonb_build_object('expense_category',x.expense_category,'expense_account_code',x.expense_account_code,'payment_method',x.payment_method,
      'accounting_treatment','expense','stock_value_policy','quantity_only','source','purchase_tab','reconciled_by','purchase_expense_quantity_stock_sop_v3')
  from public.finance_purchase_expense_bridge_v1 x
  where x.brand_id=p_brand and x.purchase_date between p_from and p_to and coalesce(x.total_amount,0)>0;
  get diagnostics v_entries=row_count;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select e.id,e.brand_id,1,x.expense_account_code,x.total_amount,0,coalesce(x.expense_category,x.item_name,'Beban pembelian')
  from public.finance_journal_entries e join public.finance_purchase_expense_bridge_v1 x on x.brand_id=e.brand_id and x.source_history_id=e.source_id
  where e.brand_id=p_brand and e.source_type='purchase_expense' and e.entry_date between p_from and p_to;
  get diagnostics v_rc=row_count; v_lines:=v_lines+v_rc;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select e.id,e.brand_id,2,x.counter_account_code,0,x.total_amount,'Lawan pembayaran pembelian'
  from public.finance_journal_entries e join public.finance_purchase_expense_bridge_v1 x on x.brand_id=e.brand_id and x.source_history_id=e.source_id
  where e.brand_id=p_brand and e.source_type='purchase_expense' and e.entry_date between p_from and p_to;
  get diagnostics v_rc=row_count; v_lines:=v_lines+v_rc;

  if exists(select 1 from public.finance_journal_entries e join public.finance_journal_lines l on l.entry_id=e.id
    where e.brand_id=p_brand and e.entry_date between p_from and p_to and e.source_type='purchase_expense'
    group by e.id having abs(sum(l.debit)-sum(l.credit))>=0.01) then raise exception 'Canonical Purchase reconciliation produced unbalanced journal entries'; end if;

  return jsonb_build_object('deleted_purchase_entries',v_deleted,'expense_entries',v_entries,'inventory_value_entries',0,'created_lines',v_lines,
    'from',p_from,'to',p_to,'policy','purchase_value_to_expense_stock_quantity_only');
end;$$;

create or replace view public.finance_purchase_reconciliation_monthly_v1
with (security_invoker=true)
as
with src as (
  select x.brand_id,x.period_month,count(*)::bigint as purchase_rows,coalesce(sum(x.total_amount),0)::numeric(18,2) as purchase_amount,
    coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Administrasi'),0)::numeric(18,2) as admin_expense,
    coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Pemeliharaan'),0)::numeric(18,2) as maintenance_expense,
    coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Bahan Baku'),0)::numeric(18,2) as raw_material_expense,
    coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Kepegawaian'),0)::numeric(18,2) as personnel_expense,
    count(*) filter(where x.stock_status='posted_to_stock')::bigint as stock_posted_rows,count(*) filter(where x.stock_status='ready_to_stock')::bigint as stock_ready_rows,
    count(*) filter(where x.stock_status='stock_review_required')::bigint as stock_review_rows,count(*) filter(where x.stock_status='not_stock_item')::bigint as non_stock_rows,
    count(*) filter(where x.stock_status='posted_to_stock' and abs(coalesce(x.posted_stock_qty,0)-coalesce(x.source_stock_qty,0))>=0.0001)::bigint as stock_qty_mismatch_rows
  from public.finance_purchase_dual_posting_v1 x group by x.brand_id,x.period_month
), j as (
  select e.brand_id,e.period_month,count(distinct e.id)::bigint as journal_rows,count(distinct e.id) filter(where e.status='provisional')::bigint as provisional_journal_rows,
    coalesce(sum(l.debit-l.credit) filter(where l.account_code in ('6100','6110','6120','6200')),0)::numeric(18,2) as journal_purchase_expense,
    abs(coalesce(sum(l.debit-l.credit),0))::numeric(18,2) as journal_balance_delta
  from public.finance_journal_entries e join public.finance_journal_lines l on l.entry_id=e.id
  where e.source_type='purchase_expense' and e.status<>'void' group by e.brand_id,e.period_month
)
select s.*,coalesce(j.journal_rows,0)::bigint as journal_rows,coalesce(j.provisional_journal_rows,0)::bigint as provisional_journal_rows,
  coalesce(j.journal_purchase_expense,0)::numeric(18,2) as journal_purchase_expense,(coalesce(j.journal_purchase_expense,0)-s.purchase_amount)::numeric(18,2) as purchase_journal_delta,
  coalesce(j.journal_balance_delta,0)::numeric(18,2) as journal_balance_delta,
  case when coalesce(j.journal_rows,0)=s.purchase_rows and abs(coalesce(j.journal_purchase_expense,0)-s.purchase_amount)<0.01 and coalesce(j.journal_balance_delta,0)<0.01 then 'MATCH' else 'MISMATCH' end::text as finance_link_status,
  case when s.stock_review_rows=0 and s.stock_ready_rows=0 and s.stock_qty_mismatch_rows=0 then 'OK' else 'REVIEW' end::text as stock_link_status
from src s left join j using(brand_id,period_month);

grant select on public.finance_purchase_reconciliation_monthly_v1 to authenticated,service_role;

create or replace function private.get_finance_management_period_v1(p_brand uuid,p_period date)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_period date:=date_trunc('month',p_period::timestamp)::date; v_prev date; v_result jsonb;
begin
  if not private.same_brand(p_brand) then raise exception 'Brand is outside your access'; end if;
  select max(period_start) into v_prev from public.accounting_periods where brand_id=p_brand and period_start<v_period;
  with tb as materialized (select * from public.finance_trial_balance_monthly_v1 where brand_id=p_brand and period_month in (v_period,v_prev)),
  inc as (
    select brand_id,period_month,coalesce(sum(period_credit-period_debit) filter(where account_type='REVENUE' and account_code='4000'),0)::numeric(18,2) revenue_sales,
      coalesce(sum(period_credit-period_debit) filter(where account_type='REVENUE' and account_code<>'4000'),0)::numeric(18,2) other_income,
      coalesce(sum(period_debit-period_credit) filter(where account_code='6100'),0)::numeric(18,2) admin_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_code='6110'),0)::numeric(18,2) maintenance_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_code='6120'),0)::numeric(18,2) raw_material_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_code='6200'),0)::numeric(18,2) personnel_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_type='EXPENSE' and account_code not in ('6100','6110','6120','6200','6400','6500')),0)::numeric(18,2) other_operating_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_code='6400'),0)::numeric(18,2) finance_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_code='6500'),0)::numeric(18,2) tax_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_type='COGS'),0)::numeric(18,2) legacy_cogs_ignored
    from tb group by brand_id,period_month
  ), calc as (
    select i.*,(admin_expense+maintenance_expense+raw_material_expense+personnel_expense)::numeric(18,2) total_purchase_expense,
      (admin_expense+maintenance_expense+raw_material_expense+personnel_expense+other_operating_expense)::numeric(18,2) total_operating_expense,
      (revenue_sales+other_income-admin_expense-maintenance_expense-raw_material_expense-personnel_expense-other_operating_expense-finance_expense)::numeric(18,2) profit_before_tax,
      (revenue_sales+other_income-admin_expense-maintenance_expense-raw_material_expense-personnel_expense-other_operating_expense-finance_expense-tax_expense)::numeric(18,2) profit_after_tax,
      'purchase_journal'::text report_basis from inc i
  )
  select jsonb_build_object('period',v_period,'previous_period',v_prev,'current',(select to_jsonb(c) from calc c where c.period_month=v_period),
    'previous',(select to_jsonb(c) from calc c where c.period_month=v_prev),
    'purchase_control_current',(select to_jsonb(r) from public.finance_purchase_reconciliation_monthly_v1 r where r.brand_id=p_brand and r.period_month=v_period),
    'purchase_control_previous',(select to_jsonb(r) from public.finance_purchase_reconciliation_monthly_v1 r where r.brand_id=p_brand and r.period_month=v_prev),
    'concept',jsonb_build_object('label','Laporan Manajemen · Basis Pembelian','purchase_value','expense','stock_value','quantity_only','hpp','retired','finance_source','double_entry_journal')) into v_result;
  return v_result;
end;$$;

create or replace function public.get_finance_management_period_v1(p_brand uuid,p_period date)
returns jsonb language sql set search_path='' as $$ select private.get_finance_management_period_v1(p_brand,p_period); $$;
grant execute on function public.get_finance_management_period_v1(uuid,date) to authenticated,service_role;
