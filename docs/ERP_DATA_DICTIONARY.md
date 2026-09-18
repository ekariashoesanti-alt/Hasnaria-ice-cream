# Hasnaria ERP Data Dictionary

Status: **LIVE RECONCILED BASELINE — 2026-09-18**.

This dictionary reflects the canonical structures verified in the live Hasnaria Supabase project. Existing legacy-compatible sources remain in place while new ERP modules are introduced additively.

## Identity & tenant

| Entity | Purpose | Status |
|---|---|---|
| brands | Business / tenant boundary | Canonical existing |
| outlets | Store/outlet under a brand | Canonical ERP |
| user_profiles | Identity, role, status, brand authority | Canonical authority |
| business_settings | Brand-scoped ERP thresholds/configuration | Canonical ERP |
| accounting_periods | Finance period open/close state | Canonical ERP |

Current Hasnaria default outlet: `MAIN / Hasnaria Main / Asia/Jakarta`.

## Master data

| Entity | Purpose |
|---|---|
| products | Product/menu master |
| inventory_items | Raw material / inventory item master |
| inventory_recipe_components | Product-to-stock recipe/BOM |
| suppliers | Supplier/vendor master |
| finance_accounts | Minimal chart of accounts |
| business_targets | KPI/Revenue target definitions |
| budgets | Period/category budget |

## Sales

| Entity / view | Purpose |
|---|---|
| sales | Canonical sales header |
| sale_items | Canonical sales detail |
| sales_import_batches | Existing normalized Majoo import provenance |
| import_jobs | Shared ERP import/provenance layer for future module migration |
| import_job_errors | Row/field validation errors |
| sales_daily_kpis | Daily revenue, trx, units, COGS coverage, margin |
| sales_anomaly_summary | Latest 7-day revenue comparison |

Sales remain brand-scoped today; outlet-level sales attribution is a future migration.

## Purchasing & AP

Lifecycle:

`Purchase Request → Approval → Purchase Order → Goods Receipt → Supplier Invoice → Payment`

| Entity / view | Purpose |
|---|---|
| purchase_requests | Procurement request header |
| purchase_request_items | Requested item/qty/value lines |
| approval_rules | Rule-driven routing |
| approval_requests | Approval queue |
| approval_history | Append-only approval decision history |
| purchase_orders | Supplier commitments |
| purchase_order_items | Ordered item/qty/price |
| goods_receipts | Receipt header |
| goods_receipt_items | Received quantities/cost |
| purchase_invoices | Supplier invoice/AP |
| purchase_payments | Supplier payment events |
| accounts_payable_aging | Outstanding invoice aging |
| supplier_spend_monthly | Monthly supplier spend |
| purchase_price_variance | Supplier/item price change |
| purchase_order_receipt_status | PO received-vs-ordered summary |

Legacy `offline_purchase_history` is retained as import/history source and is not deleted.

## Inventory

| Entity / view | Purpose |
|---|---|
| inventory_items | Inventory master |
| inventory_recipe_components | BOM/recipe |
| inventory_stock_opname | Physical count + system/physical variance |
| inventory_movements | Canonical movement ledger |
| inventory_ledger_balance | Latest physical baseline + post-baseline movement balance |
| inventory_stock_reconciliation | Existing proven reconciliation kept for parity |
| inventory_valuation_summary | Estimated inventory valuation + cost coverage |
| inventory_waste_summary | Waste trend relative to latest baseline |

Movement types:
- BASELINE
- PURCHASE_RECEIPT
- SALE_CONSUMPTION
- WASTE
- ADJUSTMENT
- TRANSFER_IN
- TRANSFER_OUT
- OPNAME_CORRECTION

Live reconciliation verified 101 inventory items with **0 mismatches** between the new ledger balance and existing reconciliation at verification time.

## Finance & cash

| Entity / view | Purpose |
|---|---|
| finance_accounts | Minimal COA |
| cash_sessions | Opening/closing cash + variance |
| payment_settlements | QRIS/transfer expected-vs-actual reconciliation |
| finance_daily_summary | Daily management P&L/cash movement summary |
| budget_vs_actual | Expense budget utilization |
| cash_position_summary | Latest closed cash per outlet |
| cash_reconciliation_summary | Cash-session detail |

COGS/profit reporting is guarded by `cogs_coverage_pct`. Incomplete costing returns NULL profit/margin instead of false precision.

## Executive & controls

| Entity / view | Purpose |
|---|---|
| audit_logs | Append-only critical business audit trail |
| exception_events | Persisted business exceptions |
| business_alerts | Dynamic sales/stock/waste/budget/price/approval/cash alerts |
| executive_kpi_snapshot | Reconciled management KPI snapshot |
| executive_dashboard_snapshot | CEO-ready snapshot incl. cash and decision counts |
| executive_decision_center | Action queue for approvals, stock, AP, alerts, data quality/freshness |

## Data ownership principles

- Every business row is brand-scoped.
- New operational entities use outlet scope when source data supports it.
- Critical mutations record actor/timestamps and use controlled RPCs/triggers.
- Imported data preserves provenance.
- Summary/KPI views never replace transaction truth.
- Browser/UI is never the security boundary; RLS/database controls are final.


## HR & workforce

| Entity / view | Purpose |
|---|---|
| employees | Employee master with optional linked app user |
| shift_templates | Reusable shift times |
| shift_roster | Employee schedule per date/outlet |
| attendance | Controlled check-in/out |
| leave_requests | Leave workflow integrated with generic approval |
| overtime_records | Overtime inputs |
| training_records | Training/compliance records |
| workforce_daily_kpis | Daily attendance/worked-hour productivity |
| payroll_input_summary | Attendance/overtime payroll inputs |
| workforce_mtd_summary | Executive workforce summary |

Employee/attendance/leave data is protected by self-or-HR RLS. Salary fields are not made broadly visible.

## Marketing & CRM

| Entity / view | Purpose |
|---|---|
| customers | Optional lightweight CRM customer master |
| marketing_campaigns | Campaign objective/channel/period/budget |
| campaign_metrics | Spend/reach/impression/engagement/click/lead metrics |
| promotions | Promotion registry and guardrails |
| sale_attributions | Single-touch sale-to-campaign/promo attribution |
| feedback_cases | Customer feedback/complaint workflow |
| marketing_campaign_performance | Spend, attributed revenue, ROAS and engagement |
| promotion_performance | Promotion attributed transactions/revenue |
| customer_repeat_summary | Repeat-customer indicator where customer identity exists |
| marketing_mtd_summary | Executive marketing summary |

Sales customer identity remains optional; walk-in POS transactions stay valid.
