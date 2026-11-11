# HASNARIA — Stock Recovery Stage 0–1 (P0, read-only)

**As-of audit:** 12 Nov 2026 WIB. **Production Supabase:** `bnnhmtkpdjlgehsvgoda`.
**Branch scope:** read-only visibility, reconciled source status, audit/runbook; **no ledger writes, BOM approvals, DB migrations, cron or historical backfill**.

## Why this gate exists

Sales → stock is implemented through `sale_items` + verified/effective BOM → `SALE_CONSUMPTION` movements. Purchase → stock is implemented via reviewed `inventory_purchase_log` / receipt → `PURCHASE_RECEIPT`. A successful trigger does not prove the external transaction source made it into the ledger. The old Stock modal displayed `ready_for_inventory` as if ready purchases were already received; the UI now uses the canonical `inventory_purchase_backfill_audit_p5_v1.backfill_status` categories.

## Baseline on 12 Nov, from live production queries

| Signal | Observed | Interpretation |
| --- | ---: | --- |
| Master SKU | 198 | Not all have physical opening checkpoints |
| SKU tracked from opname | 41 | Physical checkpoints exist |
| SKU provisional / untracked | 157 | Must not be represented as physical stock |
| Ledger movements | 8,590 | Includes historical baseline/adjustment |
| Negative SKU balances | 7 | Require unit/source review, not automatic zeroing |
| Product recipe verification drafts | 54 | No product-level approved BOM |
| Active component-level BOM | 67 (9 verified, 58 suggested) | Component approval does not replace product approval |
| October sale-item rows | 1,823 | 0 linked to stock as of this audit |
| October purchases imported | 57 | No October purchase ledger movement |
| October purchase READY_NOT_POSTED | 27 | Technical mapping only; confirm received goods |
| October purchase REVIEW | 26 | 14 unmatched + 12 alias/quantity issues |
| October purchase NON_STOCK | 4 | Exclude from inventory until separately justified |
| September purchase READY_NOT_POSTED | 3 | Must be reconciled, not reimported blindly |
| Latest sale source | 31 Oct 2026 | November source not present |
| Latest purchase import | 6 Oct 2026 | October coverage incomplete |

Source data: `sales`, `sale_items`, `product_recipe_verifications`, `inventory_recipe_components`, `inventory_movements`, `inventory_stock_reconciliation`, `purchase_inventory_bridge`, `inventory_purchase_backfill_audit_p5_v1`, `ui_stock_sales_link_audit_v1`. **A source row and its bridge view row are the same event, never two events.**

## Stage 0 — freeze the evidence, not the business

1. Run `supabase/manual/hsn_stock_recovery_stage0_readonly.sql` in a trusted authorized SQL editor, scoped to the Hasnaria brand. Script uses `BEGIN ... READ ONLY` and contains only SELECTs.
2. Archive query results and the as-of timestamp in protected operational storage, not as a public file, repo commit, or UI/API response. Never export customer identifiers here.
3. Preserve **source file identity, row number, sale_item ID, SKU, UOM, opname checkpoint date, effective BOM date** and existing ledger source keys for comparison. Do not mutate these records.
4. Capture the current production deployment, commit and relevant schema versions before any future write-stage.
5. Establish a restore procedure that can reconstruct prior stock position; a UI code rollback alone does **not** reverse ledger entries. For any future pilot, require a documented **compensating ledger reconciliation**, audit trail, and Owner approval.

**Go/No-Go:** no unexpected duplicate source keys; no missing proof explained away as zero; no implicit receipt recognized just because a purchase was imported.

## Stage 1 — source classification (implemented read-only)

In the existing Owner **Stok → Audit Integrasi** view (inside Periksa Hitungan):
- `POSTED` and `POSTED_LEGACY_SOURCE`: included as **posted** (verify old-source linkage separately).
- `READY_NOT_POSTED`: eligible for review only; **does not imply a physical receipt**.
- `REVIEW`: missing SKU, unit-conversion evidence, or unresolved source classification.
- `NON_STOCK`: costs excluded from inventory; never included in stock receipts.
- Unknown statuses: flagged as review rather than silently treated as ready.
- Sales-linked and awaiting-BOM counts remain period- and brand-scoped, **read-only**, only loaded when Owner opens Audit Integrasi; first-render charts unchanged.

**Go/No-Go:** for each monthly purchase source, `posted + ready_not_posted + review + nonstock = distinct imported source rows`. For sales, `linked + unlinked = source sale item rows`. Historical reconciliation must use stable source IDs and prevent duplicates.

## Following stages (not authorized by this PR)

- **2A Purchase:** validate receipt evidence and units for 27 Oct ready / 26 review, plus 3 Sep pending. No bulk approval.
- **2B BOM:** validate 153 recipe import lines, 54 draft products, effective dates and 58 suggested components. Prioritize top 10 products (981/1,823 Oct sold units). Beware: product verification calls historical usage and COGS recalculation.
- **3 Dry run:** produce per-SKU simulated before/after with dates, units, duplicate detection and same-day opname ambiguity, never mutate live ledger.
- **4 Pilot staging:** controlled small batch; compare exact effects including idempotent replay, compensation procedure and verified receipt proof. Only after Owner approval should posting be enabled.
- **5 Production:** staged posting with monitored gate and a daily coverage check including source completeness, not only post-ledger trigger health.

## Rollback

Frontend only: revert Stock audit classification change or redeploy previous READY Vercel commit. The new SQL runbook does not execute writes or migrations. Never "fix" missing stock by making up purchases or approving all recipes. If a source read fails, the audit must show an unavailable state rather than zero events.
