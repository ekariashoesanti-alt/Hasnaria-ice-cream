# Sales ERP Maturation

## Outlet scope
`sales.outlet_id` and `sales_import_batches.outlet_id` are now available. Existing Hasnaria history was backfilled to the current MAIN outlet. When a brand has exactly one active outlet, new sales/batches default to it automatically.

Cash close and QRIS/transfer settlement calculations are now outlet-specific.

## Analytics views
- `sales_daily_outlet_kpis`
- `sales_payment_method_daily`
- `sales_product_performance`
- `sales_channel_mix_monthly`
- `sales_target_performance`
- `sales_import_reconciliation`

COGS-dependent profit fields remain NULL when item COGS coverage is incomplete.

## Import rollback
`rollback_sales_import_batch(batch_id, reason)`:
- Owner/Head Store only;
- reason required;
- completed batches only;
- refuses rollback if included transactions are inside a closed accounting period;
- cascades sale-item removal and inventory consumption cleanup;
- records audit history;
- marks batch `rolled_back`.

This makes import correction explicit instead of silently replacing transaction history.
