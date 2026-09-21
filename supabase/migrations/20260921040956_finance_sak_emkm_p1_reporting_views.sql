begin;

insert into public.accounting_periods(brand_id,period_start,period_end,status)
select distinct e.brand_id,e.period_month,(e.period_month + interval '1 month - 1 day')::date,'open'
from public.finance_journal_entries e
where not exists (
  select 1 from public.accounting_periods ap
  where ap.brand_id=e.brand_id and ap.period_start=e.period_month
);

create unique index if not exists accounting_periods_brand_start_uq
  on public.accounting_periods(brand_id, period_start);

create or replace view public.finance_trial_balance_monthly_v1
with (security_invoker=true)
as
with months as (
  select distinct brand_id,period_month from public.finance_journal_entries where status<>'void'
), monthly as (
  select e.brand_id,e.period_month,l.account_code,
         sum(l.debit)::numeric(18,2) period_debit,
         sum(l.credit)::numeric(18,2) period_credit
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id
  where e.status<>'void'
  group by e.brand_id,e.period_month,l.account_code
), matrix as (
  select m.brand_id,m.period_month,a.code account_code,a.name account_name,a.account_type,
         coalesce(x.period_debit,0)::numeric(18,2) period_debit,
         coalesce(x.period_credit,0)::numeric(18,2) period_credit,
         case when a.account_type in ('ASSET','COGS','EXPENSE')
           then coalesce(x.period_debit,0)-coalesce(x.period_credit,0)
           else coalesce(x.period_credit,0)-coalesce(x.period_debit,0)
         end normal_movement
  from months m
  join public.finance_accounts a on a.brand_id=m.brand_id and a.active
  left join monthly x on x.brand_id=m.brand_id and x.period_month=m.period_month and x.account_code=a.code
), balances as (
  select *,
         sum(normal_movement) over(partition by brand_id,account_code order by period_month rows unbounded preceding) ending_balance
  from matrix
)
select brand_id,period_month,account_code,account_name,account_type,
       (ending_balance-normal_movement)::numeric(18,2) opening_balance,
       period_debit,period_credit,
       ending_balance::numeric(18,2) ending_balance
from balances;

create or replace view public.finance_income_statement_monthly_v1
with (security_invoker=true)
as
select tb.brand_id,tb.period_month,
       sum(tb.period_credit-tb.period_debit) filter(where tb.account_type='REVENUE' and tb.account_code='4000')::numeric(18,2) revenue_sales,
       coalesce(sum(tb.period_credit-tb.period_debit) filter(where tb.account_type='REVENUE' and tb.account_code<>'4000'),0)::numeric(18,2) other_income,
       coalesce(sum(tb.period_debit-tb.period_credit) filter(where tb.account_type='COGS'),0)::numeric(18,2) cogs,
       coalesce(sum(tb.period_debit-tb.period_credit) filter(where tb.account_type='EXPENSE' and tb.account_code not in ('6400','6500')),0)::numeric(18,2) operating_expense,
       coalesce(sum(tb.period_debit-tb.period_credit) filter(where tb.account_code='6400'),0)::numeric(18,2) finance_expense,
       coalesce(sum(tb.period_debit-tb.period_credit) filter(where tb.account_code='6500'),0)::numeric(18,2) tax_expense,
       (coalesce(sum(tb.period_credit-tb.period_debit) filter(where tb.account_type='REVENUE'),0)
        -coalesce(sum(tb.period_debit-tb.period_credit) filter(where tb.account_type='COGS'),0))::numeric(18,2) gross_profit,
       (coalesce(sum(tb.period_credit-tb.period_debit) filter(where tb.account_type='REVENUE'),0)
        -coalesce(sum(tb.period_debit-tb.period_credit) filter(where tb.account_type in ('COGS','EXPENSE') and tb.account_code<>'6500'),0))::numeric(18,2) profit_before_tax,
       (coalesce(sum(tb.period_credit-tb.period_debit) filter(where tb.account_type='REVENUE'),0)
        -coalesce(sum(tb.period_debit-tb.period_credit) filter(where tb.account_type in ('COGS','EXPENSE')),0))::numeric(18,2) profit_after_tax,
       coalesce(fr.cogs_coverage_pct,100)::numeric(8,2) cogs_coverage_pct,
       (coalesce(fr.cogs_coverage_pct,100)>=99.99) cogs_ready
from public.finance_trial_balance_monthly_v1 tb
left join public.finance_monthly_reconciliation_v1 fr
  on fr.brand_id=tb.brand_id and fr.period_month=tb.period_month
group by tb.brand_id,tb.period_month,fr.cogs_coverage_pct;

create or replace view public.finance_balance_sheet_monthly_v1
with (security_invoker=true)
as
with per_period as (
 select brand_id,period_month,
   coalesce(sum(ending_balance) filter(where account_type='ASSET'),0) total_assets,
   coalesce(sum(ending_balance) filter(where account_type='LIABILITY'),0) total_liabilities,
   coalesce(sum(ending_balance) filter(where account_type='EQUITY'),0) contributed_equity,
   coalesce(sum(ending_balance) filter(where account_type='REVENUE'),0)
    -coalesce(sum(ending_balance) filter(where account_type='COGS'),0)
    -coalesce(sum(ending_balance) filter(where account_type='EXPENSE'),0) accumulated_result
 from public.finance_trial_balance_monthly_v1
 group by brand_id,period_month
)
select brand_id,period_month,
       total_assets::numeric(18,2) total_assets,
       total_liabilities::numeric(18,2) total_liabilities,
       contributed_equity::numeric(18,2) contributed_equity,
       accumulated_result::numeric(18,2) retained_earnings_derived,
       (contributed_equity+accumulated_result)::numeric(18,2) total_equity,
       (total_liabilities+contributed_equity+accumulated_result)::numeric(18,2) liabilities_and_equity,
       (total_assets-total_liabilities-contributed_equity-accumulated_result)::numeric(18,2) balance_delta
from per_period;

create or replace view public.finance_close_readiness_v1
with (security_invoker=true)
as
with prov as (
  select brand_id,period_month,count(*) filter(where status='provisional') provisional_entries
  from public.finance_journal_entries where status<>'void'
  group by brand_id,period_month
), unclassified_purchase as (
  select brand_id,date_trunc('month',coalesce(purchase_date,source_period)::timestamp)::date period_month,
         count(*) filter(where coalesce(nullif(btrim(raw_data->>'analytics_group'),''),'')='') unclassified_purchase_rows,
         coalesce(sum(total_amount) filter(where coalesce(nullif(btrim(raw_data->>'analytics_group'),''),'')=''),0) unclassified_purchase_amount
  from public.offline_purchase_history
  group by brand_id,date_trunc('month',coalesce(purchase_date,source_period)::timestamp)::date
), jdelta as (
  select e.brand_id,e.period_month,abs(coalesce(sum(l.debit-l.credit),0)) journal_delta
  from public.finance_journal_entries e join public.finance_journal_lines l on l.entry_id=e.id
  where e.status<>'void'
  group by e.brand_id,e.period_month
)
select ap.id accounting_period_id,ap.brand_id,ap.period_start period_month,ap.period_end,ap.status period_status,
       coalesce(fr.cogs_coverage_pct,100)::numeric(8,2) cogs_coverage_pct,
       abs(coalesce(fr.tender_unclassified_delta,0))::numeric(18,2) tender_unclassified_delta,
       coalesce(p.provisional_entries,0) provisional_entries,
       coalesce(u.unclassified_purchase_rows,0) unclassified_purchase_rows,
       coalesce(u.unclassified_purchase_amount,0)::numeric(18,2) unclassified_purchase_amount,
       coalesce(j.journal_delta,0)::numeric(18,2) journal_delta,
       abs(coalesce(bs.balance_delta,0))::numeric(18,2) balance_delta,
       (coalesce(fr.cogs_coverage_pct,100)>=99.99
         and abs(coalesce(fr.tender_unclassified_delta,0))<0.01
         and coalesce(p.provisional_entries,0)=0
         and coalesce(u.unclassified_purchase_rows,0)=0
         and coalesce(j.journal_delta,0)<0.01
         and abs(coalesce(bs.balance_delta,0))<0.01) ready_to_close,
       concat_ws(' · ',
         case when coalesce(fr.cogs_coverage_pct,100)<99.99 then 'HPP belum lengkap' end,
         case when abs(coalesce(fr.tender_unclassified_delta,0))>=0.01 then 'Tender belum rekonsiliasi' end,
         case when coalesce(p.provisional_entries,0)>0 then coalesce(p.provisional_entries,0)::text||' jurnal provisional' end,
         case when coalesce(u.unclassified_purchase_rows,0)>0 then coalesce(u.unclassified_purchase_rows,0)::text||' pembelian belum diklasifikasi' end,
         case when coalesce(j.journal_delta,0)>=0.01 then 'Jurnal tidak seimbang' end,
         case when abs(coalesce(bs.balance_delta,0))>=0.01 then 'Posisi keuangan tidak seimbang' end
       ) blockers
from public.accounting_periods ap
left join public.finance_monthly_reconciliation_v1 fr on fr.brand_id=ap.brand_id and fr.period_month=ap.period_start
left join prov p on p.brand_id=ap.brand_id and p.period_month=ap.period_start
left join unclassified_purchase u on u.brand_id=ap.brand_id and u.period_month=ap.period_start
left join jdelta j on j.brand_id=ap.brand_id and j.period_month=ap.period_start
left join public.finance_balance_sheet_monthly_v1 bs on bs.brand_id=ap.brand_id and bs.period_month=ap.period_start;

create or replace view public.finance_notes_monthly_v1
with (security_invoker=true)
as
select r.brand_id,r.period_month,
       jsonb_build_object(
         'framework_label','Format mengacu SAK EMKM - internal, belum pernyataan kepatuhan',
         'basis','Biaya historis dan basis akrual',
         'currency','IDR','comparative_required',true,
         'hpp_status',case when r.cogs_coverage_pct>=99.99 then 'lengkap' else 'belum lengkap' end,
         'cogs_coverage_pct',r.cogs_coverage_pct,
         'provisional_entries',r.provisional_entries,
         'unclassified_purchase_rows',r.unclassified_purchase_rows,
         'unclassified_purchase_amount',r.unclassified_purchase_amount,
         'blockers',r.blockers
       ) notes
from public.finance_close_readiness_v1 r;

create or replace function public.get_finance_reporting_pack_v1(p_brand uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if not private.same_brand(p_brand) then raise exception 'Brand is outside your access'; end if;
  return jsonb_build_object(
    'periods',coalesce((select jsonb_agg(to_jsonb(r) order by r.period_month) from public.finance_close_readiness_v1 r where r.brand_id=p_brand),'[]'::jsonb),
    'income',coalesce((select jsonb_agg(to_jsonb(i) order by i.period_month) from public.finance_income_statement_monthly_v1 i where i.brand_id=p_brand),'[]'::jsonb),
    'position',coalesce((select jsonb_agg(to_jsonb(b) order by b.period_month) from public.finance_balance_sheet_monthly_v1 b where b.brand_id=p_brand),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.period_month) from public.finance_notes_monthly_v1 n where n.brand_id=p_brand),'[]'::jsonb)
  );
end;$$;
revoke all on function public.get_finance_reporting_pack_v1(uuid) from public;
grant execute on function public.get_finance_reporting_pack_v1(uuid) to authenticated;
grant select on public.finance_trial_balance_monthly_v1, public.finance_income_statement_monthly_v1, public.finance_balance_sheet_monthly_v1, public.finance_close_readiness_v1, public.finance_notes_monthly_v1 to authenticated;

commit;
