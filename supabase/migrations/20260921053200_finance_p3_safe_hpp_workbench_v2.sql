-- Finance P3: safe HPP workbench + security cleanup
-- Applied to Supabase production on 2026-09-21.

alter view public.finance_purchase_expense_bridge_v1 set (security_invoker=true);

create or replace function public.get_finance_monthly_reconciliation_v1(p_brand uuid)
returns setof public.finance_monthly_reconciliation_v1
language sql stable security invoker set search_path=''
as $$
 select v.* from public.finance_monthly_reconciliation_v1 v
 where v.brand_id=p_brand and private.same_brand(p_brand)
 order by v.period_month;
$$;

create or replace view public.finance_hpp_cost_evidence_v2
with (security_invoker=true) as
with movement_candidates as (
  select m.brand_id,m.inventory_item_id,m.unit_cost,m.movement_date as effective_from,m.created_at as verified_at,
         'verified_movement'::text cost_source,
         case when m.reference_type='inventory_purchase_log' then coalesce(l.mapping_method,'purchase') else coalesce(m.reference_type,'movement') end source_reference
  from public.inventory_movements m
  join public.inventory_items i on i.id=m.inventory_item_id
  left join public.inventory_purchase_log l on m.reference_type='inventory_purchase_log' and l.id=m.reference_id
  where m.unit_cost>0 and m.movement_date<=current_date
    and (coalesce(m.reference_type,'')<>'inventory_purchase_log'
      or l.mapping_method in ('verified_1to1_unit','recognized_purchase_unit','auto_exact_name_same_unit_v1')
      or (l.mapping_method='pack_unit_needs_conversion' and lower(coalesce(i.unit,''))='pack'))
), manual_candidates as (
  select brand_id,inventory_item_id,unit_cost,effective_from,verified_at,'manual_verified_cost'::text cost_source,source_reference
  from public.inventory_cost_verifications where effective_from<=current_date
), all_candidates as (
  select * from movement_candidates union all select * from manual_candidates
)
select distinct on (brand_id,inventory_item_id)
 brand_id,inventory_item_id,unit_cost,effective_from,verified_at,cost_source,source_reference
from all_candidates
order by brand_id,inventory_item_id,effective_from desc,
 case when cost_source='manual_verified_cost' then 0 else 1 end,verified_at desc;

create or replace view public.finance_hpp_verification_queue_v2
with (security_invoker=true) as
select q.*,
 case
  when q.blocker_reason='missing_product_mapping' then 'Map produk sumber penjualan ke master produk'
  when q.blocker_reason='missing_recipe' then 'Definisikan komponen recipe dan kuantitas per penjualan'
  when q.blocker_reason='recipe_unverified' then 'Review recipe lalu verifikasi dengan tanggal efektif'
  when q.blocker_reason='missing_component_cost' then 'Lengkapi biaya/satuan komponen yang dapat diaudit'
  else q.required_action
 end verification_instruction
from public.finance_hpp_blocker_queue_v1 q;

grant select on public.finance_hpp_cost_evidence_v2,public.finance_hpp_verification_queue_v2 to authenticated;
