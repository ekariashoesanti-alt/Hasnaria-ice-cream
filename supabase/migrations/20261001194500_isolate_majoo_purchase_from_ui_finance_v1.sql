-- Majoo purchase uploads are retained as audit evidence/history only.
-- They must not appear in Purchase UI or flow into Finance/Stock downstream bridges.

create or replace view public.purchase_inventory_bridge
with (security_invoker=true)
as
select
  b.id,
  b.brand_id,
  b.source_period,
  b.source_file,
  b.row_no,
  b.purchase_date,
  b.item_name,
  b.quantity_text,
  b.unit_text,
  b.unit_price,
  b.total_amount,
  b.payment_method,
  b.notes,
  b.raw_data,
  b.created_at,
  b.canonical_loaded_at,
  b.normalized_item_name,
  b.quantity_numeric,
  coalesce(r.inventory_item_id,b.inventory_item_id) as inventory_item_id,
  b.inventory_match_count,
  case when r.id is not null then 'owner_review'::text else b.mapping_status end as mapping_status,
  b.derived_unit_cost,
  case when r.id is not null then (b.purchase_date is not null and b.quantity_numeric>0 and b.total_amount>0) else b.ready_for_inventory end as ready_for_inventory,
  b.expense_category,
  case when r.id is not null then b.quantity_numeric*r.qty_multiplier else b.inventory_qty end as inventory_qty,
  b.rule_type
from private.purchase_inventory_pre_review_v1 b
left join private.purchase_stock_reviews r
  on r.source_history_id=b.id
 and r.brand_id=b.brand_id
 and r.reverted_at is null
where coalesce(b.raw_data->>'canonical_source_type','') <> 'majoo';

update public.offline_purchase_history
set raw_data=coalesce(raw_data,'{}'::jsonb)||jsonb_build_object(
  'downstream_isolated',true,
  'isolated_from_purchase_ui',true,
  'isolated_from_finance',true,
  'isolation_reason','Majoo purchase evidence only'
)
where coalesce(raw_data->>'canonical_source_type','')='majoo';

update public.purchase_import_evidence
set raw_data=coalesce(raw_data,'{}'::jsonb)||jsonb_build_object(
  'downstream_isolated',true,
  'isolated_from_purchase_ui',true,
  'isolated_from_finance',true,
  'isolation_reason','Majoo purchase evidence only'
)
where source_type='majoo';

update public.finance_journal_entries e
set status='void',
    metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object(
      'void_reason','Majoo purchase isolated from Finance',
      'isolated_source_type','majoo'
    )
from public.offline_purchase_history h
where e.source_type='purchase_expense'
  and e.source_id=h.id
  and e.brand_id=h.brand_id
  and coalesce(h.raw_data->>'canonical_source_type','')='majoo'
  and e.status<>'void';

comment on view public.purchase_inventory_bridge is
  'Canonical purchase bridge for operational UI/Finance/Stock. Majoo source rows remain in evidence/history but are isolated downstream.';
