# Hasnaria dual-source sales and SKU/BOM: production-safe rollout

Status: **Phase 1 proposed in draft PR; NOT LIVE**. Branch `feature/dual-source-sales-stage1-safe-import`. Do not merge before CI, Supabase staging migration, Owner UAT and regression checks.

## Four inputs, distinct contracts

1. **Majoo Products master**: 72 external product SKUs (72 unique; 70 mapped existing products), no sales or stock movement. Existing private `hasnaria_import_review.product_aliases` batch `majoo_20261108_0820`; NEVER blindly overwrite `products.sku` because 6 products retain legacy internal sales codes.
2. **Majoo Recipe export**: 61 ingredient SKUs, 153 components for 56 recipes. Existing private `hasnaria_import_review.ingredient_aliases` and `bom_lines`, currently `under_review` and never approved. `FO20` product and `#FO20` ingredient MUST retain separate namespaces. A candidate name match is not unit conversion approval.
3. **Majoo Detail Transactions CSV**: canonical transaction identifier, date, time, gross receipt and payment method. Existing `sales`/`sale_items` importer requires ID/date. Some source transaction rows contain only comma-separated product names (no individual item qty): do **not** manufacture 1-unit item counts or permit these rows to post stock or true per-SKU COGS.
4. **Majoo Product Sales monthly report**: SKU, exact monthly quantity, reported sales, reported COGS, refund. Persist only in `sales_product_report_batches` + `sales_product_report_lines` for review. There is no transaction ID/date-by-SKU; do NOT fabricate daily events.

## Phase 1 database gate

- Add `sales_product_report_batches` / `sales_product_report_lines`, restricted to authenticated Owner and the authenticated user's brand.
- One RPC `stage_sales_product_report_v1` inserts a complete batch+rows in one Postgres transaction. Validation error rolls back all writes.
- Reimport of same SHA256 + same normalized payload is idempotent. A same-hash different payload fails closed. Different files for same month are separate *draft revisions*; nothing automatically replaces or adds to canonical sales.
- `sales_product_report_reconciliation_v1` is read-only and compares by brand+outlet+month, showing partial coverage rather than inventing missing days.
- No triggers, writes, or alterations to `sales`, `sale_items`, `daily_metrics`, `inventory_recipe_components`, `product_recipe_verifications`, `inventory_movements`, purchase tables, or HPP.
- This migration is a repository proposal, **not applied to production**. Ensure the migration applied to Supabase matches the GitHub migration history when released.

## Known October 2026 baseline (read-only DB audit, 2026-11-08)

- Canonical `sales`: 484 transactions dated Oct 1–18, total Rp12,668,500; `sale_items`: 1,035 item rows with `unit_price = 0`, `unit_cogs = 0`.
- Uploaded full-month transaction CSV: 824 unique transaction IDs, Rp21,614,500 gross; product strings 1,823 appearances, not proven to represent item quantity.
- Uploaded monthly product report: 54 sold SKUs, 2,604 units, Rp20,992,500 product sales, reported HPP Rp10,345,955, 4 refunds / Rp35,000.
- Difference between gross transaction CSV and product-sales report = Rp622,000; **not reconciled**. Do not aggregate them.
- Existing BOM staging: 72 product aliases; 61 ingredient aliases (56 have inventory candidates); 153 BOM lines. 18 candidate 1:1 factors, no recipes approved.
- Oct inventory ledger movements = 0. No stock backfill before verifying BOM and physical checkpoints.

## Phase-by-phase implementation and release gates

| Stage | Implementation | Gate |
|---|---|---|
| 1 | Audit, immutable baseline, independent PR, migration plan | No changes to canonical production |
| 2 | Four-file master SKU/BOM mapping, safety review | Owner approves alias + physical units + BOM effective dates |
| 3 | Two source parsers and atomic staging RPCs, hash/version model | 1:1 raw reconciliation, duplicate import idempotent |
| 4 | One Upload Penjualan button with Detail / Rekap choices and preview | Preview stays read-only, one-view 100%, no flicker |
| 5 | Per-outlet monthly dual-source reconciliation | Sales/refund/HPP differences explained; no double count |
| 6 | Only approved sales basis × verified BOM × verified conversions → inventory ledger | Exactly-once source key, effective date, physical checkpoint, no negative or draft posting |
| 7 | Regression, CI and Vercel Preview smoke, phased rollout feature flag | All tests pass, Owner visual UAT, recovery rehearsal |

## Test matrix: must block production promotion if any fails

- Parsing: unknown headers, empty rows, missing date-range, duplicate SKUs, same SKU with changed case or spaces, invalid numerics, negative unit quantity, refund > gross quantity, missing SKU, dates spanning months.
- Auth: anonymous, cross-brand, Staff/PIC/Head-of-Store import denied; Owner same-brand allowed.
- Atomicity: invalid row 53 of 54 aborts *both* batch and all lines.
- Idempotency: same SHA256 & same payload returns same batch; same SHA256 & modified rows is refused.
- Versioning: second different monthly file is draft revision, not auto-add to KPI.
- Reconciliation: 1–18 vs 1–31 Oct dates flagged incomplete; 824 transaction records not counted as 824 SKUs; no invented daily curves.
- BOM: `FO20` != `#FO20`; 54 recipes remain unverified until explicit signoff; `pack`/ `porsi` factor missing blocks posting; the Wafel Cone ingredient remains unresolved.
- Stock: no sale consumption from raw summary, no duplicate consumption from detail; rollback on posting error.
- Regression: sale dashboard, product rankings, finance source coverage, purchases, stock one-view and loading all match pre-change baseline.

## Recovery

- BEFORE migration release: abandon draft PR, zero production impact.
- AFTER additive migration but BEFORE feature flag: disable staging upload route; legacy importer remains unchanged. Do **not** run destructive DROP in production during recovery.
- AFTER activation: disable flag, reject new imports, keep audit batches, restore official metric source to the previous one only after verified reconciliation; reverse ledger entries via approved audit correction, never delete historical financial events.

## Implementation note

The existing frontend `sales-board.js` loads `sales-import-v2.js`, a **Detail Transactions-only importer**. The multipart legacy parser advertises a product report format but is overridden by the normalized importer. It must **not** be revived; old parsing would spread monthly SKU totals evenly across dates and create fictitious daily sales. A future explicit product-report upload route should invoke the staging RPC; its user-visible label must say **Draft / Pending Review** until signed off.

When building a real parser, accept only stable SKU identities. Store the raw report numbers; never derive per-product revenue from static `PRICE_MAP`.


## Singapore actual-source UAT — 2026-11-08 (not production)

Validated against all four uploaded Majoo source exports.

| Input | SHA256 | Audited data |
|---|---|---|
| Product Master | 694f457a0bfc503ccf046867646234509d6eaa6761efa763c3954f31d944532a | 72 SKU |
| Recipe Master | 02b5e9ca8ff47a7eb83c876c17fe651a8eeaa08f321831ecfa305cfc8e2715d8 | 61 ingredients, 153 BOM rows |
| Detail Transactions CSV | 21277146db1163fb14b30d75aafdaf0686ed79e32ba15861c5624ca60ba494a9 | 824 unique receipts, 31 days, Rp21,614,500 gross, 1,823 product-name occurrences |
| Monthly Product Sales | ea801b3a0d2eb33ea135aba187daf04371acb3a49990eccb104b2ea46947f648 | 54 sold SKU, 2,604 gross units, Rp20,992,500 product sales |

Singapore staging project rynnpndtzjwpekbiwiif; isolated synthetic test brand. Production proposal migration 20261108093000_dual_source_sales_product_report_staging_v1.sql was applied to Singapore only. The 54 real monthly report rows are saved under synthetic test Owner as UNDER_REVIEW, cannot post stock. The two master exports are copied into private hasnaria_uat source snapshots without reusing production product or inventory UUID mappings. The Detail CSV is represented in Singapore by its source SHA256, actual daily totals and payment aggregates, not invented per-SKU transactions.

### Reconciliation UAT

- 54/54 sold SKUs exist in the 72-SKU product master.
- 47 sold SKUs have exported BOM, covering 2,300 / 2,604 units. Seven SKU without exported BOM account for 304 units: FO92, FO51, DD91, DR56, DD95, FO91, FO41.
- All 153 BOM components have a valid product and ingredient SKU.
- Private read-only hasnaria_uat.raw_bom_demand_preview_v1 contains 55 ingredient/source-unit groups, all with stock_posting_allowed=false and conversion_verified=false.
- Monthly Majoo HPP rounded per line = Rp10,345,955.24; sum of displayed item gross profits = Rp10,626,232.08 vs Majoo footer Rp10,626,232.07 (Rp0.01 rounding).
- Gross transactions Rp21,614,500 vs monthly product report Rp20,992,500 = Rp622,000 unexplained.
- Product-name occurrences in CSV = 1,823, which is not per-SKU quantity; 2,604 monthly SKU units cannot be allocated to days.
- Staging canonical sales rows, sale items and inventory ledger movements remain 0. Tests of Owner and non-Owner RLS, checksum deduplication, immutable snapshots, and malformed-file rollback all passed in transactions that were rolled back.

### Release protection

- Main production remains unchanged; PR #185 stays draft.
- Singapore-only schema scripts live under supabase/uat/singapore/, not supabase/migrations/. CI blocks accidental release of private UAT schema.
- Before go-live, reconcile Rp622,000 and seven BOM-less SKUs; validate physical units, effective recipe dates and stock baseline with Owner approval.
- New monthly report is NOT an automatic source of daily financial metrics, per-SKU item transactions or inventory postings.
