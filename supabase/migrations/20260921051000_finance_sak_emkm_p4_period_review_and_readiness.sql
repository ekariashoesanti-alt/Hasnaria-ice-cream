create table if not exists public.finance_period_reviews(
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  accounting_period_id uuid not null references public.accounting_periods(id) on delete cascade,
  review_type text not null check (review_type in ('accruals','prepaids','tax')),
  review_status text not null check (review_status in ('reviewed','not_applicable')),
  note text not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  unique(accounting_period_id,review_type)
);
create index if not exists finance_period_reviews_brand_idx on public.finance_period_reviews(brand_id,accounting_period_id,review_type);
alter table public.finance_period_reviews enable row level security;
drop policy if exists finance_period_reviews_read_same_brand on public.finance_period_reviews;
create policy finance_period_reviews_read_same_brand on public.finance_period_reviews for select to authenticated using ((select private.same_brand(brand_id)));
grant select on public.finance_period_reviews to authenticated;

create or replace function private.review_finance_period_item_v1(p_period_id uuid,p_review_type text,p_review_status text,p_note text)
returns public.finance_period_reviews
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid:=private.my_brand_id();
  v_period public.accounting_periods%rowtype;
  v_type text:=lower(btrim(coalesce(p_review_type,'')));
  v_status text:=lower(btrim(coalesce(p_review_status,'')));
  v_row public.finance_period_reviews%rowtype;
begin
  if v_brand is null or not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  if v_type not in ('accruals','prepaids','tax') then raise exception 'Unsupported period review type'; end if;
  if v_status not in ('reviewed','not_applicable') then raise exception 'Unsupported review status'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Review note is required'; end if;
  select * into v_period from public.accounting_periods where id=p_period_id for update;
  if not found or v_period.brand_id<>v_brand then raise exception 'Accounting period not found'; end if;
  if v_period.status<>'open' then raise exception 'Accounting period is closed'; end if;
  insert into public.finance_period_reviews(brand_id,accounting_period_id,review_type,review_status,note,reviewed_by,reviewed_at)
  values(v_brand,v_period.id,v_type,v_status,btrim(p_note),auth.uid(),now())
  on conflict(accounting_period_id,review_type) do update set review_status=excluded.review_status,note=excluded.note,reviewed_by=auth.uid(),reviewed_at=now()
  returning * into v_row;
  perform private.write_audit_log(v_brand,null,'finance_period_review',v_row.id,'reviewed',auth.uid(),null,to_jsonb(v_row),p_note,jsonb_build_object('review_type',v_type));
  return v_row;
end;
$$;
create or replace function public.review_finance_period_item_v1(p_period_id uuid,p_review_type text,p_review_status text,p_note text)
returns public.finance_period_reviews language sql security invoker set search_path='' as $$select private.review_finance_period_item_v1(p_period_id,p_review_type,p_review_status,p_note);$$;
grant execute on function public.review_finance_period_item_v1(uuid,text,text,text) to authenticated;
revoke all on function public.review_finance_period_item_v1(uuid,text,text,text) from anon;

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
    count(f.id) filter(where f.status='active' and f.available_for_use_date<=ap.period_end and f.depreciation_method in ('declining_balance','manual'))::bigint manual_depreciation_assets,
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

grant select on public.finance_p4_period_readiness_v1 to authenticated;

create or replace function public.get_finance_p4_workbench_v1(p_brand uuid,p_period date default null)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  v_brand uuid:=private.my_brand_id();
  v_period date;
  v_period_id uuid;
  v_result jsonb;
begin
  if v_brand is null then raise exception 'Authenticated brand required'; end if;
  if p_brand is distinct from v_brand then raise exception 'Brand access denied'; end if;
  v_period:=coalesce(date_trunc('month',p_period)::date,(select max(period_start) from public.accounting_periods where brand_id=v_brand));
  select id into v_period_id from public.accounting_periods where brand_id=v_brand and period_start=v_period;
  select jsonb_build_object(
    'period',v_period,
    'readiness',coalesce((select to_jsonb(r) from public.finance_p4_period_readiness_v1 r where r.accounting_period_id=v_period_id),'{}'::jsonb),
    'settings',coalesce((select to_jsonb(s) from public.finance_accounting_settings s where s.brand_id=v_brand),'{}'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.review_type) from public.finance_period_reviews r where r.brand_id=v_brand and r.accounting_period_id=v_period_id),'[]'::jsonb),
    'asset_candidates',coalesce((select jsonb_agg(to_jsonb(c) order by c.purchase_date,c.total_amount desc) from public.finance_asset_candidate_queue_v1 c where c.brand_id=v_brand and c.purchase_date<=((v_period+interval '1 month - 1 day')::date) and c.review_status<>'resolved'),'[]'::jsonb),
    'fixed_assets',coalesce((select jsonb_agg(to_jsonb(a) order by a.acquisition_date,a.asset_name) from public.finance_fixed_asset_book_v1 a where a.brand_id=v_brand),'[]'::jsonb),
    'adjustments',coalesce((select jsonb_agg(to_jsonb(a) order by a.entry_date,a.created_at) from public.finance_adjustments a where a.brand_id=v_brand and date_trunc('month',a.entry_date)::date=v_period),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function public.get_finance_p4_workbench_v1(uuid,date) to authenticated;
revoke all on function public.get_finance_p4_workbench_v1(uuid,date) from anon;
