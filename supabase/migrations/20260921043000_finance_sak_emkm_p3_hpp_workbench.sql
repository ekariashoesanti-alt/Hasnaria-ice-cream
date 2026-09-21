create or replace view public.finance_hpp_period_coverage_v1 as
select
  s.brand_id,
  date_trunc('month',s.sold_at)::date as period_month,
  count(si.id)::bigint as sale_item_rows,
  coalesce(sum(si.qty),0)::numeric as total_units,
  count(si.id) filter (
    where si.unit_cogs_source='verified_recipe_temporal_cost'
      and si.unit_cogs_confidence='verified'
      and coalesce(si.unit_cogs,0)>0
  )::bigint as verified_sale_item_rows,
  coalesce(sum(si.qty) filter (
    where si.unit_cogs_source='verified_recipe_temporal_cost'
      and si.unit_cogs_confidence='verified'
      and coalesce(si.unit_cogs,0)>0
  ),0)::numeric as verified_units,
  coalesce(sum(si.qty*si.unit_cogs) filter (
    where si.unit_cogs_source='verified_recipe_temporal_cost'
      and si.unit_cogs_confidence='verified'
      and coalesce(si.unit_cogs,0)>0
  ),0)::numeric as verified_cogs,
  coalesce(sum(si.qty*si.unit_price),0)::numeric as item_sales_value,
  coalesce(sum(si.qty*si.unit_price) filter (
    where not (
      si.unit_cogs_source='verified_recipe_temporal_cost'
      and si.unit_cogs_confidence='verified'
      and coalesce(si.unit_cogs,0)>0
    )
  ),0)::numeric as uncovered_sales_value,
  coalesce(sum(si.qty) filter (
    where not (
      si.unit_cogs_source='verified_recipe_temporal_cost'
      and si.unit_cogs_confidence='verified'
      and coalesce(si.unit_cogs,0)>0
    )
  ),0)::numeric as uncovered_units,
  case when coalesce(sum(si.qty),0)=0 then 100::numeric
       else round(100*coalesce(sum(si.qty) filter (
         where si.unit_cogs_source='verified_recipe_temporal_cost'
           and si.unit_cogs_confidence='verified'
           and coalesce(si.unit_cogs,0)>0
       ),0)::numeric / sum(si.qty)::numeric,2)
  end as coverage_pct
from public.sales s
join public.sale_items si on si.sale_id=s.id
group by s.brand_id,date_trunc('month',s.sold_at)::date;

create or replace view public.finance_hpp_product_readiness_v1 as
with component_rollup as (
  select
    p.brand_id,
    p.id as product_id,
    p.name as product_name,
    count(r.id) filter(where r.active)::bigint as component_count,
    count(vc.inventory_item_id) filter(where r.active)::bigint as current_costed_component_count,
    round(coalesce(sum(r.qty_per_sale*vc.unit_cost) filter(where r.active),0),4) as current_recipe_cost,
    string_agg(
      case when r.active then i.item_name||' x '||r.qty_per_sale::text||' '||coalesce(i.unit,'') end,
      ', ' order by i.item_name
    ) filter(where r.active) as recipe_summary
  from public.products p
  left join public.inventory_recipe_components r on r.product_id=p.id and r.brand_id=p.brand_id
  left join public.inventory_items i on i.id=r.inventory_item_id
  left join public.inventory_verified_cost_current vc
    on vc.brand_id=r.brand_id and vc.inventory_item_id=r.inventory_item_id
  group by p.brand_id,p.id,p.name
), verification as (
  select product_id,brand_id,status,effective_from,verified_at
  from public.product_recipe_verifications
)
select
  c.brand_id,c.product_id,c.product_name,c.component_count,
  c.current_costed_component_count,c.current_recipe_cost,c.recipe_summary,
  coalesce(v.status,'draft') as recipe_verification_status,
  v.effective_from as recipe_effective_from,
  v.verified_at,
  case
    when c.component_count=0 then 'missing_recipe'
    when coalesce(v.status,'draft')<>'verified' then 'recipe_unverified'
    when v.effective_from is null then 'recipe_effective_date_missing'
    when c.current_costed_component_count<c.component_count then 'missing_component_cost'
    when c.current_recipe_cost<=0 then 'invalid_recipe_cost'
    else 'ready_for_temporal_costing'
  end as hpp_status,
  (
    c.component_count>0
    and coalesce(v.status,'draft')='verified'
    and v.effective_from is not null
    and c.current_costed_component_count=c.component_count
    and c.current_recipe_cost>0
  ) as can_refresh_hpp
from component_rollup c
left join verification v on v.product_id=c.product_id and v.brand_id=c.brand_id;

create or replace view public.finance_hpp_blocker_queue_v1 as
with sold as (
  select
    s.brand_id,
    date_trunc('month',s.sold_at)::date as period_month,
    si.product_id,
    coalesce(max(p.name),max(si.item_name),'Produk tanpa nama') as product_name,
    sum(si.qty)::numeric as sold_units,
    sum(si.qty*si.unit_price)::numeric as sales_value,
    sum(si.qty) filter (
      where not (
        si.unit_cogs_source='verified_recipe_temporal_cost'
        and si.unit_cogs_confidence='verified'
        and coalesce(si.unit_cogs,0)>0
      )
    )::numeric as uncovered_units,
    sum(si.qty*si.unit_price) filter (
      where not (
        si.unit_cogs_source='verified_recipe_temporal_cost'
        and si.unit_cogs_confidence='verified'
        and coalesce(si.unit_cogs,0)>0
      )
    )::numeric as uncovered_sales_value,
    min(s.sold_at) as first_sale_date,
    max(s.sold_at) as last_sale_date
  from public.sales s
  join public.sale_items si on si.sale_id=s.id
  left join public.products p on p.id=si.product_id
  group by s.brand_id,date_trunc('month',s.sold_at)::date,si.product_id
), joined as (
  select
    sold.*,
    coalesce(r.hpp_status,'missing_product_mapping') as blocker_reason,
    r.component_count,
    r.current_costed_component_count,
    r.current_recipe_cost,
    r.recipe_summary,
    r.recipe_verification_status,
    r.recipe_effective_from,
    r.can_refresh_hpp
  from sold
  left join public.finance_hpp_product_readiness_v1 r
    on r.brand_id=sold.brand_id and r.product_id=sold.product_id
  where coalesce(sold.uncovered_units,0)>0
)
select
  j.*,
  case j.blocker_reason
    when 'missing_product_mapping' then 'map_product'
    when 'missing_recipe' then 'define_recipe'
    when 'recipe_unverified' then 'verify_recipe'
    when 'recipe_effective_date_missing' then 'set_recipe_effective_date'
    when 'missing_component_cost' then 'verify_component_cost'
    when 'invalid_recipe_cost' then 'review_recipe_cost'
    when 'ready_for_temporal_costing' then 'refresh_hpp'
    else 'review_hpp'
  end as required_action,
  dense_rank() over(
    partition by j.brand_id,j.period_month
    order by coalesce(j.uncovered_sales_value,0) desc,coalesce(j.uncovered_units,0) desc,j.product_name
  ) as priority_rank
from joined j;

create or replace view public.finance_hpp_direct_match_candidates_v1 as
with products_norm as (
  select p.id product_id,p.brand_id,p.name product_name,
         regexp_replace(lower(trim(p.name)),'[^a-z0-9]+','','g') as norm
  from public.products p
), inventory_norm as (
  select i.id inventory_item_id,i.brand_id,i.item_name,i.unit,
         regexp_replace(lower(trim(i.item_name)),'[^a-z0-9]+','','g') as norm
  from public.inventory_items i
), matched as (
  select p.product_id,p.brand_id,p.product_name,i.inventory_item_id,i.item_name,i.unit,
         count(*) over(partition by p.product_id) as match_count
  from products_norm p
  join inventory_norm i on i.brand_id=p.brand_id and i.norm=p.norm and i.norm<>''
), sales_roll as (
  select si.product_id,min(s.sold_at) first_sale_date,max(s.sold_at) last_sale_date,
         sum(si.qty)::numeric sold_units,sum(si.qty*si.unit_price)::numeric sales_value
  from public.sale_items si join public.sales s on s.id=si.sale_id
  group by si.product_id
)
select
  m.brand_id,m.product_id,m.product_name,m.inventory_item_id,m.item_name,m.unit,
  vc.unit_cost,vc.effective_from as cost_effective_from,vc.cost_source,vc.source_reference,
  sr.first_sale_date,sr.last_sale_date,sr.sold_units,sr.sales_value,
  case
    when m.match_count=1
      and m.unit='pcs'
      and vc.unit_cost>0
      and vc.effective_from is not null
      and sr.first_sale_date is not null
      and vc.effective_from<=sr.first_sale_date
      and vc.source_reference='verified_1to1_unit'
    then true else false
  end as evidence_qualified_direct_unit
from matched m
join public.finance_hpp_product_readiness_v1 r
  on r.brand_id=m.brand_id and r.product_id=m.product_id
left join public.inventory_verified_cost_current vc
  on vc.brand_id=m.brand_id and vc.inventory_item_id=m.inventory_item_id
left join sales_roll sr on sr.product_id=m.product_id
where m.match_count=1 and r.hpp_status='missing_recipe';

create or replace function public.get_finance_hpp_workbench_v1(p_brand uuid,p_period date default null)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_brand uuid;
  v_period date;
  v_result jsonb;
begin
  v_brand:=private.my_brand_id();
  if v_brand is null then raise exception 'Authenticated brand required'; end if;
  if p_brand is distinct from v_brand then raise exception 'Brand access denied'; end if;
  v_period:=coalesce(date_trunc('month',p_period)::date,
    (select max(period_month) from public.finance_hpp_period_coverage_v1 where brand_id=v_brand));

  select jsonb_build_object(
    'period',v_period,
    'coverage',coalesce((select to_jsonb(c) from public.finance_hpp_period_coverage_v1 c where c.brand_id=v_brand and c.period_month=v_period),'{}'::jsonb),
    'summary',jsonb_build_object(
      'products_ready',(select count(*) from public.finance_hpp_product_readiness_v1 r where r.brand_id=v_brand and r.can_refresh_hpp),
      'products_missing_recipe',(select count(*) from public.finance_hpp_product_readiness_v1 r where r.brand_id=v_brand and r.hpp_status='missing_recipe'),
      'products_recipe_unverified',(select count(*) from public.finance_hpp_product_readiness_v1 r where r.brand_id=v_brand and r.hpp_status='recipe_unverified'),
      'products_missing_component_cost',(select count(*) from public.finance_hpp_product_readiness_v1 r where r.brand_id=v_brand and r.hpp_status='missing_component_cost'),
      'evidence_qualified_direct_units',(select count(*) from public.finance_hpp_direct_match_candidates_v1 c where c.brand_id=v_brand and c.evidence_qualified_direct_unit)
    ),
    'blockers',coalesce((select jsonb_agg(to_jsonb(q) order by q.priority_rank) from (select * from public.finance_hpp_blocker_queue_v1 where brand_id=v_brand and period_month=v_period order by priority_rank limit 100) q),'[]'::jsonb),
    'direct_match_candidates',coalesce((select jsonb_agg(to_jsonb(c) order by c.evidence_qualified_direct_unit desc,c.sales_value desc nulls last) from public.finance_hpp_direct_match_candidates_v1 c where c.brand_id=v_brand),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.refresh_finance_hpp_v1(p_from date,p_to date)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_brand uuid;
  v_product record;
  v_products integer:=0;
  v_updated integer:=0;
  v_res jsonb;
begin
  v_brand:=private.my_brand_id();
  if v_brand is null then raise exception 'Authenticated brand required'; end if;
  if p_from is null or p_to is null or p_to<p_from then raise exception 'Invalid HPP refresh date range'; end if;

  for v_product in
    select product_id from public.finance_hpp_product_readiness_v1
    where brand_id=v_brand and can_refresh_hpp
  loop
    v_products:=v_products+1;
    v_res:=private.refresh_verified_sale_cogs_for_product(v_product.product_id,p_from,p_to);
    v_updated:=v_updated+coalesce((v_res->>'updated_rows')::integer,0);
  end loop;

  perform private.rebuild_finance_journal_v1(v_brand,p_from,p_to);
  return jsonb_build_object('brand_id',v_brand,'from',p_from,'to',p_to,'products_refreshed',v_products,'sale_item_rows_updated',v_updated);
end;
$$;

grant select on public.finance_hpp_period_coverage_v1,public.finance_hpp_product_readiness_v1,public.finance_hpp_blocker_queue_v1,public.finance_hpp_direct_match_candidates_v1 to authenticated;
grant execute on function public.get_finance_hpp_workbench_v1(uuid,date) to authenticated;
grant execute on function public.refresh_finance_hpp_v1(date,date) to authenticated;
revoke all on function public.get_finance_hpp_workbench_v1(uuid,date) from anon;
revoke all on function public.refresh_finance_hpp_v1(date,date) from anon;
