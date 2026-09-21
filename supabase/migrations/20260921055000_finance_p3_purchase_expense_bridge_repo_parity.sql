-- Finance P3 repo parity: purchase-expense bridge already applied to production.
create or replace view public.finance_purchase_expense_bridge_v1
with (security_invoker=true) as
select source_history_id,brand_id,purchase_date,date_trunc('month',purchase_date::timestamptz)::date period_month,
 item_name,total_amount,payment_method,expense_category,
 case when lower(coalesce(expense_category,'')) ~ '(gaji|salary|wage|employee|karyawan|kepegawaian)' then '6200'
      when lower(coalesce(expense_category,'')) ~ '(admin|atk|office|perizin|license|lisensi|printing)' then '6100'
      when lower(coalesce(expense_category,'')) ~ '(depres|penyusutan)' then '6300'
      when lower(coalesce(expense_category,'')) ~ '(bunga|bank|finance|keuangan)' then '6400'
      when lower(coalesce(expense_category,'')) ~ '(pajak|tax)' then '6500' else '6000' end expense_account_code,
 case when upper(coalesce(payment_method,''))='TUNAI' then '1000'
      when upper(coalesce(payment_method,'')) in ('REK MANDIRI','TRANSFER','TF','QRIS') then '1100'
      when upper(coalesce(payment_method,'')) like '%UTANG%' or upper(coalesce(payment_method,'')) like '%PAYLATER%' then '2000' else '2190' end counter_account_code,
 case when upper(coalesce(payment_method,'')) ~ '^(TUNAI|REK MANDIRI|TRANSFER|TF|QRIS|UTANG RIA|PAYLATER)$' then 'posted' else 'provisional' end journal_status
from public.purchase_expense_staging p
where mapping_status='expense_candidate' and purchase_date is not null and coalesce(total_amount,0)>0;
grant select on public.finance_purchase_expense_bridge_v1 to authenticated;
