create unique index if not exists finance_adjustments_one_posted_opening_per_brand
  on public.finance_adjustments(brand_id)
  where adjustment_type='opening_balance' and status='posted';

create or replace view public.finance_p4_period_readiness_v1
with (security_invoker=true) as
with settings as (
  select brand_id,opening_balance_mode,opening_balance_date from public.finance_accounting_settings
), review_roll as (
  select brand_id,accounting_period_id,
    count(*) filter(where review_type='accruals') as accrual_review_count,
    count(*) filter(where review_type='prepaids') as prepaid_review_count,
    count(*) filter(where review_type='tax') as tax_review_count
  from public.finance_period_reviews group by brand_id,accounting_period_id
), draft_adj as (
  select brand_id,date_trunc('month',entry_date)::date period_month,count(*)::bigint draft_adjustments
  from public.finance_adjustments where status='draft' group by brand_id,date_trunc('month',entry_date)::date
), dep_posted as (
  select a.brand_id,a.source_asset_id,
    coalesce(sum(l.credit-l.debit) filter(where l.account_code='1590'),0)::numeric accumulated_depreciation,
    max(a.entry_date) last_depreciation_date
  from public.finance_adjustments a join public.finance_adjustment_lines l on l.adjustment_id=a.id
  where a.adjustment_type='depreciation' and a.status='posted'
  group by a.brand_id,a.source_asset_id
), asset_eval as (
  select ap.id accounting_period_id,ap.brand_id,
    count(f.id) filter(where f.status='draft' and f.acquisition_date<=ap.period_end)::bigint draft_assets,
    count(f.id) filter(
      where f.status='active'
        and f.available_for_use_date<=ap.period_end
        and f.depreciation_method in ('declining_balance','manual')
        and not exists(
          select 1 from public.finance_adjustments pa
          where pa.brand_id=f.brand_id
            and pa.source_asset_id=f.id
            and pa.adjustment_type='depreciation'
            and pa.status='posted'
            and date_trunc('month',pa.entry_date)::date=ap.period_start
        )
    )::bigint manual_depreciation_assets,
    count(f.id) filter(
      where f.status='active' and f.available_for_use_date<=ap.period_end and f.depreciation_method='straight_line' and f.depreciation_convention in ('full_month','next_month')
        and greatest(
          least(f.acquisition_cost,
            round((f.acquisition_cost/f.useful_life_months) * greatest(least(
              (extract(year from age(ap.period_start,date_trunc('month',f.available_for_use_date)))::integer*12 + extract(month from age(ap.period_start,date_trunc('month',f.available_for_use_date)))::integer)
              + case when f.depreciation_convention='full_month' then 1 else 0 end,
              f.useful_life_months),0),2)
          ) - coalesce(dp.accumulated_depreciation,0),0
        ) >= 0.01
    )::bigint as depreciation_due_assets
  from public.accounting_periods ap
  left join public.finance_fixed_assets f on f.brand_id=ap.brand_id
  left join dep_posted dp on dp.brand_id=f.brand_id and dp.source_asset_id=f.id
  group by ap.id,ap.brand_id
), candidate_eval as (
  select ap.id accounting_period_id,ap.brand_id,
    count(c.purchase_id) filter(where c.purchase_date<=ap.period_end and c.review_status='unreviewed')::bigint unreviewed_investment_candidates
  from public.accounting_periods ap
  left join public.finance_asset_candidate_queue_v1 c on c.brand_id=ap.brand_id
  group by ap.id,ap.brand_id
)
select
  ap.id accounting_period_id,ap.brand_id,ap.period_start period_month,ap.period_end,
  coalesce(s.opening_balance_mode,'unconfirmed') opening_balance_mode,s.opening_balance_date,
  coalesce(rr.accrual_review_count,0)>0 accruals_reviewed,
  coalesce(rr.prepaid_review_count,0)>0 prepaids_reviewed,
  coalesce(rr.tax_review_count,0)>0 tax_reviewed,
  coalesce(da.draft_adjustments,0)::bigint draft_adjustments,
  coalesce(ae.draft_assets,0)::bigint draft_assets,
  coalesce(ae.depreciation_due_assets,0)::bigint depreciation_due_assets,
  coalesce(ae.manual_depreciation_assets,0)::bigint manual_depreciation_assets,
  coalesce(ce.unreviewed_investment_candidates,0)::bigint unreviewed_investment_candidates,
  (
    coalesce(s.opening_balance_mode,'unconfirmed')<>'unconfirmed'
    and coalesce(rr.accrual_review_count,0)>0
    and coalesce(rr.prepaid_review_count,0)>0
    and coalesce(rr.tax_review_count,0)>0
    and coalesce(da.draft_adjustments,0)=0
    and coalesce(ae.draft_assets,0)=0
    and coalesce(ae.depreciation_due_assets,0)=0
    and coalesce(ae.manual_depreciation_assets,0)=0
    and coalesce(ce.unreviewed_investment_candidates,0)=0
  ) as p4_ready,
  concat_ws(' · ',
    case when coalesce(s.opening_balance_mode,'unconfirmed')='unconfirmed' then 'Saldo awal belum dikonfirmasi' end,
    case when coalesce(rr.accrual_review_count,0)=0 then 'Review akrual belum selesai' end,
    case when coalesce(rr.prepaid_review_count,0)=0 then 'Review beban dibayar di muka belum selesai' end,
    case when coalesce(rr.tax_review_count,0)=0 then 'Review pajak belum selesai' end,
    case when coalesce(da.draft_adjustments,0)>0 then coalesce(da.draft_adjustments,0)::text||' jurnal penyesuaian masih draft' end,
    case when coalesce(ce.unreviewed_investment_candidates,0)>0 then coalesce(ce.unreviewed_investment_candidates,0)::text||' pembelian investasi belum ditinjau' end,
    case when coalesce(ae.draft_assets,0)>0 then coalesce(ae.draft_assets,0)::text||' aset tetap masih draft' end,
    case when coalesce(ae.depreciation_due_assets,0)>0 then coalesce(ae.depreciation_due_assets,0)::text||' aset perlu posting penyusutan' end,
    case when coalesce(ae.manual_depreciation_assets,0)>0 then coalesce(ae.manual_depreciation_assets,0)::text||' aset perlu review penyusutan manual' end
  ) as p4_blockers
from public.accounting_periods ap
left join settings s on s.brand_id=ap.brand_id
left join review_roll rr on rr.brand_id=ap.brand_id and rr.accounting_period_id=ap.id
left join draft_adj da on da.brand_id=ap.brand_id and da.period_month=ap.period_start
left join asset_eval ae on ae.accounting_period_id=ap.id
left join candidate_eval ce on ce.accounting_period_id=ap.id;
