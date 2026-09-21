-- Align Purchase classifications with canonical Finance accounting without proliferating GL accounts.
-- Existing detailed purchase categories remain analytical dimensions; Finance posts to the existing SAK-EMKM-oriented COA.

create or replace view public.purchase_expense_staging
with (security_invoker=true) as
select
  p.id as source_history_id,
  p.brand_id,
  case
    when p.purchase_date is null
      and coalesce(p.raw_data->>'analytics_kind','')='cost_component'
      and coalesce(p.raw_data->>'analytics_group','') in ('Operasi','Administrasi','Karyawan')
      then p.source_period
    else p.purchase_date
  end as purchase_date,
  p.source_period,
  p.source_file,
  p.row_no,
  p.item_name,
  p.total_amount,
  p.payment_method,
  case
    when p.mapping_status='expense_candidate' then coalesce(nullif(p.expense_category,''),nullif(p.raw_data->>'analytics_category',''),nullif(p.raw_data->>'analytics_group',''),'operating_expense')
    when coalesce(p.raw_data->>'analytics_kind','')='cost_component'
      and coalesce(p.raw_data->>'analytics_group','') in ('Operasi','Administrasi','Karyawan')
      then coalesce(nullif(p.raw_data->>'analytics_category',''),nullif(p.raw_data->>'analytics_group',''),'operating_expense')
    else p.expense_category
  end as expense_category,
  case
    when p.mapping_status='expense_candidate' then 'expense_candidate'
    when coalesce(p.raw_data->>'analytics_kind','')='cost_component'
      and coalesce(p.raw_data->>'analytics_group','') in ('Operasi','Administrasi','Karyawan')
      then 'expense_candidate'
    else p.mapping_status
  end as mapping_status,
  case
    when p.purchase_date is null
      and coalesce(p.raw_data->>'analytics_kind','')='cost_component'
      and coalesce(p.raw_data->>'analytics_group','') in ('Operasi','Administrasi','Karyawan')
      then concat_ws(' · ',nullif(p.notes,''),'Tanggal berasal dari periode ringkasan')
    else p.notes
  end as notes
from public.purchase_inventory_bridge p
where p.mapping_status in ('expense_candidate','payment_candidate')
   or (
     coalesce(p.raw_data->>'analytics_kind','')='cost_component'
     and coalesce(p.raw_data->>'analytics_group','') in ('Operasi','Administrasi','Karyawan')
     and coalesce(p.total_amount,0)>0
   );

grant select on public.purchase_expense_staging to authenticated;

create or replace view public.finance_purchase_expense_bridge_v1
with (security_invoker=true) as
select
  p.source_history_id,
  p.brand_id,
  p.purchase_date,
  date_trunc('month',p.purchase_date::timestamptz)::date as period_month,
  p.item_name,
  p.total_amount,
  p.payment_method,
  p.expense_category,
  case
    when lower(coalesce(p.expense_category,'')) ~ '(gaji|salary|wage|employee|karyawan|kepegawaian|staff)' then '6200'
    when lower(coalesce(p.expense_category,'')) ~ '(marketing|promosi|iklan|advert)' then '6000'
    when lower(coalesce(p.expense_category,'')) ~ '(admin|atk|office|perizin|license|lisensi|printing|sistem|software|subscription|langganan)' then '6100'
    when lower(coalesce(p.expense_category,'')) ~ '(depres|penyusutan)' then '6300'
    when lower(coalesce(p.expense_category,'')) ~ '(bunga|bank|finance|keuangan)' then '6400'
    when lower(coalesce(p.expense_category,'')) ~ '(pajak|tax)' then '6500'
    else '6000'
  end as expense_account_code,
  case
    when upper(btrim(coalesce(p.payment_method,''))) in ('TUNAI','CASH') then '1000'
    when upper(btrim(coalesce(p.payment_method,''))) in ('REK MANDIRI','TRANSFER','TF','QRIS') then '1100'
    when upper(coalesce(p.payment_method,'')) like '%UTANG%' or upper(coalesce(p.payment_method,'')) like '%PAYLATER%' then '2000'
    else '2190'
  end as counter_account_code,
  case
    when upper(btrim(coalesce(p.payment_method,''))) in ('TUNAI','CASH','REK MANDIRI','TRANSFER','TF','QRIS')
      or upper(coalesce(p.payment_method,'')) like '%UTANG%'
      or upper(coalesce(p.payment_method,'')) like '%PAYLATER%'
      then 'posted'
    else 'provisional'
  end as journal_status
from public.purchase_expense_staging p
where p.mapping_status='expense_candidate'
  and p.purchase_date is not null
  and coalesce(p.total_amount,0)>0;

grant select on public.finance_purchase_expense_bridge_v1 to authenticated;

create or replace view public.ui_purchase_accounting_v1
with (security_invoker=true) as
select
  p.id as source_history_id,
  p.brand_id,
  p.source_period,
  p.source_file,
  p.row_no,
  p.purchase_date,
  coalesce(e.purchase_date,p.purchase_date,p.source_period) as effective_date,
  case
    when p.purchase_date is not null then 'actual_date'
    when e.source_history_id is not null and coalesce(p.raw_data->>'analytics_kind','')='cost_component' then 'period_summary'
    else 'period_fallback'
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
    when p.mapping_status='payment_candidate' then 'payment_review'
    when e.source_history_id is not null then 'expense'
    when p.mapping_status in ('inventory_alias','exact_name') then 'inventory'
    when coalesce(p.raw_data->>'analytics_group','')='Investasi' then 'asset_review'
    when coalesce(p.raw_data->>'analytics_group','') in ('Administrasi','Karyawan') then 'expense_review'
    else 'classification_review'
  end as accounting_treatment,
  case
    when p.mapping_status='payment_candidate' then 'Review pembayaran/cicilan'
    when e.source_history_id is not null then 'Beban periode'
    when p.mapping_status in ('inventory_alias','exact_name') then 'Persediaan'
    when coalesce(p.raw_data->>'analytics_group','')='Investasi' then 'Kandidat aset tetap'
    when coalesce(p.raw_data->>'analytics_group','') in ('Administrasi','Karyawan') then 'Kandidat beban'
    else 'Perlu klasifikasi'
  end as accounting_label,
  case
    when e.source_history_id is not null then e.expense_account_code
    when p.mapping_status in ('inventory_alias','exact_name') then '1300'
    when coalesce(p.raw_data->>'analytics_group','')='Investasi' then '1500'
    when coalesce(p.raw_data->>'analytics_group','')='Administrasi' then '6100'
    when coalesce(p.raw_data->>'analytics_group','')='Karyawan' then '6200'
    else null
  end as debit_account_code,
  case
    when e.source_history_id is not null then e.counter_account_code
    when upper(btrim(coalesce(p.payment_method,''))) in ('TUNAI','CASH') then '1000'
    when upper(btrim(coalesce(p.payment_method,''))) in ('REK MANDIRI','TRANSFER','TF','QRIS') then '1100'
    when upper(coalesce(p.payment_method,'')) like '%UTANG%' or upper(coalesce(p.payment_method,'')) like '%PAYLATER%' then '2000'
    else '2190'
  end as counter_account_code,
  case
    when p.mapping_status='payment_candidate' then 'review_required'
    when e.source_history_id is not null then e.journal_status
    when p.mapping_status in ('inventory_alias','exact_name') then
      case
        when p.purchase_date is null then 'review_required'
        when upper(btrim(coalesce(p.payment_method,''))) in ('TUNAI','CASH','REK MANDIRI','TRANSFER','TF','QRIS')
          or upper(coalesce(p.payment_method,'')) like '%UTANG%'
          or upper(coalesce(p.payment_method,'')) like '%PAYLATER%'
          then 'posted'
        else 'provisional'
      end
    when coalesce(p.raw_data->>'analytics_group','')='Investasi' then 'review_required'
    else 'review_required'
  end as finance_status,
  p.raw_data,
  p.notes
from public.purchase_inventory_bridge p
left join public.finance_purchase_expense_bridge_v1 e
  on e.source_history_id=p.id and e.brand_id=p.brand_id;

grant select on public.ui_purchase_accounting_v1 to authenticated;

create or replace view public.ui_purchase_accounting_detail_v1
with (security_invoker=true) as
select
  u.*,
  da.name as debit_account_name,
  ca.name as counter_account_name,
  case
    when u.accounting_treatment='payment_review' then 'Tentukan apakah cicilan adalah pembayaran kas atau pelunasan utang.'
    when u.accounting_treatment='classification_review' then 'Hubungkan item ke persediaan atau tandai sebagai beban/aset.'
    when u.accounting_treatment='asset_review' then 'Konfirmasi kapitalisasi aset atau reklasifikasi ke beban/persediaan.'
    when u.accounting_treatment='expense_review' then 'Konfirmasi kategori beban agar posting akuntansi final.'
    when u.finance_status='provisional' then 'Perlakuan akun sudah diketahui; sumber pembayaran masih perlu direkonsiliasi.'
    else null
  end as required_action
from public.ui_purchase_accounting_v1 u
left join public.finance_accounts da on da.brand_id=u.brand_id and da.code=u.debit_account_code
left join public.finance_accounts ca on ca.brand_id=u.brand_id and ca.code=u.counter_account_code;

grant select on public.ui_purchase_accounting_detail_v1 to authenticated;

create or replace view public.finance_purchase_data_quality_queue_v1
with (security_invoker=true) as
select
  p.id as source_history_id,
  p.brand_id,
  coalesce(p.purchase_date,p.source_period) as effective_date,
  p.purchase_date,
  p.source_period,
  p.item_name,
  p.quantity_text,
  p.quantity_numeric,
  p.unit_text,
  p.total_amount,
  p.payment_method,
  p.mapping_status,
  case p.mapping_status
    when 'unmatched' then 'Hubungkan item pembelian ke master persediaan atau tandai sebagai beban.'
    when 'missing_date' then 'Lengkapi tanggal transaksi sebelum transaksi item dapat diposting.'
    when 'invalid_qty' then 'Perbaiki kuantitas/satuan pembelian sebelum menghitung persediaan.'
    when 'payment_candidate' then 'Tentukan apakah cicilan merupakan pembayaran kas atau pelunasan utang terkait.'
    else 'Review data pembelian.'
  end as required_action,
  case p.mapping_status when 'missing_date' then 10 when 'payment_candidate' then 20 when 'invalid_qty' then 30 else 40 end as priority_rank
from public.purchase_inventory_bridge p
where p.mapping_status in ('unmatched','missing_date','invalid_qty','payment_candidate')
  and not (
    coalesce(p.raw_data->>'analytics_kind','')='cost_component'
    and coalesce(p.raw_data->>'analytics_group','') in ('Operasi','Administrasi','Karyawan')
    and coalesce(p.total_amount,0)>0
  );

grant select on public.finance_purchase_data_quality_queue_v1 to authenticated;

create or replace view public.finance_purchase_data_quality_summary_v1
with (security_invoker=true) as
select mapping_status,count(*) as row_count,coalesce(sum(total_amount),0)::numeric as total_amount
from public.finance_purchase_data_quality_queue_v1
group by mapping_status;

grant select on public.finance_purchase_data_quality_summary_v1 to authenticated;
