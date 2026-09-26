-- Balance the Purchase expense reporting overlay by posting the matching
-- cash/bank/payable/provisional counter credit for every Purchase amount.

create or replace view public.finance_trial_balance_monthly_v1
with (security_invoker=true)
as
with months as (
  select distinct e.brand_id,e.period_month
  from public.finance_journal_entries e
  where e.status<>'void'
  union
  select distinct p.brand_id,p.period_month
  from public.finance_purchase_expense_category_v1 p
), journal_monthly as (
  select e.brand_id,e.period_month,l.account_code,
         sum(l.debit)::numeric(18,2) as period_debit,
         sum(l.credit)::numeric(18,2) as period_credit
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id
  where e.status<>'void'
    and e.source_type not in ('purchase','purchase_expense','sale_cogs')
  group by e.brand_id,e.period_month,l.account_code
), purchase_expense_monthly as (
  select p.brand_id,p.period_month,
         case p.expense_category
           when 'Beban Administrasi' then '6100'
           when 'Beban Pemeliharaan' then '6110'
           when 'Beban Bahan Baku' then '6120'
           when 'Beban Kepegawaian' then '6200'
           else '6000'
         end as account_code,
         sum(p.total_amount)::numeric(18,2) as period_debit,
         0::numeric(18,2) as period_credit
  from public.finance_purchase_expense_category_v1 p
  group by p.brand_id,p.period_month,
         case p.expense_category
           when 'Beban Administrasi' then '6100'
           when 'Beban Pemeliharaan' then '6110'
           when 'Beban Bahan Baku' then '6120'
           when 'Beban Kepegawaian' then '6200'
           else '6000'
         end
), purchase_counter_monthly as (
  select p.brand_id,p.period_month,
         case
           when upper(btrim(coalesce(p.payment_method,''))) in ('TUNAI','CASH') then '1000'
           when upper(btrim(coalesce(p.payment_method,''))) in ('REK MANDIRI','TRANSFER','TF','QRIS') then '1100'
           when upper(coalesce(p.payment_method,'')) like '%UTANG%'
             or upper(coalesce(p.payment_method,'')) like '%PAYLATER%' then '2000'
           else '2190'
         end as account_code,
         0::numeric(18,2) as period_debit,
         sum(p.total_amount)::numeric(18,2) as period_credit
  from public.finance_purchase_expense_category_v1 p
  group by p.brand_id,p.period_month,
         case
           when upper(btrim(coalesce(p.payment_method,''))) in ('TUNAI','CASH') then '1000'
           when upper(btrim(coalesce(p.payment_method,''))) in ('REK MANDIRI','TRANSFER','TF','QRIS') then '1100'
           when upper(coalesce(p.payment_method,'')) like '%UTANG%'
             or upper(coalesce(p.payment_method,'')) like '%PAYLATER%' then '2000'
           else '2190'
         end
), monthly as (
  select q.brand_id,q.period_month,q.account_code,
         sum(q.period_debit)::numeric(18,2) as period_debit,
         sum(q.period_credit)::numeric(18,2) as period_credit
  from (
    select * from journal_monthly
    union all
    select * from purchase_expense_monthly
    union all
    select * from purchase_counter_monthly
  ) q
  group by q.brand_id,q.period_month,q.account_code
), matrix as (
  select m.brand_id,m.period_month,a.code as account_code,a.name as account_name,a.account_type,
         coalesce(x.period_debit,0)::numeric(18,2) as period_debit,
         coalesce(x.period_credit,0)::numeric(18,2) as period_credit,
         case when a.account_type in ('ASSET','COGS','EXPENSE')
              then coalesce(x.period_debit,0)-coalesce(x.period_credit,0)
              else coalesce(x.period_credit,0)-coalesce(x.period_debit,0) end as normal_movement
  from months m
  join public.finance_accounts a on a.brand_id=m.brand_id and a.active
  left join monthly x on x.brand_id=m.brand_id and x.period_month=m.period_month and x.account_code=a.code
), balances as (
  select matrix.*,
         sum(matrix.normal_movement) over(
           partition by matrix.brand_id,matrix.account_code
           order by matrix.period_month rows unbounded preceding
         ) as ending_balance
  from matrix
)
select brand_id,period_month,account_code,account_name,account_type,
       (ending_balance-normal_movement)::numeric(18,2) as opening_balance,
       period_debit,period_credit,ending_balance::numeric(18,2) as ending_balance
from balances;

grant select on public.finance_trial_balance_monthly_v1 to authenticated,service_role;
