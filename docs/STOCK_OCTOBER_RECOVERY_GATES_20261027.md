# October 2026 Stock Recovery — Verified Gates

Audit date: 2026-10-27. Scope: Hasnaria production (Supabase project `bnnhmtkpdjlgehsvgoda`). READ-ONLY source inspection; no balances, recipes or journals were changed.

## Current production facts
- 198 inventory master SKUs, 41 tracked by initial opname, 157 untracked.
- Reconciliation vs canonical ledger: **0 / 41 discrepancies**, verified with direct SQL equality (previous 23 mismatches have already been resolved).
- October: **484 sales / 1,035 sale_items**; `ui_stock_sales_link_audit_v1` reports **0 linked sale_items**, 1,035 unlinked, 0 eligible verified rows.
- 54 `product_recipe_verifications` are **draft**, 0 verified. Of 70 recipe-component rows, 67 are active; 58 active suggested and 9 active verified. Suggested ingredients must **not** be bulk promoted.
- `inventory_movements`: 8,590 total; 7,565 SALE_CONSUMPTION, 703 PURCHASE_RECEIPT, 194 OPNAME_CORRECTION, 128 BASELINE; **0 dated October**.
- Verified unit costs: 1/198 SKU (0.5%), provisional partial valuation Rp3,163,500; **not entire stock valuation**.
- The deployed Stock front end already reads `inventory_stock_reconciliation`, `ui_stock_sales_link_audit_v1`, `inventory_valuation_verified_summary`, and the FIFO moving RPC.

## Data-safe sequence (stop at every failed gate)
1. **Freeze automatic bulk posting** of historical sales and purchases. Do not change ledger or a recipe effective date simply to make dashboard numbers move.
2. Export secure, restorable snapshots of `inventory_movements`, `inventory_stock_opname`, `inventory_recipe_components`, `product_recipe_verifications`, `inventory_purchase_log`, `sales`, `sale_items`. Store outside the public repository and verify restore in isolated staging.
3. Per product, Owner must verify actual ingredients, amounts per sold unit, units/pack conversions, documentary evidence, effective date and potential historical adjustments. `suggested` does not mean verified.
4. For approved recipes only, use the existing authenticated Owner workflow (`resolve_product_recipe_verification_v2`), not a service-role bulk update. Existing sync routine checks BOTH recipe and all active component statuses, and reuses existing movements by sale_item/ingredient without duplicate posting.
5. Re-run month-specific link audit; confirm each eligible sale_item has movement rows and that rerunning produces no duplicates or drift. Reject unexpected quantities, dates, missing components or negative balances for investigation.
6. For purchases, `inventory_purchase_log` is the stock receipt source, not every finance/Purchase line. Confirm evidence of physical receipt and SKU/unit mapping; do not post receipt on Excel import alone.
7. For untracked 157 SKUs, capture a verified initial physical checkpoint through Owner-approved Opname workflow. Do not interpret missing baseline as zero physical stock.
8. Recompute valuation only as verified cost coverage expands; continue showing partial-coverage warning.

## Reproducible read-only release queries

```sql
-- Brand stock parity (must remain zero)
SELECT count(*) AS tracked_skus,
       count(*) FILTER (WHERE r.system_qty IS DISTINCT FROM l.ledger_qty) AS mismatch_skus
FROM public.inventory_stock_reconciliation r
JOIN public.inventory_ledger_balance l USING (brand_id,inventory_item_id)
WHERE r.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'
  AND r.tracking_active;

-- Unlinked sales and recipe readiness per month
SELECT period_month,sale_item_rows,linked_sale_item_rows,unlinked_sale_item_rows,
       eligible_verified_rows,no_recipe_rows,unverified_components_rows
FROM public.ui_stock_sales_link_audit_v1
WHERE brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'
  AND period_month=DATE '2026-10-01';

-- Recipe review queue; no component auto-verification
SELECT p.id AS product_id,p.name AS product,
       rv.status,rv.effective_from,
       count(c.id) FILTER (WHERE c.active) AS active_components,
       count(c.id) FILTER (WHERE c.active AND c.bom_status='verified') AS verified_components,
       count(c.id) FILTER (WHERE c.active AND c.bom_status<>'verified') AS unverified_components
FROM public.products p
LEFT JOIN public.product_recipe_verifications rv ON rv.product_id=p.id
LEFT JOIN public.inventory_recipe_components c ON c.product_id=p.id
WHERE p.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'
GROUP BY p.id,p.name,rv.status,rv.effective_from
ORDER BY unverified_components DESC, product;

-- October movement integrity (do not fabricate)
SELECT movement_type,count(*) AS rows
FROM public.inventory_movements
WHERE brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'
  AND movement_date>=DATE '2026-10-01' AND movement_date<DATE '2026-11-01'
GROUP BY movement_type;
```

## Release / rollback
- Release requires reviewed Owner BOM evidence, backup/restore proof, dry-run with synthetic staging data, no duplicate movement posting, correct month balances and production observation after release.
- Recovery: stop new sync/approval writes, inspect audit log and source keys, restore only from independently verified snapshots under change control. Never delete historical movements merely to silence a reconciliation warning.
- **Current decision: posting blocked by business verification, not an unresolved code deploy.** This read-only runbook does not attest that October stock has been repaired.
