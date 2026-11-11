# HSN-2A–2B: Owner review backlog & pre-post validation

**Status:** implemented as read-only triage; **not** authorized to post historical stock, verify a BOM, adjust HPP, or approve receipts.

## Production observations at audit time (12 November 2026)

- October purchase bridge: 57 distinct source rows, and **all 57 source unit fields are empty**. Of these, 27 have status `READY_NOT_POSTED`, 26 `REVIEW`, 4 `NON_STOCK`. All 27 "ready" still require evidence of physical receipt and item-level source/stock unit validation. September has 3 further ready-not-posted rows.
- October recipe review: 54 products, with **41 component_pending**, **7 missing_bom**, **6 product_approval_pending**. These categories are product counts; they should total 54, not 1,823 sale-item rows.
- Raw recipe upload: 153 ingredient rows across 56 distinct source product names, all matching product names under case-folded normalization. 45 names map to products with draft verification; **11 lack a verification record**. Name match alone does not authorize approval.
- Historical sale items in October: 1,823, 0 consumption postings. Existing historical `SALE_CONSUMPTION` stops at September.
- Inventory unit conversions: 25 `needs_verification`, 3 `verified`.
- 7 SKU balances negative; zero cannot be assumed to be correct.

## What changes in Owner UI

The existing `Stok → Detail Stok → Audit Integrasi` modal now loads 3 existing `security_invoker` sources **only when opened**: monthly sale-link audit, purchase-source ledger-backfill audit, and monthly recipe review. Two collapsed priority sections appear **inside the modal**, not on the main one-view dashboard:

1. `Prioritas Pembelian`: at most 12 source rows with missing source-unit warning, pending-vs-review classification, SKU mapping hint and link to existing Pembelian tab.
2. `Prioritas Resep/BOM`: at most 12 products sorted by month sale rows, showing verified/active component counts and status; link to existing Cek Resep Produk workflow.

If one source fails, report its failure rather than treating missing data as zero. Do not show any "Approve all" or "Post all" action in this audit. Upload/reupload remains idempotency-sensitive.

## Safe rollout order after triage

**2A (Purchase):** confirm packaging, original UOM, conversion to SKU base unit, supplier/receipt evidence and stock-relevant classification for each candidate. Status READY is not receipt. Exclude non-stock costs. Check existing ledger by source id AND legacy file-row identity before any future posting. Review historical September 3 READY_NOT_POSTED separately.

**2B (BOM):** inspect the import 153 recipe lines and compare to 54 active sold products. Confirm source units, SKU ingredient, yield/conversion, per-sale qty, and owner evidence. Priority is based on current month's sold-unit count, not hypothetical revenue. `resolve_product_recipe_verification_v2` refreshes historical COGS and may recalculate inventory consumption; approval `effective_from` must be simulated on staging before the first production authorization.

**3 (Dry-run):** simulate proposed adjustments by individual SKU and BASE UNIT, including the exact date interval after physical opname, duplicated receipt detection, same-day ambiguous movements, negative balances and HPP impacts. Do not add or sum mixed units across SKUs.

**4 (Pilot):** only after documented receipt proof, explicit Owner decisions, idempotency tests, staging rollback/reversal verification and separate post-ledger reconciliation.

## Recovery and stop-conditions

- Stage2 code is UI+manual SELECT only: revert the UI PR to restore the previous audit; database balances remain unchanged.
- Stop any future posting if original purchase unit remains unknown, BOM source units mismatch, references duplicate, effective dates overlap opname ambiguously, or conversion proof is absent.
- Run `supabase/manual/hsn_stock_recovery_stage2_preview_readonly.sql` in a trusted SQL editor; archive results outside public GitHub. The SQL is `READ ONLY` and does not mutate any data.
- KPI "success" must mean source→ledger coverage is complete, not merely that backend triggers are active.
