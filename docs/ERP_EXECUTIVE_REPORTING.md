# Executive / Finance Reporting Backend

The backend now exposes reconciled management views for the future Owner/CEO dashboard.

## Core views

- `sales_daily_kpis`
- `finance_daily_summary`
- `inventory_valuation_summary`
- `executive_kpi_snapshot`
- `executive_decision_center`

## Executive snapshot

Current fields include:
- Revenue MTD
- Comparable prior-month MTD growth
- Revenue target / achievement
- Transactions and ATV
- COGS
- Gross profit and margin
- Operating expenses
- Operating profit
- Supplier payments
- Estimated inventory value + cost coverage
- Critical/reorder/untracked stock counts
- Pending approvals
- AP outstanding / overdue
- Sales data freshness

Inventory valuation is explicitly labeled estimated because items without a known purchase unit cost are valued at zero; `inventory_cost_coverage_pct` must be shown beside the value until coverage is high.

## Decision Center

Dynamic action queue combines:
- Pending approvals
- Critical/reorder stock
- Overdue supplier invoices

## Finance foundation

A minimal brand-scoped chart of accounts is seeded:
1000 Cash, 1100 Bank/QRIS, 1300 Inventory, 2000 AP, 3000 Equity, 4000 Sales, 5000 COGS, 6000 Opex.

This does not yet replace a future double-entry journal; it establishes management reporting and account taxonomy.
