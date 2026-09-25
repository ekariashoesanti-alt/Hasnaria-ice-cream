with target_brand as (
  select id from public.brands where name='Hasnaria' order by id limit 1
)
insert into public.finance_accounts (brand_id,code,name,account_type,active)
select id,'1990','Pembelian Dalam Review','ASSET',true from target_brand
on conflict (brand_id,code) do update
set name=excluded.name,account_type=excluded.account_type,active=true;

with target_brand as (
  select id from public.brands where name='Hasnaria' order by id limit 1
)
insert into public.accounting_periods (brand_id,period_start,period_end,status)
select b.id,d::date,(d + interval '1 month - 1 day')::date,'open'
from target_brand b
cross join generate_series('2025-05-01'::date,'2025-12-01'::date,interval '1 month') d
where not exists (
  select 1 from public.accounting_periods ap
  where ap.brand_id=b.id and ap.period_start=d::date
);

create or replace view public.ui_purchase_accounting_v1
with (security_invoker=true)
as
select
  p.id as source_history_id,
  p.brand_id,
  p.source_period,
  p.source_file,
  p.row_no,
  p.purchase_date,
  coalesce(e.purchase_date,p.purchase_date,p.source_period) as effective_date,
  case
    when p.purchase_date is not null then 'actual_date'::text
    when e.source_history_id is not null and coalesce(p.raw_data->>'analytics_kind','')='cost_component' then 'period_summary'::text
    else 'period_fallback'::text
  end as date_basis,
  p.item_name,
  p.quantity_text,
  p.quantity_numeric,
  p.unit_text,
  p.unit_price,
  p.total_amount,
  p.payment_method,
  p.inventory_item_id,
  p.mapping_status,
  p.expense_category as rule_expense_category,
  coalesce(nullif(p.raw_data->>'analytics_group',''),'Belum diklasifikasi') as analytics_group,
  coalesce(nullif(p.raw_data->>'analytics_category',''),nullif(p.expense_category,''),'Lainnya') as analytics_category,
  coalesce(nullif(p.raw_data->>'analytics_kind',''),'purchase_item') as analytics_kind,
  case
    when p.mapping_status='payment_candidate' then 'payment_review'::text
    when e.source_history_id is not null then 'expense'::text
    when p.mapping_status=any(array['inventory_alias'::text,'exact_name'::text]) then 'inventory'::text
    when coalesce(p.raw_data->>'analytics_group','')='Investasi' then 'asset_review'::text
    when coalesce(p.raw_data->>'analytics_group','')=any(array['Administrasi'::text,'Karyawan'::text]) then 'expense_review'::text
    else 'classification_review'::text
  end as accounting_treatment,
  case
    when p.mapping_status='payment_candidate' then 'Review pembayaran/cicilan'::text
    when e.source_history_id is not null then 'Beban periode'::text
    when p.mapping_status=any(array['inventory_alias'::text,'exact_name'::text]) then 'Persediaan'::text
    when coalesce(p.raw_data->>'analytics_group','')='Investasi' then 'Kandidat aset tetap'::text
    when coalesce(p.raw_data->>'analytics_group','')=any(array['Administrasi'::text,'Karyawan'::text]) then 'Kandidat beban'::text
    else 'Perlu klasifikasi'::text
  end as accounting_label,
  case
    when e.source_history_id is not null then e.expense_account_code
    when p.mapping_status=any(array['inventory_alias'::text,'exact_name'::text]) then '1300'::text
    when coalesce(p.raw_data->>'analytics_group','')='Investasi' then '1500'::text
    when coalesce(p.raw_data->>'analytics_group','')='Administrasi' then '6100'::text
    when coalesce(p.raw_data->>'analytics_group','')='Karyawan' then '6200'::text
    else '1990'::text
  end as debit_account_code,
  case
    when e.source_history_id is not null then e.counter_account_code
    when upper(btrim(coalesce(p.payment_method,'')))=any(array['TUNAI'::text,'CASH'::text]) then '1000'::text
    when upper(btrim(coalesce(p.payment_method,'')))=any(array['REK MANDIRI'::text,'TRANSFER'::text,'TF'::text,'QRIS'::text]) then '1100'::text
    when upper(coalesce(p.payment_method,'')) like '%UTANG%' or upper(coalesce(p.payment_method,'')) like '%PAYLATER%' then '2000'::text
    else '2190'::text
  end as counter_account_code,
  case
    when p.mapping_status='payment_candidate' then 'review_required'::text
    when e.source_history_id is not null then e.journal_status
    when p.mapping_status=any(array['inventory_alias'::text,'exact_name'::text]) then
      case
        when p.purchase_date is null then 'review_required'::text
        when upper(btrim(coalesce(p.payment_method,'')))=any(array['TUNAI'::text,'CASH'::text,'REK MANDIRI'::text,'TRANSFER'::text,'TF'::text,'QRIS'::text])
          or upper(coalesce(p.payment_method,'')) like '%UTANG%'
          or upper(coalesce(p.payment_method,'')) like '%PAYLATER%'
        then 'posted'::text
        else 'provisional'::text
      end
    when coalesce(p.raw_data->>'analytics_group','')='Investasi' then 'review_required'::text
    else 'review_required'::text
  end as finance_status,
  p.raw_data,
  p.notes
from public.purchase_inventory_bridge p
left join public.finance_purchase_expense_bridge_v1 e
  on e.source_history_id=p.id and e.brand_id=p.brand_id;
