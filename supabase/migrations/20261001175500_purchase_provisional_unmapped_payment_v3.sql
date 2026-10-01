-- Allow purchase rows with an unresolved payment account to enter canonical Purchase safely.
-- They post provisionally to 2190 and remain visible in Staff Kasir reconciliation until corrected.

create or replace function private.normalize_purchase_payment_method_v1(p_method text)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when upper(btrim(coalesce(p_method,''))) in ('TUNAI','CASH') then 'TUNAI'
    when upper(btrim(coalesce(p_method,''))) in ('TRANSFER','TF','REK MANDIRI','BANK TRANSFER') then 'TRANSFER'
    when upper(btrim(coalesce(p_method,''))) = 'QRIS' then 'QRIS'
    when upper(btrim(coalesce(p_method,''))) in ('UTANG','HUTANG','UTANG RIA') then 'UTANG'
    when upper(btrim(coalesce(p_method,''))) in ('PAYLATER','PAY LATER') then 'PAYLATER'
    when upper(btrim(coalesce(p_method,''))) in ('BELUM_DIPETAKAN','UNMAPPED','REVIEW') then 'BELUM_DIPETAKAN'
    else null
  end;
$$;

create or replace function private.enforce_purchase_payment_method_v1()
returns trigger
language plpgsql
set search_path=''
as $$
declare v_method text;
begin
  v_method:=private.normalize_purchase_payment_method_v1(new.payment_method);
  if v_method is null then
    raise exception 'Metode pembayaran wajib: TUNAI, TRANSFER, QRIS, UTANG, PAYLATER, atau status review BELUM_DIPETAKAN';
  end if;
  new.payment_method:=v_method;
  return new;
end;
$$;

create or replace view public.finance_purchase_expense_bridge_v1
with (security_invoker=true)
as
with p0 as (
  select p.*,
    case
      when upper(btrim(coalesce(p.payment_method,''))) in ('TUNAI','CASH') then 'TUNAI'
      when upper(btrim(coalesce(p.payment_method,''))) in ('TRANSFER','TF','REK MANDIRI','BANK TRANSFER') then 'TRANSFER'
      when upper(btrim(coalesce(p.payment_method,'')))='QRIS' then 'QRIS'
      when upper(btrim(coalesce(p.payment_method,''))) in ('UTANG','HUTANG','UTANG RIA') then 'UTANG'
      when upper(btrim(coalesce(p.payment_method,''))) in ('PAYLATER','PAY LATER') then 'PAYLATER'
      when upper(btrim(coalesce(p.payment_method,''))) in ('BELUM_DIPETAKAN','UNMAPPED','REVIEW') then 'BELUM_DIPETAKAN'
      else null
    end as normalized_payment_method
  from public.purchase_inventory_bridge p
)
select
  p.id as source_history_id,
  p.brand_id,
  coalesce(p.purchase_date,p.source_period) as purchase_date,
  date_trunc('month',coalesce(p.purchase_date,p.source_period))::date as period_month,
  p.item_name,p.total_amount,p.payment_method,
  case
    when fa_override.code is not null then fa_override.name
    when coalesce(p.raw_data->>'analytics_group','')='Karyawan'
      or coalesce(p.raw_data->>'analytics_category','') ilike '%Karyawan%'
      or upper(coalesce(p.item_name,'')) ~ '(GAJI|KARYAWAN|SERAGAM|JAS HUJAN|MAKAN SIANG|TUNJANGAN|BONUS|LEMBUR)' then 'Beban Kepegawaian'
    when upper(coalesce(p.item_name,'')) ~ '(SERVIS|SERVICE|PERBAIK|MAINTENANCE|KEBERSIH|SABUN|TISSUE|DETERGEN|PLASTIK SAMPAH|PERALATAN|ALAT KECIL|LAMPU|REPAIR|LISTRIK|TOKEN|GAS|CUCI)' then 'Beban Pemeliharaan'
    when coalesce(p.raw_data->>'analytics_category','') in ('Makanan','Minuman','Ice Cream','Kemasan & Supplies') then 'Beban Bahan Baku'
    else 'Beban Administrasi'
  end as expense_category,
  coalesce(fa_override.code,
    case
      when coalesce(p.raw_data->>'analytics_group','')='Karyawan'
        or coalesce(p.raw_data->>'analytics_category','') ilike '%Karyawan%'
        or upper(coalesce(p.item_name,'')) ~ '(GAJI|KARYAWAN|SERAGAM|JAS HUJAN|MAKAN SIANG|TUNJANGAN|BONUS|LEMBUR)' then '6200'
      when upper(coalesce(p.item_name,'')) ~ '(SERVIS|SERVICE|PERBAIK|MAINTENANCE|KEBERSIH|SABUN|TISSUE|DETERGEN|PLASTIK SAMPAH|PERALATAN|ALAT KECIL|LAMPU|REPAIR|LISTRIK|TOKEN|GAS|CUCI)' then '6110'
      when coalesce(p.raw_data->>'analytics_category','') in ('Makanan','Minuman','Ice Cream','Kemasan & Supplies') then '6120'
      else '6100'
    end) as expense_account_code,
  case
    when p.normalized_payment_method='TUNAI' then '1000'
    when p.normalized_payment_method in ('TRANSFER','QRIS') then '1100'
    when p.normalized_payment_method in ('UTANG','PAYLATER') then '2000'
    else '2190'
  end as counter_account_code,
  case when p.normalized_payment_method is null or p.normalized_payment_method='BELUM_DIPETAKAN' then 'provisional' else 'posted' end as journal_status
from p0 p
left join public.finance_accounts fa_override
  on fa_override.brand_id=p.brand_id
 and fa_override.code=nullif(p.raw_data->>'finance_account_code_override','')
 and fa_override.active
 and fa_override.account_type in ('ASSET','LIABILITY','EXPENSE','COGS')
where coalesce(p.total_amount,0)>0
  and coalesce(p.mapping_status,'') not in ('excluded','payment_candidate');

grant select on public.finance_purchase_expense_bridge_v1 to authenticated;