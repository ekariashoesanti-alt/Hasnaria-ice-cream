-- Fast path for Purchase → Finance + Stock.
-- The previous view expanded the Purchase accounting stack multiple times
-- (expense category -> accounting detail -> inventory bridge again), which
-- caused the authenticated REST query to hit statement_timeout as data grew.
-- Materialize the canonical purchase/inventory bridge once, then derive the
-- management expense classification and stock status from that single pass.

create or replace view public.finance_purchase_dual_posting_v1
with (security_invoker=true)
as
with b as materialized (
  select *
  from public.purchase_inventory_bridge
  where coalesce(total_amount,0)>0
), classified as (
  select
    b.*,
    coalesce(b.purchase_date,b.source_period) as effective_date_fast,
    coalesce(nullif(b.raw_data->>'analytics_group',''),'Belum diklasifikasi') as analytics_group_fast,
    coalesce(nullif(b.raw_data->>'analytics_category',''),nullif(b.expense_category,''),'Lainnya') as analytics_category_fast,
    case
      when coalesce(b.raw_data->>'analytics_group','')='Karyawan'
        or coalesce(b.raw_data->>'analytics_category','') ilike '%Karyawan%'
        or upper(coalesce(b.item_name,'')) ~ '(GAJI|KARYAWAN|SERAGAM|JAS HUJAN|MAKAN SIANG|TUNJANGAN|BONUS|LEMBUR)'
        then 'Beban Kepegawaian'
      when upper(coalesce(b.item_name,'')) ~ '(SERVIS|SERVICE|PERBAIK|MAINTENANCE|KEBERSIH|SABUN|TISSUE|DETERGEN|PLASTIK SAMPAH|PERALATAN|ALAT KECIL|LAMPU|REPAIR|LISTRIK|TOKEN|GAS|CUCI)'
        then 'Beban Pemeliharaan'
      when coalesce(b.raw_data->>'analytics_category','') in ('Makanan','Minuman','Ice Cream','Kemasan & Supplies')
        then 'Beban Bahan Baku'
      else 'Beban Administrasi'
    end as expense_category_fast,
    case
      when b.mapping_status in ('payment_candidate','excluded') then 'review_required'
      when upper(btrim(coalesce(b.payment_method,''))) in ('TUNAI','CASH','REK MANDIRI','TRANSFER','TF','QRIS')
        or upper(coalesce(b.payment_method,'')) like '%UTANG%'
        or upper(coalesce(b.payment_method,'')) like '%PAYLATER%'
        then 'posted'
      else 'provisional'
    end as finance_status_fast,
    case
      when upper(btrim(coalesce(b.payment_method,''))) in ('TUNAI','CASH') then '1000'
      when upper(btrim(coalesce(b.payment_method,''))) in ('REK MANDIRI','TRANSFER','TF','QRIS') then '1100'
      when upper(coalesce(b.payment_method,'')) like '%UTANG%'
        or upper(coalesce(b.payment_method,'')) like '%PAYLATER%'
        then '2000'
      else '2190'
    end as counter_account_code_fast
  from b
), shaped as (
  select
    c.*,
    case c.expense_category_fast
      when 'Beban Administrasi' then '6100'
      when 'Beban Pemeliharaan' then '6110'
      when 'Beban Bahan Baku' then '6120'
      when 'Beban Kepegawaian' then '6200'
      else '6000'
    end as expense_account_code_fast,
    case
      when c.finance_status_fast='review_required' then 'provisional_review'
      when c.finance_status_fast='provisional' then 'provisional'
      else 'classified'
    end as category_status_fast
  from classified c
)
select
  s.brand_id,
  s.id as source_history_id,
  s.source_period,
  s.effective_date_fast as effective_date,
  date_trunc('month',s.effective_date_fast::timestamp)::date as period_month,
  s.item_name,
  s.total_amount::numeric(18,2) as total_amount,
  s.payment_method,
  s.analytics_group_fast as analytics_group,
  s.analytics_category_fast as analytics_category,
  s.expense_category_fast as expense_category,
  s.category_status_fast as category_status,
  s.finance_status_fast as source_finance_status,
  s.expense_account_code_fast as expense_account_code,
  s.expense_category_fast as expense_account_name,
  s.counter_account_code_fast as counter_account_code,
  coalesce(ca.name,'Akun lawan sementara') as counter_account_name,
  s.inventory_item_id,
  i.item_name as inventory_item_name,
  s.mapping_status as stock_mapping_status,
  s.ready_for_inventory,
  s.inventory_qty as source_stock_qty,
  nullif(s.unit_text,'') as source_stock_unit,
  l.id as stock_log_id,
  l.qty as posted_stock_qty,
  l.unit as posted_stock_unit,
  case
    when l.id is not null then 'posted_to_stock'
    when s.ready_for_inventory then 'ready_to_stock'
    when s.mapping_status in ('unmatched','ambiguous_inventory_name','invalid_qty') then 'stock_review_required'
    else 'not_stock_item'
  end as stock_status
from shaped s
left join public.finance_accounts ca
  on ca.brand_id=s.brand_id and ca.code=s.counter_account_code_fast
left join public.inventory_items i
  on i.id=s.inventory_item_id and i.brand_id=s.brand_id
left join public.inventory_purchase_log l
  on l.brand_id=s.brand_id and l.source_history_id=s.id;

grant select on public.finance_purchase_dual_posting_v1 to authenticated,service_role;
