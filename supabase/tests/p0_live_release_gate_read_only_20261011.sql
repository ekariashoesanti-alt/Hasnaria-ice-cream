-- Hasnaria P0 release preflight: READ ONLY; safe to run against production.
-- Prepared for controlled Owner/Staff acceptance. Does not post Stock, modify
-- Finance or grant roles. Month is fixed at September 2026 baseline.
-- Reference: docs/OWNER_PURCHASE_UNIT_ATTESTATION_STAGE4_2026-10-11.md
-- Readiness flags are NOT permission to deploy without restorable backup/UAT.

-- 1. Canonical Purchase / Finance / Sales high-integrity baseline.
select
  f.brand_id,
  f.period_month,
  f.purchase_rows as canonical_purchase_count,
  f.purchase_amount as canonical_purchase_amount,
  f.journal_rows as purchase_journal_count,
  f.journal_purchase_expense,
  f.purchase_journal_delta,
  f.journal_balance_delta,
  f.stock_posted_rows as historical_stock_posted,
  f.stock_ready_rows as stock_pending_unit,
  f.stock_review_rows as stock_mapping_review,
  f.non_stock_rows,
  f.finance_link_status,
  f.stock_link_status,
  case when f.purchase_journal_delta=0 and f.journal_balance_delta=0
       and f.finance_link_status='MATCH'
       then 'PASS_FINANCE_PARITY' else 'FAIL_FINANCE_REVIEW' end as finance_gate,
  s.source_rows as sales_source_count,
  s.journal_rows as sales_journal_count,
  s.sync_required as sales_sync_required
from public.finance_purchase_reconciliation_monthly_v1 f
left join public.finance_sales_sync_status_v1 s
  on s.brand_id=f.brand_id and s.period_month=f.period_month
where f.period_month=date '2026-09-01';

-- 2. Pending canonical Purchase rows separated by last physical stock count.
-- IMPORTANT: this is not a command to post the 18 pre-opname or 7 no-baseline
-- receipts. This is a list of documentary Owner approvals still required.
with pending as (
  select b.brand_id,b.id as source_id,b.inventory_item_id,b.total_amount,
         b.quantity_numeric,b.unit_text,
         case
           when r.last_opname_date is null then 'NO_PHYSICAL_BASELINE'
           when b.purchase_date<=r.last_opname_date then 'PRE_OR_ON_OPNAME'
           else 'POST_OPNAME'
         end as opname_relation
  from public.purchase_inventory_bridge b
  join public.inventory_items i on i.id=b.inventory_item_id
                               and i.brand_id=b.brand_id
  left join public.inventory_stock_reconciliation r
    on r.brand_id=b.brand_id and r.inventory_item_id=b.inventory_item_id
  where b.source_period=date '2026-09-01'
    and b.ready_for_inventory
    and b.mapping_status in ('exact_name','inventory_alias')
    and coalesce(b.quantity_numeric,0)>0
    and coalesce(b.total_amount,0)>0
    and not exists(
      select 1 from public.inventory_purchase_log l
      where l.brand_id=b.brand_id and l.source_history_id=b.id
    )
)
select opname_relation,count(*) pending_rows,
       sum(total_amount) pending_purchase_value,
       count(distinct inventory_item_id) pending_skus,
       count(*) filter(where nullif(btrim(coalesce(unit_text,'')),'') is null)
         missing_source_unit_rows
from pending group by opname_relation
order by opname_relation;

-- 3. Historical source integrity / physical stock baseline.
-- When has_opname=true, pre-/post-opname categorization determines whether
-- the historical receipt could impact the displayed stock view.
with orphan as (
 select l.id,l.brand_id,l.inventory_item_id,l.purchase_date,
        r.last_opname_date,coalesce(r.tracking_active,false) as has_opname
 from public.inventory_purchase_log l
 left join public.offline_purchase_history h
   on h.id=l.source_history_id and h.brand_id=l.brand_id
 left join public.inventory_stock_reconciliation r
   on r.inventory_item_id=l.inventory_item_id and r.brand_id=l.brand_id
 where l.source_history_id is not null and h.id is null
)
select count(*) orphan_receipt_count,
       count(*) filter(where has_opname and purchase_date<=last_opname_date)
         orphan_before_or_on_opname,
       count(*) filter(where has_opname and purchase_date>last_opname_date)
         orphan_after_opname,
       count(*) filter(where not has_opname) orphan_without_baseline
from orphan;

-- 4. No Stage 4 Owner evidence workflow or P0 posting trigger should already
-- be active on production while PR #88 is Draft. Flip expectations as part
-- of approved release and keep audit reporting read-only throughout.
select
 (select count(*) from information_schema.tables
  where table_schema='private' and table_name='purchase_unit_attestations_v1')
   as owner_unit_table_live,
 (select count(*) from pg_trigger
  where tgrelid='public.inventory_purchase_log'::regclass
    and tgname='guard_purchase_receipt_delete_v1')
   as receipt_delete_guard_live,
 (select count(*) from pg_views
  where schemaname='private' and viewname='inventory_receipt_lineage_triage_v1')
   as private_orphan_triage_view_live;
