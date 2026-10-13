-- HSN P0 #2: private, read-only risk classification for SKU master units,
-- purchase source unit and conversion rules. No business writes, no guessing.
-- Keep placeholders, draft conversions and duplicate rules visible for review.
create or replace view private.inventory_unit_conversion_triage_v1
with (security_invoker = true)
as
with grouped as (
 select c.brand_id,c.inventory_item_id,
        lower(btrim(c.purchase_unit)) as normalized_purchase_unit,
        lower(btrim(c.sale_unit)) as normalized_sale_unit,
        count(*)::bigint as rule_count,
        count(*) filter(where c.status='verified')::bigint as verified_count,
        count(*) filter(where c.status<>'verified')::bigint as not_verified_count,
        count(distinct c.units_per_purchase_unit)::bigint as distinct_factors,
        min(c.units_per_purchase_unit) as smallest_factor,
        max(c.units_per_purchase_unit) as largest_factor
 from public.inventory_unit_conversions c
 group by c.brand_id,c.inventory_item_id,
          lower(btrim(c.purchase_unit)),lower(btrim(c.sale_unit))
)
select g.*, i.item_name as sku_name,i.unit as master_unit,
       (g.normalized_sale_unit is distinct from lower(btrim(coalesce(i.unit,''))))
          as master_sale_unit_conflict,
       (g.rule_count>1) as duplicate_rule_key,
       (g.verified_count>1) as duplicate_verified_rule,
       (g.distinct_factors>1) as contradicting_factors,
       (g.normalized_purchase_unit=g.normalized_sale_unit
            and (g.smallest_factor<>1 or g.largest_factor<>1)) as same_unit_bad_factor,
       case
         when i.id is null or nullif(btrim(coalesce(i.unit,'')),'') is null
             or lower(btrim(i.unit))='purchase_unit'
           then 'BLOCK_MASTER_UNIT_PLACEHOLDER'
         when g.normalized_sale_unit is distinct from lower(btrim(i.unit))
           then 'BLOCK_MASTER_SALE_UNIT_CONFLICT'
         when g.verified_count>1 or g.distinct_factors>1
           then 'BLOCK_DUPLICATE_OR_CONTRADICTING_FACTORS'
         when g.normalized_purchase_unit=g.normalized_sale_unit
               and (g.smallest_factor<>1 or g.largest_factor<>1)
           then 'BLOCK_SAME_UNIT_NOT_ONE'
         when g.rule_count>1 then 'REVIEW_DUPLICATE_UNVERIFIED_RULES'
         when g.verified_count=1 and g.rule_count=1
              and g.smallest_factor>0 then 'VERIFIED_MASTER_ALIGNED'
         else 'REVIEW_UNVERIFIED_CONVERSION'
       end as verification_gate
from grouped g
left join public.inventory_items i
  on i.brand_id=g.brand_id and i.id=g.inventory_item_id;

comment on view private.inventory_unit_conversion_triage_v1 is
 'Private audit only: detects duplicate conversion rules, placeholder master units, sales unit/master contradictions and unverified factors; no auto-validation.';

create or replace view private.purchase_unit_mapping_gate_v1
with (security_invoker = true)
as
select b.brand_id,b.source_period,b.id as purchase_source_id,b.purchase_date,
       b.item_name as source_item_name,b.mapping_status,b.rule_type,
       b.inventory_item_id,i.item_name as mapped_sku_name,
       i.unit as stock_master_unit,b.unit_text as canonical_source_unit,
       b.quantity_numeric as source_qty,b.inventory_qty as bridge_qty_unverified,
       b.total_amount as purchase_amount,
       (l.id is not null) as already_posted,
       case
         when not b.ready_for_inventory then 'BLOCK_SOURCE_MAPPING_OR_QTY'
         when i.id is null then 'BLOCK_SKU_UNKNOWN'
         when nullif(btrim(coalesce(i.unit,'')),'') is null
              or lower(btrim(i.unit))='purchase_unit'
           then 'BLOCK_MASTER_UNIT_PLACEHOLDER'
         when x.master_conflict_count>0 then 'BLOCK_MASTER_UNIT_CONFLICT'
         when x.verified_bad_count>0 then 'BLOCK_CONVERSION_CONFLICT'
         when nullif(btrim(coalesce(b.unit_text,'')),'') is null
           then 'REVIEW_MISSING_PURCHASE_UNIT'
         when lower(btrim(b.unit_text))=lower(btrim(i.unit))
           then 'SAME_UNIT_FACTOR_ONE_ONLY'
         when x.verified_matching_count=1
           then 'VERIFIED_CONVERSION_MATCH_REVIEW'
         else 'REVIEW_CONVERSION_NOT_VERIFIED'
       end as unit_mapping_gate,
       x.conversion_rule_count,
       x.unverified_count,
       x.duplicate_keys,
       x.master_conflict_count,
       x.verified_matching_count,
       x.verified_bad_count
from public.purchase_inventory_bridge b
left join public.inventory_items i
 on i.id=b.inventory_item_id and i.brand_id=b.brand_id
left join public.inventory_purchase_log l
 on l.source_history_id=b.id and l.brand_id=b.brand_id
left join lateral (
 select count(*)::bigint as conversion_rule_count,
        coalesce(sum(t.not_verified_count),0)::bigint as unverified_count,
        count(*) filter(where t.duplicate_rule_key)::bigint as duplicate_keys,
        count(*) filter(where t.master_sale_unit_conflict)::bigint as master_conflict_count,
        count(*) filter(where t.verification_gate like 'BLOCK_%')::bigint as verified_bad_count,
        count(*) filter(where t.verification_gate='VERIFIED_MASTER_ALIGNED'
         and t.normalized_purchase_unit=lower(btrim(coalesce(b.unit_text,'')))
         and t.normalized_sale_unit=lower(btrim(coalesce(i.unit,''))))::bigint
          as verified_matching_count
 from private.inventory_unit_conversion_triage_v1 t
 where t.brand_id=b.brand_id and t.inventory_item_id=b.inventory_item_id
) x on true;

comment on view private.purchase_unit_mapping_gate_v1 is
 'Read-only Purchase→Stock mapping/satuan gate. Null purchase units, placeholder master unit and mismatched verified conversion block auto posting; no stock or journal changes.';

revoke all on private.inventory_unit_conversion_triage_v1,
              private.purchase_unit_mapping_gate_v1
 from public,anon,authenticated;
