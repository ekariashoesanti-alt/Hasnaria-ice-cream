-- Exact pre-hotfix public.ui_finance_alerts view definition captured from Hasnaria production on 2026-10-18.
-- Schema-only rollback; preserves all transaction/opname/ledger records.
create or replace view public.ui_finance_alerts
with (security_invoker=true)
as
 WITH latest_purchase AS (
         SELECT DISTINCT ON (finance_purchase_sync_status_v1.brand_id) finance_purchase_sync_status_v1.brand_id,
            finance_purchase_sync_status_v1.period_month,
            finance_purchase_sync_status_v1.inventory_rows,
            finance_purchase_sync_status_v1.inventory_purchase_amount,
            finance_purchase_sync_status_v1.expense_rows,
            finance_purchase_sync_status_v1.canonical_purchase_expense,
            finance_purchase_sync_status_v1.purchase_review_rows,
            finance_purchase_sync_status_v1.purchase_review_amount,
            finance_purchase_sync_status_v1.journal_inventory_rows,
            finance_purchase_sync_status_v1.journal_inventory_amount,
            finance_purchase_sync_status_v1.journal_expense_rows,
            finance_purchase_sync_status_v1.journal_expense_amount,
            finance_purchase_sync_status_v1.sync_required,
            finance_purchase_sync_status_v1.refreshed_at
           FROM finance_purchase_sync_status_v1
          ORDER BY finance_purchase_sync_status_v1.brand_id, finance_purchase_sync_status_v1.period_month DESC
        ), latest_sales AS (
         SELECT DISTINCT ON (finance_sales_sync_status_v1.brand_id) finance_sales_sync_status_v1.brand_id,
            finance_sales_sync_status_v1.period_month,
            finance_sales_sync_status_v1.source_rows,
            finance_sales_sync_status_v1.source_amount,
            finance_sales_sync_status_v1.journal_rows,
            finance_sales_sync_status_v1.journal_revenue,
            finance_sales_sync_status_v1.sync_required,
            finance_sales_sync_status_v1.refreshed_at
           FROM finance_sales_sync_status_v1
          ORDER BY finance_sales_sync_status_v1.brand_id, finance_sales_sync_status_v1.period_month DESC
        ), latest_admin AS (
         SELECT DISTINCT ON (finance_administration_sync_status_v1.brand_id) finance_administration_sync_status_v1.brand_id,
            finance_administration_sync_status_v1.period_month,
            finance_administration_sync_status_v1.source_rows,
            finance_administration_sync_status_v1.source_amount,
            finance_administration_sync_status_v1.journal_rows,
            finance_administration_sync_status_v1.journal_amount,
            finance_administration_sync_status_v1.sync_required,
            finance_administration_sync_status_v1.refreshed_at
           FROM finance_administration_sync_status_v1
          ORDER BY finance_administration_sync_status_v1.brand_id, finance_administration_sync_status_v1.period_month DESC
        ), latest_purchase_period AS (
         SELECT finance_purchase_expense_bridge_v1.brand_id,
            max(finance_purchase_expense_bridge_v1.period_month) AS period_month
           FROM finance_purchase_expense_bridge_v1
          GROUP BY finance_purchase_expense_bridge_v1.brand_id
        ), prov AS (
         SELECT e.brand_id,
            e.period_month,
            count(*) AS provisional_entries
           FROM finance_journal_entries e
             JOIN latest_purchase_period p ON p.brand_id = e.brand_id AND p.period_month = e.period_month
          WHERE e.source_type = 'purchase_expense'::text AND e.status = 'provisional'::text
          GROUP BY e.brand_id, e.period_month
        )
 SELECT 10 AS sort_order,
    'warning'::text AS severity,
    'PURCHASE_SYNC_MISMATCH'::text AS alert_code,
    'Sinkronisasi Pembelian belum sesuai'::text AS title,
    'Data Pembelian canonical dan jurnal Keuangan periode terbaru belum identik.'::text AS message,
    'purchase_quality'::text AS target_section,
    jsonb_build_object('period_month', p.period_month, 'canonical_rows', p.inventory_rows + p.expense_rows + p.purchase_review_rows, 'journal_rows', p.journal_expense_rows) AS metadata
   FROM latest_purchase p
  WHERE p.sync_required
UNION ALL
 SELECT 20 AS sort_order,
    'warning'::text AS severity,
    'SALES_SYNC_MISMATCH'::text AS alert_code,
    'Sinkronisasi Penjualan belum sesuai'::text AS title,
    'Omzet Penjualan dan jurnal pendapatan Keuangan periode terbaru belum identik.'::text AS message,
    'sales_quality'::text AS target_section,
    jsonb_build_object('period_month', s.period_month, 'source_rows', s.source_rows, 'journal_rows', s.journal_rows, 'source_amount', s.source_amount, 'journal_revenue', s.journal_revenue) AS metadata
   FROM latest_sales s
  WHERE s.sync_required
UNION ALL
 SELECT 30 AS sort_order,
    'warning'::text AS severity,
    'ADMIN_SYNC_MISMATCH'::text AS alert_code,
    'Sinkronisasi Administrasi belum sesuai'::text AS title,
    'Transaksi Administrasi dan jurnal Keuangan periode terbaru belum identik.'::text AS message,
    'administration_quality'::text AS target_section,
    jsonb_build_object('period_month', a.period_month, 'source_rows', a.source_rows, 'journal_rows', a.journal_rows) AS metadata
   FROM latest_admin a
  WHERE a.sync_required
UNION ALL
 SELECT 40 AS sort_order,
    'warning'::text AS severity,
    'PURCHASE_PAYMENT_PROVISIONAL'::text AS alert_code,
    'Sumber pembayaran Pembelian belum final'::text AS title,
    concat(p.provisional_entries, ' jurnal Pembelian periode terbaru masih provisional dan perlu pemetaan sumber pembayaran.') AS message,
    'purchase_quality'::text AS target_section,
    jsonb_build_object('period_month', p.period_month, 'provisional_entries', p.provisional_entries) AS metadata
   FROM prov p
  WHERE p.provisional_entries > 0;

grant select on public.ui_finance_alerts to authenticated;
