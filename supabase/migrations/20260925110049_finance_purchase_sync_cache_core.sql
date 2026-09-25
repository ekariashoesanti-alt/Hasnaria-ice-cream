create table if not exists public.finance_purchase_monthly_cache (
  brand_id uuid not null references public.brands(id),
  period_month date not null,
  inventory_rows bigint not null default 0,
  inventory_purchase_amount numeric(18,2) not null default 0,
  expense_rows bigint not null default 0,
  canonical_purchase_expense numeric(18,2) not null default 0,
  purchase_review_rows bigint not null default 0,
  purchase_review_amount numeric(18,2) not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key (brand_id,period_month)
);

alter table public.finance_purchase_monthly_cache enable row level security;
drop policy if exists finance_purchase_monthly_cache_select on public.finance_purchase_monthly_cache;
create policy finance_purchase_monthly_cache_select on public.finance_purchase_monthly_cache
for select to authenticated
using (private.same_brand(brand_id) and private.has_capability('finance.read'));
grant select on public.finance_purchase_monthly_cache to authenticated;

create or replace function private.refresh_finance_purchase_monthly_cache_v1(p_brand uuid,p_from date,p_to date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_rows integer:=0; v_from date; v_to date;
begin
  if p_brand is null or p_from is null or p_to is null or p_from>p_to then
    raise exception 'Invalid Purchase Finance cache range';
  end if;
  if not private.same_brand(p_brand)
     or not (private.has_capability('settings.manage') or private.can_import_module('purchasing')) then
    raise exception 'Purchase Finance cache refresh permission required';
  end if;
  v_from:=date_trunc('month',p_from::timestamp)::date;
  v_to:=(date_trunc('month',p_to::timestamp)+interval '1 month - 1 day')::date;

  delete from public.finance_purchase_monthly_cache
  where brand_id=p_brand and period_month between v_from and date_trunc('month',v_to::timestamp)::date;

  insert into public.finance_purchase_monthly_cache(
    brand_id,period_month,inventory_rows,inventory_purchase_amount,
    expense_rows,canonical_purchase_expense,purchase_review_rows,purchase_review_amount,refreshed_at
  )
  select
    u.brand_id,
    date_trunc('month',u.effective_date::timestamp)::date,
    count(*) filter(where u.accounting_treatment='inventory' and u.finance_status in ('posted','provisional') and coalesce(u.total_amount,0)>0),
    coalesce(sum(u.total_amount) filter(where u.accounting_treatment='inventory' and u.finance_status in ('posted','provisional') and coalesce(u.total_amount,0)>0),0),
    count(*) filter(where u.accounting_treatment='expense' and u.finance_status in ('posted','provisional') and coalesce(u.total_amount,0)>0),
    coalesce(sum(u.total_amount) filter(where u.accounting_treatment='expense' and u.finance_status in ('posted','provisional') and coalesce(u.total_amount,0)>0),0),
    count(*) filter(where u.finance_status='review_required'),
    coalesce(sum(u.total_amount) filter(where u.finance_status='review_required'),0),
    now()
  from public.ui_purchase_accounting_v1 u
  where u.brand_id=p_brand and u.effective_date between v_from and v_to
  group by u.brand_id,date_trunc('month',u.effective_date::timestamp)::date;
  get diagnostics v_rows=row_count;
  return jsonb_build_object('brand_id',p_brand,'from',v_from,'to',v_to,'periods',v_rows,'refreshed_at',now());
end;
$$;
revoke all on function private.refresh_finance_purchase_monthly_cache_v1(uuid,date,date) from public;
grant execute on function private.refresh_finance_purchase_monthly_cache_v1(uuid,date,date) to authenticated;

create or replace view public.finance_purchase_sync_status_v1
with (security_invoker=true)
as
with j as (
  select e.brand_id,e.period_month,
    count(distinct e.id) filter(where e.source_type='purchase')::bigint as journal_inventory_rows,
    coalesce(sum(l.debit-l.credit) filter(where e.source_type='purchase' and l.account_code='1300'),0)::numeric(18,2) as journal_inventory_amount,
    count(distinct e.id) filter(where e.source_type='purchase_expense')::bigint as journal_expense_rows,
    coalesce(sum(l.debit-l.credit) filter(where e.source_type='purchase_expense' and a.account_type='EXPENSE'),0)::numeric(18,2) as journal_expense_amount
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id
  join public.finance_accounts a on a.brand_id=e.brand_id and a.code=l.account_code
  where e.status<>'void' and e.source_type in ('purchase','purchase_expense')
  group by e.brand_id,e.period_month
)
select c.brand_id,c.period_month,c.inventory_rows,c.inventory_purchase_amount,
       c.expense_rows,c.canonical_purchase_expense,c.purchase_review_rows,c.purchase_review_amount,
       coalesce(j.journal_inventory_rows,0) as journal_inventory_rows,
       coalesce(j.journal_inventory_amount,0)::numeric(18,2) as journal_inventory_amount,
       coalesce(j.journal_expense_rows,0) as journal_expense_rows,
       coalesce(j.journal_expense_amount,0)::numeric(18,2) as journal_expense_amount,
       ((c.inventory_rows<>coalesce(j.journal_inventory_rows,0))
        or abs(c.inventory_purchase_amount-coalesce(j.journal_inventory_amount,0))>=0.01
        or c.expense_rows<>coalesce(j.journal_expense_rows,0)
        or abs(c.canonical_purchase_expense-coalesce(j.journal_expense_amount,0))>=0.01) as sync_required,
       c.refreshed_at
from public.finance_purchase_monthly_cache c
left join j on j.brand_id=c.brand_id and j.period_month=c.period_month;
grant select on public.finance_purchase_sync_status_v1 to authenticated;

create or replace view public.finance_income_statement_provisional_v1
with (security_invoker=true)
as
with jpe as (
  select e.brand_id,e.period_month,
    coalesce(sum(l.debit-l.credit) filter(where a.account_type='EXPENSE' and l.account_code not in ('6400','6500')),0)::numeric(18,2) as posted_purchase_expense
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id
  join public.finance_accounts a on a.brand_id=e.brand_id and a.code=l.account_code
  where e.status<>'void' and e.source_type='purchase_expense'
  group by e.brand_id,e.period_month
), months as (
  select brand_id,period_month from public.finance_income_statement_monthly_v1
  union
  select brand_id,period_month from public.finance_purchase_monthly_cache
), c as (
  select m.brand_id,m.period_month,
    coalesce(f.revenue_sales,0)::numeric(18,2) revenue_sales,
    coalesce(f.other_income,0)::numeric(18,2) other_income,
    coalesce(f.cogs,0)::numeric(18,2) verified_cogs,
    coalesce(f.cogs_coverage_pct,100)::numeric(8,2) cogs_coverage_pct,
    coalesce(p.inventory_purchase_amount,0)::numeric(18,2) inventory_purchase_amount,
    coalesce(f.operating_expense,0)::numeric(18,2) journal_operating_expense,
    coalesce(j.posted_purchase_expense,0)::numeric(18,2) posted_purchase_expense,
    coalesce(p.canonical_purchase_expense,0)::numeric(18,2) canonical_purchase_expense,
    coalesce(f.finance_expense,0)::numeric(18,2) finance_expense,
    coalesce(f.tax_expense,0)::numeric(18,2) tax_expense,
    coalesce(p.purchase_review_rows,0)::bigint purchase_review_rows,
    coalesce(p.purchase_review_amount,0)::numeric(18,2) purchase_review_amount,
    coalesce(s.sales_rows,0)::bigint sales_rows
  from months m
  left join public.finance_income_statement_monthly_v1 f using(brand_id,period_month)
  left join public.finance_purchase_monthly_cache p using(brand_id,period_month)
  left join jpe j using(brand_id,period_month)
  left join public.finance_monthly_reconciliation_v1 s using(brand_id,period_month)
), x as (
  select c.*,
    (journal_operating_expense-posted_purchase_expense+canonical_purchase_expense)::numeric(18,2) operating_expense_adjusted,
    case when sales_rows>0 and cogs_coverage_pct<99.99 then inventory_purchase_amount else verified_cogs end::numeric(18,2) cogs_display,
    case when sales_rows>0 and cogs_coverage_pct<99.99 then 'purchase_basis_provisional'::text else 'verified_hpp'::text end pnl_basis
  from c
)
select brand_id,period_month,revenue_sales,other_income,verified_cogs,cogs_coverage_pct,
       inventory_purchase_amount,cogs_display,journal_operating_expense,posted_purchase_expense,
       canonical_purchase_expense,operating_expense_adjusted,finance_expense,tax_expense,
       (revenue_sales+other_income-cogs_display)::numeric(18,2) gross_profit_display,
       (revenue_sales+other_income-cogs_display-operating_expense_adjusted-finance_expense)::numeric(18,2) profit_before_tax_display,
       (revenue_sales+other_income-cogs_display-operating_expense_adjusted-finance_expense-tax_expense)::numeric(18,2) profit_after_tax_display,
       purchase_review_rows,purchase_review_amount,pnl_basis,(pnl_basis='verified_hpp') as is_final_hpp,
       case when pnl_basis='verified_hpp' then 'HPP terverifikasi dari jurnal.'
            else 'HPP sementara memakai pembelian persediaan periode; otomatis diganti ketika HPP resep terverifikasi 100%.' end basis_note
from x;
grant select on public.finance_income_statement_provisional_v1 to authenticated;

create or replace function public.sync_purchase_finance_all_open_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid:=private.my_brand_id();
  v_period record;
  v_status record;
  v_result jsonb:='[]'::jsonb;
  v_one jsonb;
  v_count integer:=0;
begin
  if v_brand is null or not private.same_brand(v_brand) or not private.has_capability('settings.manage') then
    raise exception 'Owner permission required';
  end if;

  for v_period in
    select ap.period_start,ap.period_end
    from public.accounting_periods ap
    where ap.brand_id=v_brand and ap.status='open'
      and exists(
        select 1 from public.offline_purchase_history p
        where p.brand_id=v_brand
          and coalesce(p.purchase_date,p.source_period) between ap.period_start and ap.period_end
      )
    order by ap.period_start
  loop
    perform private.refresh_finance_purchase_monthly_cache_v1(v_brand,v_period.period_start,v_period.period_end);
    select * into v_status
    from public.finance_purchase_sync_status_v1 s
    where s.brand_id=v_brand and s.period_month=v_period.period_start;
    if found and v_status.sync_required then
      v_one:=public.rebuild_finance_journal_v1(v_period.period_start,v_period.period_end);
      v_result:=v_result||jsonb_build_array(jsonb_build_object('period',v_period.period_start,'result',v_one));
      v_count:=v_count+1;
    end if;
  end loop;

  return jsonb_build_object('brand_id',v_brand,'synced_periods',v_count,'details',v_result,'refreshed_at',now());
end;
$$;
revoke all on function public.sync_purchase_finance_all_open_v1() from public;
grant execute on function public.sync_purchase_finance_all_open_v1() to authenticated;
