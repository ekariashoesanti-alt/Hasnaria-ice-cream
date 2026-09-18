# Hasnaria ERP Data Dictionary — Baseline

Status: **REVIEW**. This is the first canonical dictionary pass and must be reconciled with live Supabase before HSN-116 is DONE.

## Existing canonical / retained

| Entity | Purpose | ERP direction |
|---|---|---|
| brands | Business/tenant boundary | Retain as current organization boundary |
| user_profiles | Identity, role, status, brand authority | Retain as authority source |
| products | Product/menu master | Retain and extend only through migrations |
| sales | Sales transaction header | Retain as canonical sales header |
| sale_items | Sales detail | Retain as canonical sales detail |
| sales_import_batches | Sales import provenance | Generalize pattern into import_jobs |
| expenses | Operating expense + approval baseline | Retain while Finance ledger is introduced |
| daily_metrics | Legacy daily summary | Keep for compatibility; do not make sole accounting truth |
| offline_purchase_history | Purchase import history/raw normalized rows | Use as staging/history while procurement tables are introduced |
| inventory_items | Inventory item master | Retain |
| inventory_purchase_log | Existing stock purchase movement source | Migrate toward canonical inventory_movements |
| inventory_recipe_components | Product-to-stock recipe/BOM | Retain |
| inventory_stock_opname | Physical stock count and variance | Retain |
| inventory_stock_reconciliation | Theoretical stock view | Retain until canonical movement ledger supersedes it |
| social_contents | Shared legacy shift/HR/marketing storage | Migrate domain-by-domain; do not expand new ERP features into this table |

## Foundation entities

### outlets
Child of brand. One brand may have multiple outlets. Current app can continue brand-only until each module receives outlet_id.

Core fields:
- id
- brand_id
- code
- name
- timezone
- active
- created_by
- created_at
- updated_at

### import_jobs
Planned canonical batch header for Sales, Purchasing, Bank and future imports.

Core fields:
- id
- brand_id
- outlet_id nullable
- module
- source_file
- file_hash
- status
- rows_total
- rows_valid
- rows_failed
- created_by
- created_at
- completed_at
- error_summary jsonb

### suppliers
Planned vendor master used by procurement/AP.

### customers
Lightweight optional customer master; not mandatory for every sale.

### units_of_measure
Canonical unit definitions and future conversion factors.

## Transaction entities planned

### Purchasing
purchase_requests → purchase_orders → goods_receipts → purchase_invoices → purchase_payments.

### Inventory
inventory_movements becomes canonical movement ledger:
- OPENING
- PURCHASE_RECEIPT
- SALE_CONSUMPTION
- WASTE
- ADJUSTMENT
- TRANSFER_IN
- TRANSFER_OUT
- OPNAME_CORRECTION

### Finance
cash_sessions, settlements, accounts_payable, bank_transactions, budgets, period_close.

### HR
employees, shift_roster, attendance, leave_requests, overtime, payroll_inputs.

### Marketing
campaigns, campaign_metrics, promotions, feedback_cases.

### Controls
approval_rules, approval_requests, approval_history, audit_logs, exception_events, automation_runs.

## Data ownership principles

- Every business row has a brand scope.
- Operational transaction rows should gain outlet scope when applicable.
- Critical rows store actor and timestamps.
- Imported rows preserve source batch/file/row identity.
- Summary/KPI tables never replace transaction truth.
- RLS is the security boundary; frontend visibility is only UX.
