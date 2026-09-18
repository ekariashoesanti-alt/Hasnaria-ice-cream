# Executive Data Quality Rules

Executive reporting must never display false precision.

## COGS
The dashboard now exposes `cogs_coverage_pct`.
If not all sold units have a positive COGS:
- gross profit is NULL;
- gross margin is NULL;
- operating profit is NULL;
- Decision Center shows a data-quality alert.

## Inventory valuation
`inventory_cost_coverage_pct` shows how many inventory items have a known purchase unit cost.
Estimated inventory value must always be shown together with this coverage.

## Inventory tracking
Items without a physical stock-opname baseline remain `untracked` and produce a Decision Center warning.

## Freshness
Sales data older than one day creates a freshness warning; older than three days is critical.

This prevents the CEO dashboard from showing a misleading 100% margin or a falsely complete inventory valuation.
