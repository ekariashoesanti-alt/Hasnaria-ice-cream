insert into public.finance_accounts (brand_id,code,name,account_type,active) values
('a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4','6080','Beban Internet & Telekomunikasi','EXPENSE',true),
('a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4','6090','Beban Sewa','EXPENSE',true)
on conflict (brand_id,code) do update set name=excluded.name,account_type='EXPENSE',active=true;

create or replace view public.finance_purchase_expense_bridge_v1
with (security_invoker=true)
as
select
  source_history_id,
  brand_id,
  purchase_date,
  date_trunc('month',purchase_date::timestamptz)::date as period_month,
  item_name,
  total_amount,
  payment_method,
  expense_category,
  case
    when lower(coalesce(expense_category,'')) ~ '(cleaning|kebersihan|pembersih)' then '6010'
    when lower(coalesce(expense_category,'')) ~ '(delivery|freight|pengiriman|angkut|ongkir)' then '6020'
    when lower(coalesce(expense_category,'')) ~ '(kitchen_fuel|gas|fuel|bahan.?bakar)' then '6030'
    when lower(coalesce(expense_category,'')) ~ '(marketing|promosi|iklan|advert)' then '6040'
    when lower(coalesce(expense_category,'')) ~ '(small_equipment|peralatan.?kecil|equipment)' then '6050'
    when lower(coalesce(expense_category,'')) ~ '(store_supplies|perlengkapan.?toko|supplies)' then '6060'
    when lower(coalesce(expense_category,'')) ~ '(utilities_electricity|electric|listrik|utilit|air|water)' then '6070'
    when lower(coalesce(expense_category,'')) ~ '(internet|telekom|wifi|data)' then '6080'
    when lower(coalesce(expense_category,'')) ~ '(sewa|rent|rental)' then '6090'
    when lower(coalesce(expense_category,'')) ~ '(gaji|salary|wage|employee|karyawan|kepegawaian|staff)' then '6200'
    when lower(coalesce(expense_category,'')) ~ '(admin|atk|office|perizin|license|lisensi|printing|sistem|software|subscription|langganan)' then '6100'
    when lower(coalesce(expense_category,'')) ~ '(depres|penyusutan)' then '6300'
    when lower(coalesce(expense_category,'')) ~ '(bunga|bank|finance|keuangan)' then '6400'
    when lower(coalesce(expense_category,'')) ~ '(pajak|tax)' then '6500'
    else '6000'
  end as expense_account_code,
  case
    when upper(btrim(coalesce(payment_method,''))) = any(array['TUNAI','CASH']) then '1000'
    when upper(btrim(coalesce(payment_method,''))) = any(array['REK MANDIRI','TRANSFER','TF','QRIS']) then '1100'
    when upper(coalesce(payment_method,'')) like '%UTANG%' or upper(coalesce(payment_method,'')) like '%PAYLATER%' then '2000'
    else '2190'
  end as counter_account_code,
  case
    when upper(btrim(coalesce(payment_method,''))) = any(array['TUNAI','CASH','REK MANDIRI','TRANSFER','TF','QRIS'])
      or upper(coalesce(payment_method,'')) like '%UTANG%'
      or upper(coalesce(payment_method,'')) like '%PAYLATER%'
    then 'posted'
    else 'provisional'
  end as journal_status
from public.purchase_expense_staging p
where mapping_status='expense_candidate'
  and purchase_date is not null
  and coalesce(total_amount,0)>0;
