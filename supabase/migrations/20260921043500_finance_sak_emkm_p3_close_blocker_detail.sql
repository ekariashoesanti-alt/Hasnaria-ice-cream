create or replace view public.finance_close_readiness_v1 as
with prov as (
  select brand_id,period_month,count(*) filter(where status='provisional') as provisional_entries
  from public.finance_journal_entries
  where status<>'void'
  group by brand_id,period_month
), unclassified_purchase as (
  select brand_id,
         date_trunc('month',coalesce(purchase_date,source_period))::date as period_month,
         count(*) filter(where coalesce(nullif(btrim(raw_data->>'analytics_group'),''),'')='') as unclassified_purchase_rows,
         coalesce(sum(total_amount) filter(where coalesce(nullif(btrim(raw_data->>'analytics_group'),''),'')=''),0) as unclassified_purchase_amount
  from public.offline_purchase_history
  group by brand_id,date_trunc('month',coalesce(purchase_date,source_period))::date
), jdelta as (
  select e.brand_id,e.period_month,abs(coalesce(sum(l.debit-l.credit),0)) as journal_delta
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id
  where e.status<>'void'
  group by e.brand_id,e.period_month
), hpp as (
  select
    brand_id,period_month,
    count(*) filter(where blocker_reason='missing_recipe')::bigint as missing_recipe_products,
    count(*) filter(where blocker_reason='recipe_unverified')::bigint as recipe_unverified_products,
    count(*) filter(where blocker_reason='missing_component_cost')::bigint as missing_component_cost_products,
    count(*) filter(where blocker_reason='missing_product_mapping')::bigint as unmapped_products,
    coalesce(sum(uncovered_units),0)::numeric as uncovered_units,
    coalesce(sum(uncovered_sales_value),0)::numeric as uncovered_sales_value
  from public.finance_hpp_blocker_queue_v1
  group by brand_id,period_month
)
select
  ap.id as accounting_period_id,
  ap.brand_id,
  ap.period_start as period_month,
  ap.period_end,
  ap.status as period_status,
  coalesce(fr.cogs_coverage_pct,100)::numeric(8,2) as cogs_coverage_pct,
  abs(coalesce(fr.tender_unclassified_delta,0))::numeric(18,2) as tender_unclassified_delta,
  coalesce(p.provisional_entries,0)::bigint as provisional_entries,
  coalesce(u.unclassified_purchase_rows,0)::bigint as unclassified_purchase_rows,
  coalesce(u.unclassified_purchase_amount,0)::numeric(18,2) as unclassified_purchase_amount,
  coalesce(j.journal_delta,0)::numeric(18,2) as journal_delta,
  abs(coalesce(bs.balance_delta,0))::numeric(18,2) as balance_delta,
  (
    coalesce(fr.cogs_coverage_pct,100)>=99.99
    and abs(coalesce(fr.tender_unclassified_delta,0))<0.01
    and coalesce(p.provisional_entries,0)=0
    and coalesce(u.unclassified_purchase_rows,0)=0
    and coalesce(j.journal_delta,0)<0.01
    and abs(coalesce(bs.balance_delta,0))<0.01
  ) as ready_to_close,
  concat_ws(' · ',
    case when coalesce(fr.cogs_coverage_pct,100)<99.99 then
      'HPP '||trim(to_char(coalesce(fr.cogs_coverage_pct,0),'FM990D00'))||'%'
      ||case when coalesce(hpp.missing_recipe_products,0)>0 then ' · '||hpp.missing_recipe_products::text||' resep belum ada' else '' end
      ||case when coalesce(hpp.recipe_unverified_products,0)>0 then ' · '||hpp.recipe_unverified_products::text||' resep belum diverifikasi' else '' end
      ||case when coalesce(hpp.missing_component_cost_products,0)>0 then ' · '||hpp.missing_component_cost_products::text||' produk kekurangan biaya komponen' else '' end
      ||case when coalesce(hpp.unmapped_products,0)>0 then ' · '||hpp.unmapped_products::text||' mapping produk belum ada' else '' end
      else null end,
    case when abs(coalesce(fr.tender_unclassified_delta,0))>=0.01 then 'Tender belum rekonsiliasi' else null end,
    case when coalesce(p.provisional_entries,0)>0 then coalesce(p.provisional_entries,0)::text||' jurnal provisional' else null end,
    case when coalesce(u.unclassified_purchase_rows,0)>0 then coalesce(u.unclassified_purchase_rows,0)::text||' pembelian belum diklasifikasi' else null end,
    case when coalesce(j.journal_delta,0)>=0.01 then 'Jurnal tidak seimbang' else null end,
    case when abs(coalesce(bs.balance_delta,0))>=0.01 then 'Posisi keuangan tidak seimbang' else null end
  ) as blockers,
  coalesce(hpp.missing_recipe_products,0)::bigint as hpp_missing_recipe_products,
  coalesce(hpp.recipe_unverified_products,0)::bigint as hpp_recipe_unverified_products,
  coalesce(hpp.missing_component_cost_products,0)::bigint as hpp_missing_component_cost_products,
  coalesce(hpp.unmapped_products,0)::bigint as hpp_unmapped_products,
  coalesce(hpp.uncovered_units,0)::numeric as hpp_uncovered_units,
  coalesce(hpp.uncovered_sales_value,0)::numeric(18,2) as hpp_uncovered_sales_value
from public.accounting_periods ap
left join public.finance_monthly_reconciliation_v1 fr on fr.brand_id=ap.brand_id and fr.period_month=ap.period_start
left join prov p on p.brand_id=ap.brand_id and p.period_month=ap.period_start
left join unclassified_purchase u on u.brand_id=ap.brand_id and u.period_month=ap.period_start
left join jdelta j on j.brand_id=ap.brand_id and j.period_month=ap.period_start
left join public.finance_balance_sheet_monthly_v1 bs on bs.brand_id=ap.brand_id and bs.period_month=ap.period_start
left join hpp on hpp.brand_id=ap.brand_id and hpp.period_month=ap.period_start;
