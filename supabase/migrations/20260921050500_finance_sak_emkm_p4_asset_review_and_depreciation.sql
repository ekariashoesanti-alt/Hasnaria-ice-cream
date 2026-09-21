create or replace view public.finance_asset_candidate_queue_v1
with (security_invoker=true) as
select
  p.brand_id,
  p.id as purchase_id,
  coalesce(p.purchase_date,p.source_period) as purchase_date,
  p.item_name,
  p.total_amount,
  p.payment_method,
  p.raw_data->>'analytics_group' as analytics_group,
  r.decision,
  r.target_account_code,
  r.reason as resolution_reason,
  r.resolved_at,
  r.adjustment_id,
  r.fixed_asset_id,
  a.status as fixed_asset_status,
  case
    when r.purchase_id is null then 'unreviewed'
    when r.decision='fixed_asset' and (a.id is null or a.status='draft') then 'asset_setup_required'
    when r.decision='expense' and r.adjustment_id is null then 'reclass_required'
    else 'resolved'
  end as review_status
from public.offline_purchase_history p
left join public.finance_asset_candidate_resolutions r on r.purchase_id=p.id and r.brand_id=p.brand_id
left join public.finance_fixed_assets a on a.id=r.fixed_asset_id and a.brand_id=p.brand_id
where coalesce(p.total_amount,0)>0 and coalesce(p.raw_data->>'analytics_group','')='Investasi';

create or replace view public.finance_fixed_asset_book_v1
with (security_invoker=true) as
with dep as (
  select a.source_asset_id,
         coalesce(sum(l.credit-l.debit) filter(where l.account_code='1590'),0)::numeric as accumulated_depreciation,
         max(a.entry_date) filter(where a.adjustment_type='depreciation' and a.status='posted') as last_depreciation_date
  from public.finance_adjustments a
  join public.finance_adjustment_lines l on l.adjustment_id=a.id
  where a.adjustment_type='depreciation' and a.status='posted'
  group by a.source_asset_id
)
select
  f.*,
  coalesce(d.accumulated_depreciation,0)::numeric(18,2) as accumulated_depreciation,
  greatest(f.acquisition_cost-coalesce(d.accumulated_depreciation,0),0)::numeric(18,2) as carrying_amount,
  d.last_depreciation_date
from public.finance_fixed_assets f
left join dep d on d.source_asset_id=f.id;

create or replace function private.finance_fixed_asset_depreciation_proposal_v1(p_asset_id uuid,p_period date)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_brand uuid:=private.my_brand_id();
  v_asset public.finance_fixed_asset_book_v1%rowtype;
  v_period date:=date_trunc('month',p_period)::date;
  v_start date;
  v_month_diff integer;
  v_eligible integer;
  v_monthly numeric;
  v_expected numeric;
  v_due numeric;
begin
  if v_brand is null then raise exception 'Authenticated brand required'; end if;
  select * into v_asset from public.finance_fixed_asset_book_v1 where id=p_asset_id and brand_id=v_brand;
  if not found then raise exception 'Fixed asset not found'; end if;
  if v_asset.status<>'active' then return jsonb_build_object('asset_id',p_asset_id,'period',v_period,'status','asset_not_active','proposal_amount',null); end if;
  if v_asset.available_for_use_date is null or v_asset.useful_life_months is null or v_asset.depreciation_method is null or v_asset.depreciation_convention is null then
    return jsonb_build_object('asset_id',p_asset_id,'period',v_period,'status','policy_incomplete','proposal_amount',null);
  end if;
  if v_asset.depreciation_method<>'straight_line' or v_asset.depreciation_convention='manual' then
    return jsonb_build_object('asset_id',p_asset_id,'period',v_period,'status','manual_calculation_required','proposal_amount',null,'method',v_asset.depreciation_method,'convention',v_asset.depreciation_convention);
  end if;
  v_start:=date_trunc('month',v_asset.available_for_use_date)::date;
  v_month_diff:=(extract(year from age(v_period,v_start))::integer*12 + extract(month from age(v_period,v_start))::integer);
  v_eligible:=case when v_asset.depreciation_convention='full_month' then v_month_diff+1 else v_month_diff end;
  v_eligible:=greatest(least(v_eligible,v_asset.useful_life_months),0);
  v_monthly:=v_asset.acquisition_cost/v_asset.useful_life_months;
  v_expected:=least(v_asset.acquisition_cost,round(v_monthly*v_eligible,2));
  v_due:=greatest(v_expected-v_asset.accumulated_depreciation,0);
  return jsonb_build_object(
    'asset_id',p_asset_id,'asset_name',v_asset.asset_name,'period',v_period,'status',case when v_due>0 then 'due' else 'up_to_date' end,
    'method',v_asset.depreciation_method,'convention',v_asset.depreciation_convention,'monthly_amount',round(v_monthly,2),
    'eligible_months',v_eligible,'expected_accumulated',v_expected,'posted_accumulated',v_asset.accumulated_depreciation,'proposal_amount',round(v_due,2),'carrying_amount',v_asset.carrying_amount
  );
end;
$$;

create or replace function public.get_finance_fixed_asset_depreciation_proposal_v1(p_asset_id uuid,p_period date)
returns jsonb language sql security invoker set search_path='' as $$select private.finance_fixed_asset_depreciation_proposal_v1(p_asset_id,p_period);$$;

create or replace function private.post_finance_straight_line_depreciation_v1(p_asset_id uuid,p_period date,p_reason text)
returns public.finance_adjustments
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid:=private.my_brand_id();
  v_prop jsonb;
  v_amount numeric;
  v_asset public.finance_fixed_assets%rowtype;
  v_adj public.finance_adjustments%rowtype;
  v_period_end date;
  v_lines jsonb;
begin
  if v_brand is null or not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Reason is required'; end if;
  v_prop:=private.finance_fixed_asset_depreciation_proposal_v1(p_asset_id,p_period);
  if coalesce(v_prop->>'status','')<>'due' then raise exception 'No automatic depreciation is due: %',coalesce(v_prop->>'status','unknown'); end if;
  v_amount:=(v_prop->>'proposal_amount')::numeric;
  if v_amount<=0 then raise exception 'Depreciation amount must be positive'; end if;
  select * into v_asset from public.finance_fixed_assets where id=p_asset_id and brand_id=v_brand;
  v_period_end:=(date_trunc('month',p_period)::date + interval '1 month - 1 day')::date;
  perform private.assert_accounting_period_open(v_brand,v_period_end);
  if exists(select 1 from public.finance_adjustments where brand_id=v_brand and source_asset_id=p_asset_id and adjustment_type='depreciation' and status='posted' and date_trunc('month',entry_date)=date_trunc('month',p_period)) then
    raise exception 'Depreciation for this asset and period is already posted';
  end if;
  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code','6300','debit',v_amount,'credit',0,'memo','Beban penyusutan '||v_asset.asset_name),
    jsonb_build_object('account_code','1590','debit',0,'credit',v_amount,'memo','Akumulasi penyusutan '||v_asset.asset_name)
  );
  v_adj:=private.save_finance_adjustment_v1(null,'depreciation',v_period_end,'Penyusutan '||v_asset.asset_name||' - '||to_char(v_period,'YYYY-MM'),v_lines,p_reason,p_asset_id);
  return private.post_finance_adjustment_v1(v_adj.id);
end;
$$;

create or replace function public.post_finance_straight_line_depreciation_v1(p_asset_id uuid,p_period date,p_reason text)
returns public.finance_adjustments language sql security invoker set search_path='' as $$select private.post_finance_straight_line_depreciation_v1(p_asset_id,p_period,p_reason);$$;

create or replace function private.resolve_finance_asset_candidate_v1(p_purchase_id uuid,p_decision text,p_target_account_code text,p_reason text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_brand uuid:=private.my_brand_id();
  v_decision text:=lower(btrim(coalesce(p_decision,'')));
  v_p public.offline_purchase_history%rowtype;
  v_asset public.finance_fixed_assets%rowtype;
  v_adj public.finance_adjustments%rowtype;
  v_lines jsonb;
  v_account_type text;
begin
  if v_brand is null or not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  if v_decision not in ('fixed_asset','expense','other') then raise exception 'Unsupported candidate decision'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Reason is required'; end if;
  select * into v_p from public.offline_purchase_history where id=p_purchase_id for update;
  if not found or v_p.brand_id<>v_brand or coalesce(v_p.raw_data->>'analytics_group','')<>'Investasi' then raise exception 'Investment purchase candidate not found'; end if;
  if exists(select 1 from public.finance_asset_candidate_resolutions where purchase_id=p_purchase_id) then raise exception 'Candidate is already resolved'; end if;
  perform private.assert_accounting_period_open(v_brand,coalesce(v_p.purchase_date,v_p.source_period));

  if v_decision='fixed_asset' then
    v_asset:=private.save_finance_fixed_asset_v1(null,v_p.id,coalesce(nullif(btrim(v_p.item_name),''),'Aset dari pembelian'),null,coalesce(v_p.purchase_date,v_p.source_period),null,v_p.total_amount,null,null,null,null,p_reason,false);
    insert into public.finance_asset_candidate_resolutions(purchase_id,brand_id,decision,fixed_asset_id,reason,resolved_by)
    values(v_p.id,v_brand,v_decision,v_asset.id,btrim(p_reason),auth.uid());
    return jsonb_build_object('decision',v_decision,'fixed_asset_id',v_asset.id,'status','asset_draft_created');
  elsif v_decision='expense' then
    select account_type into v_account_type from public.finance_accounts where brand_id=v_brand and code=p_target_account_code and active;
    if v_account_type is distinct from 'EXPENSE' then raise exception 'Target account must be an active expense account'; end if;
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code',p_target_account_code,'debit',v_p.total_amount,'credit',0,'memo','Reklasifikasi '||coalesce(v_p.item_name,'pembelian investasi')),
      jsonb_build_object('account_code','1500','debit',0,'credit',v_p.total_amount,'memo','Keluar dari aset tetap')
    );
    v_adj:=private.save_finance_adjustment_v1(null,'reclass',coalesce(v_p.purchase_date,v_p.source_period),'Reklasifikasi pembelian investasi: '||coalesce(v_p.item_name,'(tanpa nama)'),v_lines,p_reason,null);
    v_adj:=private.post_finance_adjustment_v1(v_adj.id);
    insert into public.finance_asset_candidate_resolutions(purchase_id,brand_id,decision,target_account_code,adjustment_id,reason,resolved_by)
    values(v_p.id,v_brand,v_decision,p_target_account_code,v_adj.id,btrim(p_reason),auth.uid());
    return jsonb_build_object('decision',v_decision,'adjustment_id',v_adj.id,'status','reclass_posted');
  else
    insert into public.finance_asset_candidate_resolutions(purchase_id,brand_id,decision,reason,resolved_by)
    values(v_p.id,v_brand,v_decision,btrim(p_reason),auth.uid());
    return jsonb_build_object('decision',v_decision,'status','review_recorded');
  end if;
end;
$$;

create or replace function public.resolve_finance_asset_candidate_v1(p_purchase_id uuid,p_decision text,p_target_account_code text,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$select private.resolve_finance_asset_candidate_v1(p_purchase_id,p_decision,p_target_account_code,p_reason);$$;

grant select on public.finance_asset_candidate_queue_v1,public.finance_fixed_asset_book_v1 to authenticated;
grant execute on function public.get_finance_fixed_asset_depreciation_proposal_v1(uuid,date) to authenticated;
grant execute on function public.post_finance_straight_line_depreciation_v1(uuid,date,text) to authenticated;
grant execute on function public.resolve_finance_asset_candidate_v1(uuid,text,text,text) to authenticated;
revoke all on function public.get_finance_fixed_asset_depreciation_proposal_v1(uuid,date) from anon;
revoke all on function public.post_finance_straight_line_depreciation_v1(uuid,date,text) from anon;
revoke all on function public.resolve_finance_asset_candidate_v1(uuid,text,text,text) from anon;
