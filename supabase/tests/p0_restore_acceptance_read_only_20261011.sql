-- HSN P0 stage0: read-only restore acceptance measurements.
-- Execute once on production immediately before taking the dump and again
-- on a SEPARATE restored test project. Compare counts and audit checksum.
-- Never run pg_restore, CREATE, DELETE or UPDATE against production.
-- Presence and cardinality do not prove a real signed-in Owner/Staff can log in.
with counts as (
 select
   (select count(*) from auth.users)::bigint auth_users,
   (select count(*) from auth.identities)::bigint auth_identities,
   (select count(*) from storage.buckets)::bigint storage_buckets,
   (select count(*) from storage.objects)::bigint storage_objects,
   (select count(*) from supabase_migrations.schema_migrations)::bigint migration_history,
   (select count(*) from public.inventory_items)::bigint inventory_items,
   (select count(*) from public.inventory_purchase_log)::bigint receipt_rows,
   (select count(*) from public.inventory_movements
      where movement_type='PURCHASE_RECEIPT')::bigint receipt_movements,
   (select count(*) from public.offline_purchase_history)::bigint purchase_history,
   (select count(*) from public.purchase_import_evidence)::bigint invoice_evidence,
   (select count(*) from public.inventory_stock_opname)::bigint stock_opname,
   (select count(*) from public.inventory_unit_conversions)::bigint conversion_rules,
   (select count(*) from public.inventory_unit_conversions
      where status='needs_verification')::bigint draft_conversions,
   (select count(*) from public.inventory_unit_conversions
      where status='verified')::bigint verified_conversions,
   (select count(*) from public.inventory_items
      where lower(btrim(coalesce(unit,'')))='purchase_unit')::bigint placeholder_skus,
   (select count(*) from public.inventory_purchase_log l
      left join public.offline_purchase_history p
      on p.brand_id=l.brand_id and p.id=l.source_history_id
      where l.source_history_id is not null and p.id is null)::bigint orphan_receipts
)
select current_timestamp as measured_at_utc, c.*,
       case when c.auth_users=0 then 'BLOCK_AUTH_NOT_RESTORED'
            when c.auth_identities<c.auth_users then 'REVIEW_AUTH_IDENTITIES'
            else 'AUTH_COUNTS_PRESENT_LOGIN_STILL_REQUIRED' end as auth_gate,
       case when c.migration_history=0 then 'BLOCK_MIGRATION_HISTORY_MISSING'
            else 'MIGRATION_HISTORY_PRESENT_COMPARE_SOURCE' end as migration_gate,
       case when c.receipt_rows<>c.receipt_movements then 'BLOCK_RECEIPT_MOVEMENT_COUNTS'
            else 'RECEIPT_COUNTS_MATCH_VERIFY_PER_ROW' end as receipt_gate,
       'NOT_A_FULL_BACKUP_OR_LIVE_AUTH_UAT'::text as acceptance_note
from counts c;

-- Finance counters must be equal on restored DB for the same period. Check
-- this IN ADDITION to data row counts and the six-table checksum snapshot.
select f.period_month,
       f.purchase_rows,f.purchase_amount,
       f.journal_rows,f.journal_purchase_expense,
       f.purchase_journal_delta,f.journal_balance_delta,
       f.finance_link_status,
       s.source_rows as sale_sources,
       s.journal_rows as sale_journals,
       s.sync_required as sale_sync_required
from public.finance_purchase_reconciliation_monthly_v1 f
left join public.finance_sales_sync_status_v1 s
 on s.brand_id=f.brand_id and s.period_month=f.period_month
where f.period_month=date '2026-09-01';
