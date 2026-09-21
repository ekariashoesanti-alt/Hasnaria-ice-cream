-- Canonical Purchase -> Finance UI contract.
-- The subtotal exposed here is informational: it is already included in the
-- Finance income statement expense accounts and must never be added again.

create or replace view public.finance_purchase_expense_ui_v1
with (security_invoker=true) as
select
  e.brand_id,
  date_trunc('month', e.entry_date::timestamp)::date as period_month,
  e.entry_date,
  e.id as entry_id,
  e.source_id as purchase_id,
  p.item_name,
  coalesce(nullif(p.raw_data->>'analytics_category',''), nullif(e.metadata->>'expense_category',''), 'Lainnya') as purchase_category,
  coalesce(nullif(p.raw_data->>'analytics_group',''), 'Pembelian') as purchase_group,
  l.account_code,
  a.name as account_name,
  l.debit::numeric as amount,
  coalesce(nullif(e.metadata->>'payment_method',''), p.payment_method, '') as payment_method,
  e.status as journal_status,
  e.description
from public.finance_journal_entries e
join public.finance_journal_lines l
  on l.entry_id=e.id
join public.finance_accounts a
  on a.brand_id=e.brand_id and a.code=l.account_code
left join public.offline_purchase_history p
  on p.id=e.source_id and p.brand_id=e.brand_id
where e.source_type='purchase_expense'
  and e.auto_generated
  and l.line_no=1
  and l.debit>0;

grant select on public.finance_purchase_expense_ui_v1 to authenticated;

create or replace view public.finance_purchase_expense_period_summary_v1
with (security_invoker=true) as
select
  brand_id,
  period_month,
  count(*)::bigint as transaction_count,
  coalesce(sum(amount),0)::numeric as total_amount,
  count(*) filter (where journal_status='provisional')::bigint as provisional_count
from public.finance_purchase_expense_ui_v1
group by brand_id,period_month;

grant select on public.finance_purchase_expense_period_summary_v1 to authenticated;
