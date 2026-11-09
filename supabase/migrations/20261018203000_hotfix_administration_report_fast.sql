-- HSN-ADMIN-P0: remove the recursive classification/sync-status view expansion
-- from Finance Administration Overview and Chart, which timed out on PostgREST.
-- Read existing source and posted journal lines only; no journal is created.
-- Classification uses audited canonical source override / investment group when present;
-- otherwise posted journal account. Preserve historical category rows without
-- changing the journal itself. No source/journal amounts or statuses mutated.
-- Only the existing seven/five-column view APIs are preserved.
create or replace view public.ui_administration_category_chart_v1
with (security_invoker=true)
as
select a.brand_id,
  date_trunc('month',a.purchase_date::timestamptz)::date as period_month,
  coalesce(nullif(fa_override.name,''),nullif(fa_asset.name,''),nullif(fa.name,''),'Administrasi'::text) as category,
  count(*) as admin_rows,
  coalesce(sum(a.total_amount),0::numeric)::numeric(18,2) as amount
from public.ui_administration_purchase_v1 a
left join public.finance_journal_entries e
  on e.brand_id=a.brand_id and e.source_type='purchase_expense'
 and e.source_id=a.purchase_id and e.status<>'void'
left join public.finance_journal_lines l on l.entry_id=e.id and l.line_no=1
left join public.finance_accounts fa
  on fa.brand_id=a.brand_id and fa.code=l.account_code and fa.active
left join public.offline_purchase_history h on h.id=a.purchase_id and h.brand_id=a.brand_id
left join public.finance_accounts fa_override
  on fa_override.brand_id=a.brand_id and fa_override.code=nullif(h.raw_data->>'finance_account_code_override','')
 and fa_override.active and fa_override.account_type in ('ASSET','LIABILITY','EXPENSE','COGS')
left join public.finance_accounts fa_asset
  on fa_asset.brand_id=a.brand_id and fa_asset.code='1500'
 and coalesce(h.raw_data->>'analytics_group','')='Investasi'
 and fa_override.code is null and fa_asset.active
where a.purchase_date is not null
group by a.brand_id,date_trunc('month',a.purchase_date::timestamptz)::date,
  coalesce(nullif(fa_override.name,''),nullif(fa_asset.name,''),nullif(fa.name,''),'Administrasi'::text);

create or replace view public.ui_administration_overview_v1
with (security_invoker=true)
as
with source as (
  select a.brand_id,
    date_trunc('month',a.purchase_date::timestamptz)::date as period_month,
    a.purchase_id,a.total_amount,e.id as journal_id,
    coalesce(l.debit,0::numeric) as journal_debit,
    coalesce(nullif(fa_override.name,''),nullif(fa_asset.name,''),nullif(fa.name,''),'Administrasi'::text) as category
  from public.ui_administration_purchase_v1 a
  left join public.finance_journal_entries e
    on e.brand_id=a.brand_id and e.source_type='purchase_expense'
   and e.source_id=a.purchase_id and e.status<>'void'
  left join public.finance_journal_lines l on l.entry_id=e.id and l.line_no=1
  left join public.finance_accounts fa
    on fa.brand_id=a.brand_id and fa.code=l.account_code and fa.active
  left join public.offline_purchase_history h on h.id=a.purchase_id and h.brand_id=a.brand_id
  left join public.finance_accounts fa_override
    on fa_override.brand_id=a.brand_id and fa_override.code=nullif(h.raw_data->>'finance_account_code_override','')
   and fa_override.active and fa_override.account_type in ('ASSET','LIABILITY','EXPENSE','COGS')
  left join public.finance_accounts fa_asset
    on fa_asset.brand_id=a.brand_id and fa_asset.code='1500'
   and coalesce(h.raw_data->>'analytics_group','')='Investasi'
   and fa_override.code is null and fa_asset.active
  where a.purchase_date is not null
)
select brand_id,period_month,
  count(*) as admin_rows,
  coalesce(sum(total_amount),0::numeric)::numeric(18,2) as admin_amount,
  count(distinct category) as category_count,
  coalesce(bool_and(journal_id is not null and abs(total_amount-journal_debit)<0.01),false) as sync_ok
from source
group by brand_id,period_month;

grant select on public.ui_administration_category_chart_v1 to authenticated;
grant select on public.ui_administration_overview_v1 to authenticated;
comment on view public.ui_administration_overview_v1 is
  'Direct journal-line admin reconciliation; avoids expensive nested finance sync_status and Purchase bridge.';
