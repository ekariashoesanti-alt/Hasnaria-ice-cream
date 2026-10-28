-- Gate: requires audited Owner evidence and valid BOM before any path may set
-- product_recipe_verifications.status='verified' (RPC v1/v2 and direct RLS writes).
-- Existing production movement data is never modified by this migration.
create or replace function private.assert_product_recipe_approval_v1(
  p_product_id uuid, p_brand_id uuid, p_effective_from date
)
returns void language plpgsql security definer set search_path=''
as $fn$
declare
  v_review private.stock_recipe_owner_reviews_v1%rowtype;
  v_now date := timezone('Asia/Jakarta',now())::date;
  v_component_count bigint;
  v_verified_count bigint;
  v_unique_count bigint;
  v_bad_units bigint;
  v_review_snapshot jsonb;
  v_live_snapshot jsonb;
  v_risk record;
begin
  if auth.uid() is null or not private.is_owner()
     or not private.same_brand(p_brand_id)
     or not private.can_stock_write() then
    raise exception 'Active Owner permission required for recipe approval';
  end if;
  if p_effective_from is null or p_effective_from>v_now then
    raise exception 'Explicit effective date must not be null or in the future';
  end if;

  -- Serialize approvals for all products sharing inventory in this brand.
  perform pg_advisory_xact_lock(hashtextextended(p_brand_id::text, 3071));

  select * into v_review
  from private.stock_recipe_owner_reviews_v1 r
  where r.brand_id=p_brand_id and r.product_id=p_product_id
  order by r.reviewed_at desc,r.id desc
  limit 1;
  if not found or v_review.decision<>'EVIDENCE_RECORDED'
     or v_review.proposed_effective_from is distinct from p_effective_from
     or v_review.period_month<>date_trunc('month',p_effective_from)::date
     or length(btrim(coalesce(v_review.evidence_reference,'')))<12
     or length(btrim(coalesce(v_review.review_reason,'')))<30 then
    raise exception 'Latest Owner evidence review for exact recipe effective date is missing or on hold';
  end if;

  select count(*),
         count(*) filter(where c.bom_status='verified' and c.qty_per_sale>0),
         count(distinct c.inventory_item_id),
         count(*) filter(where i.id is null
            or nullif(btrim(i.unit),'') is null
            or lower(btrim(i.unit)) in ('purchase_unit','unknown','unit','?','-'))
  into v_component_count,v_verified_count,v_unique_count,v_bad_units
  from public.inventory_recipe_components c
  left join public.inventory_items i on i.id=c.inventory_item_id and i.brand_id=c.brand_id
  where c.product_id=p_product_id and c.brand_id=p_brand_id and c.active;
  if v_component_count=0 or v_component_count<>v_verified_count
    or v_component_count<>v_unique_count or v_bad_units<>0 then
    raise exception 'All active recipe ingredients need verified quantity and valid SKU unit';
  end if;

  -- Compare immutable BOM characteristics only; do NOT compare dynamic balances.
  select coalesce(jsonb_agg(jsonb_build_object(
    'component_id',j.value->>'component_id',
    'sku_id',j.value->>'sku_id',
    'sku_name',j.value->>'sku_name',
    'unit',j.value->>'unit',
    'qty_per_sale',(j.value->>'qty_per_sale')::numeric,
    'bom_status',j.value->>'bom_status'
  ) order by j.value->>'component_id'),'[]'::jsonb)
  into v_review_snapshot
  from jsonb_array_elements(v_review.source_snapshot) as j(value);

  select coalesce(jsonb_agg(jsonb_build_object(
    'component_id',c.id::text,
    'sku_id',c.inventory_item_id::text,
    'sku_name',i.item_name,
    'unit',coalesce(i.unit,''),
    'qty_per_sale',c.qty_per_sale,
    'bom_status',c.bom_status
  ) order by c.id::text),'[]'::jsonb)
  into v_live_snapshot
  from public.inventory_recipe_components c
  join public.inventory_items i on i.id=c.inventory_item_id and i.brand_id=p_brand_id
  where c.brand_id=p_brand_id and c.product_id=p_product_id and c.active;

  if v_review_snapshot is distinct from v_live_snapshot then
    raise exception 'Recipe ingredient/quantity/unit changed after Owner review; review again';
  end if;

  if exists(
    select 1 from public.sale_items si join public.sales s on s.id=si.sale_id
    where si.product_id=p_product_id and s.brand_id=p_brand_id
      and s.sold_at::date>=p_effective_from and s.sold_at::date>v_now
  ) then
    raise exception 'Future dated sale items must be reviewed before posting';
  end if;

  -- Net-new deductions only, AFTER physical checkpoint. Previously posted
  -- sale-item / SKU references are not subtracted again.
  for v_risk in
    select r.inventory_item_id,r.item_name,r.tracking_active,r.baseline_date,r.system_qty,
      coalesce(sum(
        case when s.id is not null
                  and s.sold_at::date>r.baseline_date
                  and not exists(
                    select 1 from public.inventory_movements m
                    where m.brand_id=p_brand_id
                      and m.reference_type='sale_item'
                      and m.reference_id=si.id
                      and m.inventory_item_id=c.inventory_item_id
                      and m.movement_type='SALE_CONSUMPTION'
                      and m.system_generated
                  )
             then si.qty::numeric*c.qty_per_sale
             else 0::numeric end
      ),0)::numeric as prospective_usage
    from public.inventory_recipe_components c
    left join public.inventory_stock_reconciliation r
      on r.brand_id=p_brand_id and r.inventory_item_id=c.inventory_item_id
    left join public.sale_items si on si.product_id=p_product_id
    left join public.sales s on s.id=si.sale_id
      and s.brand_id=p_brand_id and s.sold_at::date>=p_effective_from
      and s.sold_at::date<=v_now
    where c.brand_id=p_brand_id and c.product_id=p_product_id and c.active
    group by r.inventory_item_id,r.item_name,r.tracking_active,
             r.baseline_date,r.system_qty
  loop
    if v_risk.inventory_item_id is null or v_risk.tracking_active is distinct from true
       or v_risk.baseline_date is null or v_risk.system_qty is null then
      raise exception 'Physical stock checkpoint is required for every recipe SKU';
    end if;
    if v_risk.system_qty<0 or v_risk.system_qty<v_risk.prospective_usage then
      raise exception 'Stock risk for %: current % < prospective consumption %',
        v_risk.item_name,v_risk.system_qty,v_risk.prospective_usage;
    end if;
  end loop;
end;
$fn$;

revoke all on function private.assert_product_recipe_approval_v1(uuid,uuid,date)
 from public,anon,authenticated;

create or replace function private.guard_recipe_verification_transition_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if new.status='verified' and
     (tg_op='INSERT' or old.status is distinct from 'verified'
          or old.effective_from is distinct from new.effective_from) then
    perform private.assert_product_recipe_approval_v1(
      new.product_id,new.brand_id,new.effective_from);
  end if;
  return new;
end;
$fn$;
revoke all on function private.guard_recipe_verification_transition_v1()
 from public,anon,authenticated;

drop trigger if exists trg_guard_recipe_verification_transition_v1
  on public.product_recipe_verifications;
create trigger trg_guard_recipe_verification_transition_v1
  before insert or update on public.product_recipe_verifications
  for each row execute function private.guard_recipe_verification_transition_v1();

comment on trigger trg_guard_recipe_verification_transition_v1
 on public.product_recipe_verifications is
 'Fail-closed Owner evidence and stock coverage guard for ALL recipe approval paths; zero ledger writes by trigger.';

-- Combined unposted physical-stock scenario: ALL actively mapped products
-- using each SKU in a month, excluding sale-item+SKU movements already posted,
-- and excluding sales at/before latest physical checkpoint.
create or replace view public.ui_stock_recipe_combined_impact_v1
with (security_invoker=true) as
with candidates as (
  select s.brand_id,
    date_trunc('month',s.sold_at)::date as period_month,
    s.sold_at::date as sale_date,
    si.id as sale_item_id,si.product_id,si.qty::numeric as sold_qty,
    c.inventory_item_id,c.qty_per_sale,c.bom_status,
    rv.status as recipe_status,rv.effective_from,
    coalesce(r.tracking_active,false) as tracking_active,
    r.system_qty,r.baseline_date,
    exists(
      select 1 from public.inventory_movements m
      where m.brand_id=s.brand_id
        and m.reference_type='sale_item'
        and m.reference_id=si.id
        and m.inventory_item_id=c.inventory_item_id
        and m.movement_type='SALE_CONSUMPTION'
        and m.system_generated
    ) as already_posted
  from public.sales s
  join public.sale_items si on si.sale_id=s.id and si.product_id is not null
  join public.inventory_recipe_components c
    on c.brand_id=s.brand_id and c.product_id=si.product_id and c.active
  left join public.product_recipe_verifications rv
    on rv.brand_id=s.brand_id and rv.product_id=si.product_id
  left join public.inventory_stock_reconciliation r
    on r.brand_id=s.brand_id and r.inventory_item_id=c.inventory_item_id
  where s.sold_at::date<=timezone('Asia/Jakarta',now())::date
), sums as (
  select brand_id,period_month,inventory_item_id,
    count(distinct product_id)::bigint as contributing_products,
    count(distinct sale_item_id)::bigint as mapped_sale_items,
    count(*) filter(where already_posted)::bigint as existing_movement_matches,
    count(*) filter(where sale_date<=baseline_date)::bigint as lines_before_checkpoint,
    count(*) filter(where bom_status<>'verified')::bigint as unverified_component_lines,
    count(*) filter(where not already_posted and sale_date>baseline_date)::bigint as unposted_after_checkpoint_lines,
    coalesce(sum(
      case when not already_posted and sale_date>baseline_date
        then sold_qty*qty_per_sale else 0::numeric end
    ),0)::numeric as hypothetical_usage,
    coalesce(sum(
      case when not already_posted and sale_date>baseline_date
        and recipe_status='verified' and effective_from<=sale_date
        and bom_status='verified'
        then sold_qty*qty_per_sale else 0::numeric end
    ),0)::numeric as approved_candidate_usage
  from candidates
  group by brand_id,period_month,inventory_item_id
)
select x.brand_id,x.period_month,x.inventory_item_id,
  i.item_name as sku_name,coalesce(i.unit,'') as sku_unit,
  x.contributing_products,x.mapped_sale_items,
  x.existing_movement_matches,x.lines_before_checkpoint,
  x.unverified_component_lines,x.unposted_after_checkpoint_lines,
  x.hypothetical_usage,x.approved_candidate_usage,
  coalesce(r.tracking_active,false) as tracking_active,
  r.baseline_date,
  case when r.tracking_active then r.system_qty else null end as current_system_qty,
  case when r.tracking_active then r.system_qty-x.hypothetical_usage
       else null end as hypothetical_remaining_qty
from sums x
join public.inventory_items i
  on i.brand_id=x.brand_id and i.id=x.inventory_item_id
left join public.inventory_stock_reconciliation r
  on r.brand_id=x.brand_id and r.inventory_item_id=x.inventory_item_id;

revoke all on public.ui_stock_recipe_combined_impact_v1 from public,anon;
grant select on public.ui_stock_recipe_combined_impact_v1 to authenticated,service_role;
comment on view public.ui_stock_recipe_combined_impact_v1 is
 'Combined all-product unposted SKU scenario after physical checkpoint. Draft BOM estimates and missing receipt/mapping not confirmed. Read-only, NEVER final inventory balance.';
