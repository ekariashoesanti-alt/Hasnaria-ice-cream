create table if not exists public.inventory_cost_verifications (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  unit_cost numeric not null check (unit_cost > 0),
  effective_from date not null,
  source_reference text not null check (btrim(source_reference) <> ''),
  notes text not null check (btrim(notes) <> ''),
  verified_by uuid not null,
  verified_at timestamptz not null default now()
);

create index if not exists inventory_cost_verifications_item_effective_idx
  on public.inventory_cost_verifications(brand_id, inventory_item_id, effective_from desc, verified_at desc);
create index if not exists inventory_cost_verifications_verified_by_idx
  on public.inventory_cost_verifications(verified_by);

alter table public.inventory_cost_verifications enable row level security;

drop policy if exists inventory_cost_verifications_read_same_brand on public.inventory_cost_verifications;
create policy inventory_cost_verifications_read_same_brand
on public.inventory_cost_verifications
for select to authenticated
using (private.same_brand(brand_id));

revoke all on public.inventory_cost_verifications from anon;
revoke insert, update, delete, truncate, references, trigger on public.inventory_cost_verifications from authenticated;
grant select on public.inventory_cost_verifications to authenticated;
grant all on public.inventory_cost_verifications to service_role;

create or replace view public.inventory_verified_cost_current
with (security_invoker=true)
as
with movement_candidates as (
  select m.brand_id,
         m.inventory_item_id,
         m.unit_cost,
         m.movement_date as effective_from,
         m.created_at as verified_at,
         'verified_movement'::text as cost_source,
         case when m.reference_type='inventory_purchase_log' then coalesce(l.mapping_method,'purchase') else coalesce(m.reference_type,'movement') end as source_reference
  from public.inventory_movements m
  join public.inventory_items i on i.id=m.inventory_item_id
  left join public.inventory_purchase_log l
    on m.reference_type='inventory_purchase_log' and l.id=m.reference_id
  where m.unit_cost is not null and m.unit_cost>0
    and m.movement_date<=current_date
    and (
      coalesce(m.reference_type,'')<>'inventory_purchase_log'
      or l.mapping_method in ('verified_1to1_unit','recognized_purchase_unit')
      or (l.mapping_method='pack_unit_needs_conversion' and i.unit='pack')
    )
), manual_candidates as (
  select v.brand_id,
         v.inventory_item_id,
         v.unit_cost,
         v.effective_from,
         v.verified_at,
         'manual_verified_cost'::text as cost_source,
         v.source_reference
  from public.inventory_cost_verifications v
  where v.effective_from<=current_date
), all_candidates as (
  select * from movement_candidates
  union all
  select * from manual_candidates
)
select distinct on (brand_id,inventory_item_id)
       brand_id,inventory_item_id,unit_cost,effective_from,verified_at,cost_source,source_reference
from all_candidates
order by brand_id,inventory_item_id,effective_from desc,
         case when cost_source='manual_verified_cost' then 0 else 1 end,
         verified_at desc;

grant select on public.inventory_verified_cost_current to authenticated, service_role;

create or replace function private.verified_product_cogs_at(p_product_id uuid, p_business_date date)
returns numeric
language sql
stable security definer
set search_path = ''
as $function$
with vr as (
  select v.product_id,v.brand_id,v.effective_from
  from public.product_recipe_verifications v
  where v.product_id=p_product_id
    and v.status='verified'
    and v.effective_from is not null
    and v.effective_from<=p_business_date
), components as (
  select r.id,r.brand_id,r.inventory_item_id,r.qty_per_sale,i.unit
  from public.inventory_recipe_components r
  join public.inventory_items i on i.id=r.inventory_item_id
  join vr on vr.product_id=r.product_id and vr.brand_id=r.brand_id
  where r.product_id=p_product_id and r.active
), costed as (
  select c.*,lc.unit_cost
  from components c
  left join lateral (
    with movement_candidates as (
      select m.unit_cost,m.movement_date as effective_date,m.created_at as verified_at,1 as source_priority
      from public.inventory_movements m
      left join public.inventory_purchase_log l
        on m.reference_type='inventory_purchase_log' and l.id=m.reference_id
      where m.brand_id=c.brand_id
        and m.inventory_item_id=c.inventory_item_id
        and m.unit_cost is not null and m.unit_cost>0
        and m.movement_date<=p_business_date
        and (
          coalesce(m.reference_type,'')<>'inventory_purchase_log'
          or l.mapping_method in ('verified_1to1_unit','recognized_purchase_unit')
          or (l.mapping_method='pack_unit_needs_conversion' and c.unit='pack')
        )
    ), manual_candidates as (
      select v.unit_cost,v.effective_from as effective_date,v.verified_at,0 as source_priority
      from public.inventory_cost_verifications v
      where v.brand_id=c.brand_id
        and v.inventory_item_id=c.inventory_item_id
        and v.effective_from<=p_business_date
    ), candidates as (
      select * from movement_candidates
      union all
      select * from manual_candidates
    )
    select unit_cost
    from candidates
    order by effective_date desc,source_priority asc,verified_at desc
    limit 1
  ) lc on true
)
select case
  when count(*)=0 then null
  when count(unit_cost)<count(*) then null
  when sum(qty_per_sale*unit_cost)<=0 then null
  else round(sum(qty_per_sale*unit_cost),4)
end
from costed;
$function$;

revoke all on function private.verified_product_cogs_at(uuid,date) from public, anon, authenticated;
grant execute on function private.verified_product_cogs_at(uuid,date) to service_role;

create or replace view public.product_costing_readiness
with (security_invoker=true)
as
with recipe_rollup as (
  select p.brand_id,p.id as product_id,p.name as product_name,p.selling_price,p.cogs as current_cogs,
         count(r.id) as component_count,
         count(vc.unit_cost) as costed_component_count,
         sum(r.qty_per_sale*coalesce(vc.unit_cost,0)) as raw_recipe_cost,
         string_agg((((i.item_name||' x ')||r.qty_per_sale::text)||' ')||coalesce(i.unit,''),', ' order by i.item_name) as recipe_summary,
         coalesce(v.status,'draft') as recipe_verification_status
  from public.products p
  left join public.inventory_recipe_components r on r.product_id=p.id and r.active
  left join public.inventory_items i on i.id=r.inventory_item_id
  left join public.inventory_verified_cost_current vc on vc.brand_id=r.brand_id and vc.inventory_item_id=r.inventory_item_id
  left join public.product_recipe_verifications v on v.product_id=p.id
  group by p.brand_id,p.id,p.name,p.selling_price,p.cogs,v.status
)
select brand_id,product_id,product_name,selling_price,current_cogs,component_count,costed_component_count,raw_recipe_cost,recipe_summary,
       case
         when component_count=0 then 'missing_recipe'
         when recipe_verification_status<>'verified' then 'recipe_unverified'
         when costed_component_count<component_count then 'missing_component_cost'
         when selling_price<=0 then 'missing_selling_price'
         when raw_recipe_cost<=0 then 'invalid_recipe_cost'
         when raw_recipe_cost>=selling_price then 'review_unit_conversion'
         else 'ready'
       end as costing_status
from recipe_rollup;

grant select on public.product_costing_readiness to authenticated, service_role;

create or replace view public.inventory_valuation_verified_summary
with (security_invoker=true)
as
select b.brand_id,
       count(*) as inventory_items,
       count(*) filter (where c.unit_cost is not null) as valued_items,
       case when count(*)>0 then 100.0*count(*) filter (where c.unit_cost is not null)::numeric/count(*)::numeric else 0 end as cost_coverage_pct,
       sum(case when b.tracking_active then greatest(b.ledger_qty,0)*coalesce(c.unit_cost,0) else 0 end) as inventory_value,
       sum(case when not b.tracking_active then greatest(b.ledger_qty,0)*coalesce(c.unit_cost,0) else 0 end) as untracked_provisional_value,
       count(*) filter (where b.status='critical') as critical_items,
       count(*) filter (where b.status='order') as reorder_items,
       count(*) filter (where b.status='untracked') as untracked_items
from public.inventory_ledger_balance b
left join public.inventory_verified_cost_current c on c.brand_id=b.brand_id and c.inventory_item_id=b.inventory_item_id
group by b.brand_id;

grant select on public.inventory_valuation_verified_summary to authenticated, service_role;

create or replace view public.ui_missing_component_cost_queue
with (security_invoker=true)
as
with missing_items as (
  select distinct r.brand_id,r.inventory_item_id
  from public.inventory_recipe_components r
  join public.products p on p.id=r.product_id and p.brand_id=r.brand_id
  left join public.inventory_verified_cost_current vc on vc.brand_id=r.brand_id and vc.inventory_item_id=r.inventory_item_id
  where r.active and vc.inventory_item_id is null
), affected as (
  select r.brand_id,r.inventory_item_id,count(distinct r.product_id) as affected_product_count,
         string_agg(distinct p.name,', ' order by p.name) as affected_products
  from public.inventory_recipe_components r
  join public.products p on p.id=r.product_id and p.brand_id=r.brand_id
  join missing_items m on m.brand_id=r.brand_id and m.inventory_item_id=r.inventory_item_id
  where r.active
  group by r.brand_id,r.inventory_item_id
), observed as (
  select l.brand_id,l.inventory_item_id,count(*) as observed_purchase_rows,
         min(l.unit_cost) filter (where l.unit_cost>0) as min_observed_unit_cost,
         max(l.unit_cost) filter (where l.unit_cost>0) as max_observed_unit_cost,
         max(l.purchase_date) filter (where l.unit_cost>0) as latest_observed_purchase_date
  from public.inventory_purchase_log l
  join missing_items m on m.brand_id=l.brand_id and m.inventory_item_id=l.inventory_item_id
  group by l.brand_id,l.inventory_item_id
), latest_observed as (
  select distinct on (l.brand_id,l.inventory_item_id)
         l.brand_id,l.inventory_item_id,l.unit_cost as latest_observed_unit_cost,l.purchase_date,l.mapping_method
  from public.inventory_purchase_log l
  join missing_items m on m.brand_id=l.brand_id and m.inventory_item_id=l.inventory_item_id
  where l.unit_cost>0
  order by l.brand_id,l.inventory_item_id,l.purchase_date desc,l.created_at desc
)
select i.brand_id,i.id as inventory_item_id,i.item_name,i.unit,i.category,
       a.affected_product_count,a.affected_products,
       coalesce(o.observed_purchase_rows,0) as observed_purchase_rows,
       o.min_observed_unit_cost,o.max_observed_unit_cost,lo.latest_observed_unit_cost,
       lo.purchase_date as latest_observed_purchase_date,
       lo.mapping_method as latest_observed_mapping_method,
       'needs_verified_cost'::text as status
from missing_items m
join public.inventory_items i on i.id=m.inventory_item_id and i.brand_id=m.brand_id
join affected a on a.brand_id=m.brand_id and a.inventory_item_id=m.inventory_item_id
left join observed o on o.brand_id=m.brand_id and o.inventory_item_id=m.inventory_item_id
left join latest_observed lo on lo.brand_id=m.brand_id and lo.inventory_item_id=m.inventory_item_id
where i.brand_id=private.my_brand_id();

grant select on public.ui_missing_component_cost_queue to authenticated, service_role;

create or replace function private.resolve_inventory_item_cost_verification(
  p_inventory_item_id uuid,p_unit_cost numeric,p_effective_from date,p_source_reference text,p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item public.inventory_items%rowtype;
  v_row public.inventory_cost_verifications%rowtype;
  v_affected_products uuid[];
  v_product_id uuid;
  v_refresh jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  select * into v_item from public.inventory_items where id=p_inventory_item_id;
  if not found then raise exception 'Inventory item not found'; end if;
  if not private.same_brand(v_item.brand_id) or not private.is_owner() then raise exception 'Owner permission required for this brand'; end if;
  if coalesce(p_unit_cost,0)<=0 then raise exception 'Unit cost must be greater than zero'; end if;
  if p_effective_from is null then raise exception 'Effective date is required'; end if;
  if p_effective_from>current_date then raise exception 'Effective date cannot be in the future'; end if;
  if nullif(btrim(coalesce(p_source_reference,'')),'') is null then raise exception 'Source reference is required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Reason is required'; end if;

  insert into public.inventory_cost_verifications(
    brand_id,inventory_item_id,unit_cost,effective_from,source_reference,notes,verified_by,verified_at
  ) values (
    v_item.brand_id,p_inventory_item_id,p_unit_cost,p_effective_from,btrim(p_source_reference),btrim(p_reason),auth.uid(),now()
  ) returning * into v_row;

  select array_agg(distinct r.product_id) into v_affected_products
  from public.inventory_recipe_components r
  where r.brand_id=v_item.brand_id and r.inventory_item_id=p_inventory_item_id and r.active;

  if v_affected_products is not null then
    foreach v_product_id in array v_affected_products
    loop
      if exists (
        select 1 from public.product_recipe_verifications prv
        where prv.product_id=v_product_id and prv.brand_id=v_item.brand_id
          and prv.status='verified' and prv.effective_from is not null
      ) then
        v_refresh := v_refresh || jsonb_build_array(
          private.refresh_verified_sale_cogs_for_product(v_product_id,p_effective_from,current_date)
        );
      end if;
    end loop;
  end if;

  perform private.write_audit_log(
    v_item.brand_id,null,'inventory_cost_verification',v_row.id,'VERIFY_COST',auth.uid(),
    null,to_jsonb(v_row),btrim(p_reason),
    jsonb_build_object('inventory_item_id',p_inventory_item_id,'unit',v_item.unit,'source_reference',btrim(p_source_reference),'affected_products',v_affected_products,'cogs_refresh',v_refresh)
  );

  return jsonb_build_object(
    'verification_id',v_row.id,'inventory_item_id',p_inventory_item_id,'unit_cost',p_unit_cost,
    'effective_from',p_effective_from,'source_reference',btrim(p_source_reference),
    'affected_products',coalesce(to_jsonb(v_affected_products),'[]'::jsonb),'cogs_refresh',v_refresh
  );
end;
$function$;

create or replace function public.resolve_inventory_item_cost_verification(
  p_inventory_item_id uuid,p_unit_cost numeric,p_effective_from date,p_source_reference text,p_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.resolve_inventory_item_cost_verification(p_inventory_item_id,p_unit_cost,p_effective_from,p_source_reference,p_reason);
$function$;

revoke all on function public.resolve_inventory_item_cost_verification(uuid,numeric,date,text,text) from public, anon;
grant execute on function public.resolve_inventory_item_cost_verification(uuid,numeric,date,text,text) to authenticated, service_role;
revoke all on function private.resolve_inventory_item_cost_verification(uuid,numeric,date,text,text) from public, anon, authenticated;
grant execute on function private.resolve_inventory_item_cost_verification(uuid,numeric,date,text,text) to service_role;

create or replace view public.ui_erp_action_queue_v4
with (security_invoker=true)
as
with combined as (
  select q.brand_id,q.action_type,q.subject,q.priority,q.financial_impact,q.activity_impact,q.action_needed,q.metadata,q.action_rank as source_rank
  from public.ui_erp_action_queue_v3 q
  union all
  select q.brand_id,'financing_payment_review'::text,q.item_name,
         case when coalesce(q.total_amount,0)>=100000 then 'high' else 'medium' end,
         coalesce(q.total_amount,0),1::numeric,
         'Tentukan apakah cicilan ini cash_paid, liability_only, atau exclude; jangan otomatis dianggap cash-out'::text,
         jsonb_build_object('source_history_id',q.source_history_id,'purchase_date',q.purchase_date,'amount',q.total_amount,'payment_method',q.payment_method,'source_file',q.source_file,'row_no',q.row_no),
         895000::bigint
  from public.ui_financing_payment_queue q
  where q.review_status='needs_review'
  union all
  select q.brand_id,'missing_component_cost'::text,q.item_name,
         case when q.affected_product_count>=3 then 'high' else 'medium' end,
         0::numeric,q.affected_product_count::numeric,
         'Masukkan unit cost terverifikasi berdasarkan bukti; histori purchase hanya referensi dan tidak diterapkan otomatis'::text,
         jsonb_build_object('inventory_item_id',q.inventory_item_id,'unit',q.unit,'category',q.category,'affected_product_count',q.affected_product_count,'affected_products',q.affected_products,'observed_purchase_rows',q.observed_purchase_rows,'min_observed_unit_cost',q.min_observed_unit_cost,'max_observed_unit_cost',q.max_observed_unit_cost,'latest_observed_unit_cost',q.latest_observed_unit_cost,'latest_observed_purchase_date',q.latest_observed_purchase_date,'latest_observed_mapping_method',q.latest_observed_mapping_method),
         885000::bigint
  from public.ui_missing_component_cost_queue q
), ranked as (
  select c.*,
         row_number() over(order by case c.priority when 'high' then 1 when 'medium' then 2 else 3 end,
                           coalesce(c.financial_impact,0) desc,coalesce(c.activity_impact,0) desc,c.source_rank,c.subject) as action_rank
  from combined c
)
select brand_id,action_rank,action_type,subject,priority,financial_impact,activity_impact,action_needed,metadata
from ranked;

grant select on public.ui_erp_action_queue_v4 to authenticated, service_role;

create or replace view public.ui_action_capabilities_v4
with (security_invoker=true)
as
select action_type,resolution_mode,rpc_name,input_schema,notes
from public.ui_action_capabilities_v3
where action_type not in ('zero_amount_purchase','missing_recipe','untracked_stock','missing_component_cost')
union all select 'zero_amount_purchase','rpc','resolve_zero_amount_purchase_candidate','{"source_history_id":"uuid","resolution":"actual_amount|exclude","effective_amount":"number>0 required for actual_amount","reason":"text required"}'::jsonb,'Raw source remains unchanged. actual_amount supplies audited effective amount; exclude removes the source row from downstream mapping/posting.'
union all select 'financing_payment_review','rpc','resolve_financing_payment_candidate','{"reason":"text recommended","cash_date":"date required for cash_paid","resolution":"cash_paid|liability_only|exclude","cash_amount":"number>0 required for cash_paid","source_history_id":"uuid"}'::jsonb,'Cashflow hanya berubah jika resolution=cash_paid; liability_only tetap non-cash.'
union all select 'untracked_stock','rpc','resolve_physical_stock_opname','{"inventory_item_id":"uuid","physical_qty":"number>=0","opname_date":"date<=today","reason":"text required"}'::jsonb,'Physical count only. System quantity is read from the ledger; no stock value is guessed.'
union all select 'missing_recipe','rpc','save_product_recipe_draft','{"product_id":"uuid","components":"array of {inventory_item_id,qty_per_sale>0}","reason":"text required"}'::jsonb,'Saves recipe as draft only. Recipe must be verified separately with effective_from before it can affect COGS or inventory consumption.'
union all select 'missing_component_cost','rpc','resolve_inventory_item_cost_verification','{"inventory_item_id":"uuid","unit_cost":"number>0","effective_from":"date<=today","source_reference":"text required","reason":"text required"}'::jsonb,'Stores audited temporal verified unit cost. Observed purchase prices are reference only and are never auto-applied.';

grant select on public.ui_action_capabilities_v4 to authenticated, service_role;

create or replace view public.ui_contract_manifest_v4
with (security_invoker=true)
as
select endpoint_name,endpoint_type,purpose,access_mode from public.ui_contract_manifest_v3
union all select 'ui_manual_input_requirements_v2','view','Checklist manual lengkap termasuk missing recipe, component cost, dan physical opname','read_only'
union all select 'resolve_zero_amount_purchase_candidate','rpc','Resolve zero-amount purchase without mutating raw import','owner_write'
union all select 'resolve_physical_stock_opname','rpc','Record explicit physical stock count against current ledger','owner_write'
union all select 'save_product_recipe_draft','rpc','Save recipe components as draft; verification remains separate and temporal','stock_write'
union all select 'ui_missing_component_cost_queue','view','Distinct inventory components that still need a verified unit cost','read_only'
union all select 'resolve_inventory_item_cost_verification','rpc','Store audited temporal verified unit cost without changing stock quantity','owner_write';

grant select on public.ui_contract_manifest_v4 to authenticated, service_role;