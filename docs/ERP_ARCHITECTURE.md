# Hasnaria ERP — Architecture Baseline

## Goal
Menjadi referensi teknis untuk evolusi dari app operasional saat ini ke ERP modular tanpa big-bang rewrite.

## Existing canonical assets
- `public.brands`: tenant/business scope existing.
- `public.user_profiles`: authority identity/role/status/brand.
- `public.products`: product master existing.
- `public.sales` + sale detail/import foundations: sales ledger existing.
- `public.expenses`: expense/approval baseline.
- `public.daily_metrics`: legacy/summary metrics; jangan jadikan sole accounting truth.
- `public.offline_purchase_history`: purchase import history/staging baseline.
- `public.inventory_items`, `inventory_purchase_log`, `inventory_recipe_components`, `inventory_stock_opname`, `inventory_stock_reconciliation`: inventory baseline.

## Evolution principles
1. **Additive first** — tambah canonical tables/services, migrate data, reconcile, baru retire legacy.
2. **Raw ≠ normalized** — file/raw row disimpan untuk provenance, transaction normalized untuk ERP.
3. **Ledger before summary** — stock/finance summary berasal dari movement/transaction ledger, bukan editable totals.
4. **Database authority** — approval limits, role constraints, idempotency, close locks ditegakkan server/database.
5. **Multi-outlet ready** — semua transaksi baru yang relevan memiliki `outlet_id`, walau awalnya hanya satu outlet.
6. **Traceability** — KPI harus dapat drill-down ke transaksi sumber.

## Target domain tables

### Foundation
- outlets
- business_settings
- units_of_measure
- suppliers
- customers
- import_jobs / import_job_errors

### Purchasing
- purchase_requests
- purchase_request_items
- purchase_orders
- purchase_order_items
- goods_receipts
- goods_receipt_items
- purchase_invoices
- purchase_payments

### Inventory
- inventory_movements (canonical movement ledger)
- existing inventory_items / recipe components / opname retained and migrated

### Finance
- accounts (minimal COA)
- cash_sessions
- settlements
- accounts_payable / supplier payments
- bank_import_batches / bank_transactions
- budgets

### HR
- employees
- shift_templates / shift_roster
- attendance
- leave_requests
- overtime
- payroll_inputs

### Marketing
- campaigns
- campaign_metrics
- promotions
- feedback_cases

### Controls
- approval_rules
- approval_requests
- approval_history
- audit_logs
- exception_events
- automation_runs

## Scope model
Current tenant boundary remains `brand_id`. Introduce `outlets` as child of brand:
`brands 1 → N outlets`.

Existing rows without outlet remain valid during migration. New canonical modules should accept outlet where operationally relevant.

## RLS policy pattern
- pending: no business data.
- active same-brand: read only if domain allows.
- write via capability function, not repeated ad-hoc role strings.
- Owner-only settings/authority mutation.
- audit log: append-only through controlled function/trigger.
- financial close: mutations denied after period close except controlled reopen.

## Import pattern
`file selected → local parse → validation summary → import_jobs row → staging/raw rows → transactional upsert/post → reconciliation → completed`.

Every final transaction imported from file stores batch/provenance reference or equivalent trace.

## Posting patterns
- Goods receipt posts inventory movement.
- Sales posts recipe consumption movement.
- Waste/adjustment posts explicit inventory movement.
- Purchase invoice posts AP.
- Payment posts AP settlement/cash movement.
- Cash session closes against expected payment totals.

Posting must be idempotent by source/entity key.

## CEO KPI contract
Every executive KPI must define:
- numerator/denominator;
- included statuses;
- date field and timezone;
- outlet scope;
- freshness timestamp;
- drill-down query/source.

No narrative insight may assert a cause unless the underlying data supports it.
