# ERP Business Alert Rules

Unified view: `business_alerts`.

Rules currently implemented:
- SALES_DROP — 7-day revenue vs prior 7-day period, anchored on latest sales date.
- LOW_STOCK — inventory below PAR/minimum or critical.
- HIGH_WASTE — 7-day waste quantity as % of latest physical baseline.
- OVER_BUDGET — realized approved/recorded expense exceeds budget.
- PRICE_INCREASE — latest supplier/item unit price exceeds prior purchase price threshold.
- LATE_APPROVAL — pending approval exceeds SLA days.
- CASH_VARIANCE — persisted from cash closing.
- SETTLEMENT_VARIANCE — persisted from QRIS/transfer reconciliation.

Thresholds are brand-scoped in `business_settings`.

The Owner Decision Center consumes these alerts together with AP overdue and data-quality/freshness warnings.
